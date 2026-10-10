/**
 * Plan checks without building or running the film. --json writes only diagnostics to stdout.
 * Copy is a deliberate heuristic: decoded literal text containing CJK or >= 4 English words must equal a plan
 * text. Comments are ignored; template text parts are checked individually. Computed text cannot be proved here.
 * Registration uses direct planScene('<id>', ...) calls; the boot check enforces actual registrations as well.
 */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { BriefSpec, FilmPlanSpec, PlanPathSpec, planNarration, planTexts, type FilmPlan } from '../engine/plan';
import { checkNarrationLock, type NarrationLock } from '../engine/narration';
import { literals } from './literals';
import { filmArg } from './film-arg';
import { confined } from './lib/confine';
import { planSchemas, ROOT } from './plan-schema';

export interface PlanDiag { level: 'error' | 'warning'; code: string; path: string; message: string }
const rel = (file: string) => path.relative(ROOT, file).replace(/\\/g, '/');
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
const diagnostic = (code: string, file: string, text: string): PlanDiag => ({ level: 'error', code, path: rel(file), message: text });

/** Schema-only entry used before scaffold writes anything (also checks the film identity). */
export function readPlan(dir: string, id: string): { plan?: FilmPlan; diagnostics: PlanDiag[] } {
  const file = path.join(dir, 'film-plan.json');
  try {
    const parsed = FilmPlanSpec.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (!parsed.success) return { diagnostics: parsed.error.issues.map((i) => ({
      ...diagnostic('plan-schema', file, i.message), path: `${rel(file)}:${i.path.join('.') || '(root)'}`,
    })) };
    if (parsed.data.film !== id) return { diagnostics: [diagnostic('plan-schema', file, `film must be "${id}"`)] };
    return { plan: parsed.data, diagnostics: [] };
  } catch (e) { return { diagnostics: [diagnostic('plan-schema', file, message(e))] }; }
}

/** Comments and literal contents blanked, offsets preserved; quotes remain for locating literal arguments. */
function mask(src: string): string {
  return src.replace(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`/g,
    (s) => s.startsWith('/') ? ' '.repeat(s.length) : s[0] + ' '.repeat(s.length - 2) + s.at(-1));
}

const nonempty = z.string().refine((s) => !!s.trim(), 'must not be empty');
const AssetsSpec = z.array(z.strictObject({
  path: PlanPathSpec.refine((s) => s.startsWith('assets/'), 'expected assets/<file>'),
  kind: nonempty, source: nonempty, license: nonempty, sha256: z.string().regex(/^[a-f0-9]{64}$/),
  generator: z.string().optional(), seed: z.union([z.string(), z.number().finite()]).optional(), notes: z.string().optional(),
}));

export function checkPlan(id: string, options: { schemaDir?: string } = {}): PlanDiag[] {
  const dir = path.join(ROOT, 'films', id), file = path.join(dir, 'film-plan.json');
  const { plan: p, diagnostics: diags } = readPlan(dir, id);
  const err = (code: string, file: string, text: string) => diags.push(diagnostic(code, file, text));
  for (const [name, data] of Object.entries(planSchemas())) {
    const f = path.join(options.schemaDir ?? path.join(ROOT, 'schemas'), name);
    if (!existsSync(f) || readFileSync(f, 'utf8') !== data) err('plan-schema-stale', f, 'JSON schema is stale; run just plan-schema');
  }
  const brief = path.join(dir, 'brief.json');
  if (existsSync(brief)) {
    try {
      const r = BriefSpec.safeParse(JSON.parse(readFileSync(brief, 'utf8')));
      if (!r.success) for (const i of r.error.issues) diags.push({ ...diagnostic('plan-brief', brief, i.message), path: `${rel(brief)}:${i.path.join('.')}` });
    } catch (e) { err('plan-brief', brief, message(e)); }
  }
  if (!p) return diags;
  for (const style of p.styles) for (const name of ['index.ts', 'fonts.json'])
    if (!existsSync(path.join(ROOT, 'styles', style, name))) err('plan-style', file, `styles/${style}/${name} does not exist`);
  for (const s of p.scenes) if (s.capture && !confined(dir, s.capture.asset)) err('plan-capture', file, `scene ${s.id}: capture manifest ${s.capture.asset} does not exist inside this film`);

  const scenes = path.join(dir, 'scenes'), expected = p.scenes.map((s) => s.id), texts = new Set(planTexts(p));
  for (const id of expected) if (!existsSync(path.join(scenes, `${id}.ts`))) err('plan-module-missing', path.join(scenes, `${id}.ts`), `missing scene module; run just scaffold ${p.film}`);
  const scanner = new Bun.Transpiler({ loader: 'ts' });
  for (const name of existsSync(scenes) ? readdirSync(scenes).filter((n) => n.endsWith('.ts') && n !== 'index.ts') : []) {
    const f = path.join(scenes, name), src = readFileSync(f, 'utf8'), id = name.slice(0, -3);
    if (!expected.includes(id)) err('plan-module-extra', f, 'scene module is not in the plan');
    try { scanner.scan(src); } catch (e) { err('plan-module-register', f, message(e)); continue; }
    const blank = mask(src), calls = [...blank.matchAll(/\bplanScene\s*\(/g)];
    const ids = calls.map((c) => {
      const at = c.index! + c[0].length, m = /^\s*(['"])[^'"]*\1\s*,/.exec(blank.slice(at));
      return m ? literals(src.slice(at, at + m[0].length))[0] : null;
    });
    if (ids.length !== 1 || ids[0] !== id) err('plan-module-register', f, `expected exactly planScene('${id}', ...); found ${JSON.stringify(ids)}`);
    if (/\b(?:scene|demoScene|narratedScene)\s*\(/.test(blank)) err('plan-module-register', f, 'plan modules register only with planScene; timing and content come from the plan');
    // Words are whitespace-separated: an import path's slash/dot components are not prose words.
    for (const text of literals(src)) if ((/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text) || text.trim().split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length >= 4) && !texts.has(text))
      err('plan-copy', f, `literal is not plan text: ${JSON.stringify(text)}; use copy(sceneId, key)`);
  }
  const index = path.join(scenes, 'index.ts');
  try {
    const src = readFileSync(index, 'utf8'), scanned = scanner.scanImports(src);
    const imports = scanned.map((i) => i.path.replace(/^\.\//, '').replace(/\.ts$/, ''));
    if (scanned.some((i) => i.kind !== 'import-statement') || /\b(?:planScene|scene|demoScene|narratedScene)\s*\(/.test(mask(src)) || JSON.stringify(imports) !== JSON.stringify(expected))
      err('plan-index-order', index, `expected only static scene imports [${expected.join(', ')}], got [${imports.join(', ')}]`);
  } catch (e) { err('plan-index-order', index, message(e)); }

  const script = planNarration(p), lock = path.join(dir, 'narration.lock.json');
  if (script.lines.length) {
    try { checkNarrationLock(script, JSON.parse(readFileSync(lock, 'utf8')) as NarrationLock, id); }
    catch (e) { err('plan-narration-lock', lock, `${message(e)}; run just narrate ${id}`); }
  }
  const assetFile = path.join(dir, 'assets.json'), assetDir = path.join(dir, 'assets');
  try {
    const entries = AssetsSpec.safeParse(existsSync(assetFile) ? JSON.parse(readFileSync(assetFile, 'utf8')) : []);
    if (!entries.success) for (const i of entries.error.issues) diags.push({ ...diagnostic('plan-assets', assetFile, i.message), path: `${rel(assetFile)}:${i.path.join('.')}` });
    const listed = new Set<string>();
    for (const e of entries.success ? entries.data : []) {
      if (listed.has(e.path)) err('plan-assets', assetFile, `duplicate asset ${e.path}`);
      listed.add(e.path);
      const f = confined(dir, e.path);
      if (!f) err('plan-asset-missing', assetFile, `${e.path} does not exist inside this film`);
      else if (createHash('sha256').update(readFileSync(f)).digest('hex') !== e.sha256) err('plan-asset-sha256', assetFile, `${e.path}: sha256 does not match`);
    }
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const f = path.join(d, n), st = lstatSync(f);
        if (st.isSymbolicLink()) { err('plan-assets', f, 'assets must be regular files/directories, not links'); continue; }
        if (st.isDirectory()) walk(f);
        else if (!listed.has(path.relative(dir, f).replace(/\\/g, '/'))) err('plan-asset-unlisted', f, 'asset is not listed in assets.json');
      }
    };
    if (existsSync(assetDir)) {
      if (lstatSync(assetDir).isSymbolicLink()) err('plan-assets', assetDir, 'assets directory must not be a link');
      else walk(assetDir);
    }
  } catch (e) { err('plan-assets', assetFile, message(e)); }
  return diags;
}

if (import.meta.main) {
  const args = Bun.argv.slice(2), json = args.includes('--json');
  try {
    parseArgs({ args, options: { film: { type: 'string' }, json: { type: 'boolean' } } });
    const r = filmArg(args);
    if (r.error !== undefined) throw new Error(r.error);
    const diags = checkPlan(r.film), errors = diags.filter((d) => d.level === 'error').length;
    if (json) console.log(JSON.stringify(diags, null, 1));
    else for (const d of diags) console.log(`${d.level}: ${d.code} ${d.path}: ${d.message}`);
    (json ? console.error : console.log)(`${errors ? 'FAIL' : 'PASS'} plan-check ${r.film}: ${errors} error(s)`);
    process.exitCode = errors ? 1 : 0;
  } catch (e) {
    if (json) console.log(JSON.stringify([{ level: 'error', code: 'usage', path: 'argv', message: message(e) }]));
    console.error(message(e)); process.exitCode = 2;
  }
}
