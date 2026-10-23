/**
 * Every text of a film, for fact-checking: what is displayed and what the voice says.
 *
 *   bun scripts/texts.ts --film <id> [--style <id>] [--out out/<id>]     (just texts <film>: builds first)
 *
 * Writes <out>/texts.md (to read) and <out>/texts.json (the same, structured). Scene by scene, in film order, with
 * film times from the built page (dist/<film>/, the default style unless --style):
 * - a plan film's displayed text from film-plan.json: each scene's title (the chapter label when it has a chapter),
 *   copy by key, captions with their times, the capture window's title;
 * - every narration line (film-plan.json lines, else narration.json) under its scene, with where it plays, its text
 *   (the captions), `read` (what the voice says, when it differs) and `en`;
 *   a line with no caption on screen while it plays (a line the scene shows itself, narratedScene `shown`) is marked;
 * - the string and template literals (scripts/literals.ts, comments skipped) of every film source file the film's
 *   entry imports: what scene code draws (in a hand-written film also its captions and chapter labels, which have no
 *   times here). The file scenes/<id>.ts that names scene <id> is listed under that scene, the others after the scenes.
 *   Literals that look like text are listed one by one; lowercase identifiers (scene names, sound cues, alignment)
 *   are put together on one line, import paths left out. Computed text (numbers formatted at run time) is not a
 *   literal: films/<film>/fonts.extra.txt, if present, is listed for it.
 * The page is only needed for times: if it does not load (e.g. a first frame that needs capture frames this machine
 * does not have), the texts are written without times and the file says why. Exit code 1 on failure, 2 on bad
 * arguments.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import puppeteer, { type Browser } from 'puppeteer-core';
import { FilmPlanSpec, planNarration, type FilmPlan } from '../engine/plan';
import type { LinePlacement, NarrationLine } from '../engine/narration';
import { chromeArgs, findChrome, loadFilm, serveDist } from './chrome';
import { mediaDir, requireFilm } from './film-arg';
import { literals } from './literals';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const usage = (m: string): never => { console.error(m); process.exit(2); };
let o: { style?: string; out?: string; dist?: string } = {};
try {
  o = parseArgs({ args: argv, options: { film: { type: 'string' }, style: { type: 'string' }, out: { type: 'string' }, dist: { type: 'string' } } }).values;
} catch (e) { usage(e instanceof Error ? e.message : String(e)); }
const FILM = requireFilm(argv);
const DIR = path.join(ROOT, 'films', FILM);
const OUT = path.resolve(ROOT, o.out ?? `out/${FILM}`);
const DIST = path.resolve(ROOT, o.dist ?? `dist/${FILM}`);
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, '/');
const q = (s: string) => JSON.stringify(s);
/** m:ss.ss, rounded to hundredths first (so 59.999 s reads 1:00.00). */
const clock = (t: number) => { const c = Math.round(t * 100); return `${Math.floor(c / 6000)}:${((c % 6000) / 100).toFixed(2).padStart(5, '0')}`; };
const span = (a: number, b: number) => `${clock(a)}–${clock(b)}`;

// ---- what the sources say
const planFile = path.join(DIR, 'film-plan.json');
const plan: FilmPlan | null = existsSync(planFile) ? FilmPlanSpec.parse(JSON.parse(readFileSync(planFile, 'utf8'))) : null;
const narrationFile = path.join(DIR, 'narration.json');
const script: NarrationLine[] = plan ? planNarration(plan).lines
  : existsSync(narrationFile) ? (JSON.parse(readFileSync(narrationFile, 'utf8')).lines ?? []) : [];

/** The film's own source files the entry imports, in import order (main.ts first). */
function sourceFiles(): string[] {
  const scanner = new Bun.Transpiler({ loader: 'ts' });
  const seen: string[] = [];
  const visit = (f: string) => {
    if (seen.includes(f)) return;
    seen.push(f);
    for (const imp of scanner.scanImports(readFileSync(f, 'utf8'))) {
      if (!imp.path.startsWith('.')) continue;
      const base = path.resolve(path.dirname(f), imp.path);
      const hit = [base, `${base}.ts`, path.join(base, 'index.ts')].find((c) => c.endsWith('.ts') && existsSync(c));
      if (hit && hit.startsWith(DIR + path.sep)) visit(hit);
    }
  };
  visit(path.join(DIR, 'main.ts'));
  return seen;
}
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
/** Lowercase identifiers: scene names, sound cues, alignment and other code words (not shown one by one). */
const CODE = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;
const files = sourceFiles().map((f) => {
  const src = readFileSync(f, 'utf8');
  const imports = new Set(new Bun.Transpiler({ loader: 'ts' }).scanImports(src).map((i) => i.path));
  const text: string[] = [], other: string[] = [];
  for (const s of literals(src)) {
    if (!s.trim() || imports.has(s) || /^\.{1,2}\//.test(s)) continue;
    const to = !CJK.test(s) && CODE.test(s) ? other : text;
    if (!to.includes(s)) to.push(s);
  }
  // the scene module scenes/<id>.ts that names its scene (registration: name: '<id>' or planScene('<id>', ...))
  const own = path.dirname(f) === path.join(DIR, 'scenes') ? path.basename(f, '.ts') : '';
  return { file: rel(f), ...(own && other.includes(own) ? { scene: own } : {}), text, other };
}).filter((f) => f.text.length || f.other.length);
const extraFile = path.join(DIR, 'fonts.extra.txt');
const extra = existsSync(extraFile) ? readFileSync(extraFile, 'utf8') : null;

// ---- times, from the built page
interface PageScene { name: string; kind: string; start: number; end: number }
let timing: { style: string; fps: number; duration: number; punctuation: string; scenes: PageScene[]; placements: LinePlacement[]; subs: [number, number][] } | null = null;
let noTiming = '';
if (!existsSync(path.join(DIST, 'index.html'))) noTiming = `${rel(DIST)}/index.html missing (run just build ${FILM})`;
else {
  const server = serveDist(DIST, { media: mediaDir(FILM) });
  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }, args: chromeArgs('platform') });
    const page = await browser.newPage();
    const loaded = await loadFilm(page, server.url, FILM, o.style ?? '', 30_000);
    const tl = await page.evaluate(() => window.__timeline());
    timing = {
      style: loaded.style, fps: tl.fps, duration: tl.duration,
      punctuation: await page.evaluate(() => window.__punctuation?.() ?? ''),
      scenes: tl.scenes.map((s) => ({ name: s.name, kind: s.kind, start: s.start, end: s.end })),
      placements: (await page.evaluate(() => window.__narration())).placements,
      subs: (await page.evaluate(() => window.__scenes())).flatMap((s) => s.subs),
    };
  } catch (e) {
    if (o.style) { console.error(`texts: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); }
    noTiming = `the page did not load: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`;
  } finally {
    await browser?.close().catch(() => {});
    server.stop();
  }
}

// ---- one entry per scene, in film order
const at = new Map(timing?.placements.map((p) => [p.id, p]) ?? []);
const planScenes = new Map(plan?.scenes.map((s) => [s.id, s]) ?? []);
const order: { name: string; kind: string; start?: number; end?: number }[] = timing?.scenes
  ?? (plan ? plan.scenes.map((s) => ({ name: s.id, kind: s.kind })) : [...new Set(script.map((l) => l.scene))].map((name) => ({ name, kind: '?' })));
const scenes = order.map((s) => {
  const p = planScenes.get(s.name);
  const t0 = s.start ?? 0;
  const narration = script.filter((l) => l.scene === s.name).map((l) => {
    const pl = at.get(l.id);
    // captioned: a caption is on screen while the line plays (a line the page shows itself has none)
    const captioned = pl && timing ? timing.subs.some(([a, b]) => a < pl.t + pl.dur && b > pl.t) : undefined;
    return {
      id: l.id, ...(pl ? { start: +pl.t.toFixed(3), end: +(pl.t + pl.dur).toFixed(3) } : {}), ...(captioned === false ? { captioned } : {}),
      text: l.text, ...(l.read !== undefined && l.read !== l.text ? { read: l.read } : {}), ...(l.en ? { en: l.en } : {}),
    };
  });
  return {
    id: s.name, kind: s.kind, ...(s.start !== undefined ? { start: s.start, end: s.end } : {}),
    ...(p?.chapter !== undefined ? { chapter: p.chapter } : {}),
    ...(p?.title ? { title: p.title } : {}),
    ...(p?.copy && Object.keys(p.copy).length ? { copy: p.copy } : {}),
    ...(p?.captions?.length ? { captions: p.captions.map(([a, b, zh, en]) => ({ start: +(t0 + a).toFixed(3), end: +(t0 + b).toFixed(3), zh, en })) } : {}),
    ...(p?.capture?.title ? { captureTitle: p.capture.title } : {}),
    narration,
  };
});
const placedScenes = new Set(order.map((s) => s.name));
const orphans = script.filter((l) => !placedScenes.has(l.scene)).map((l) => ({ id: l.id, scene: l.scene, text: l.text, read: l.read, en: l.en }));

const git = (args: string[]) => { const r = Bun.spawnSync(['git', ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'ignore' }); return r.exitCode === 0 ? r.stdout.toString().trim() : null; };
const commit = git(['rev-parse', 'HEAD']);
const dirty = git(['status', '--porcelain', '--', `films/${FILM}`]);
const doc = {
  film: FILM, commit, uncommitted: dirty ? dirty.split('\n').length : 0,
  ...(timing ? { style: timing.style, fps: timing.fps, duration: timing.duration, punctuation: timing.punctuation } : { timing: `no times: ${noTiming}` }),
  source: plan ? 'film-plan.json' : script.length ? 'narration.json and scene code' : 'scene code',
  scenes, ...(orphans.length ? { narrationNotInScenes: orphans } : {}), literals: files, ...(extra !== null ? { fontsExtra: extra } : {}),
};

// ---- the readable form
const md: string[] = [];
/** A file's literals: text one by one, identifiers on one line. */
function literalList(f: (typeof files)[number]): void {
  for (const t of f.text) md.push(`- ${q(t)}`);
  if (f.other.length) md.push(`${f.text.length ? '\n' : ''}Identifiers: ${f.other.map(q).join(', ')}`);
}
md.push(`# Texts of ${FILM}`, '');
md.push(`Every displayed and spoken text of films/${FILM}, for checking. Strings are quoted exactly as written in the sources (JSON quoting).`);
md.push(`Source: ${commit ? `commit ${commit}` : 'not a git checkout'}${dirty ? `, with uncommitted changes in films/${FILM}/ (${doc.uncommitted} path(s))` : ''}.`);
if (timing) {
  md.push(`Times: film time (m:ss.ss) from the built page, style ${timing.style}, ${timing.fps} fps, ${clock(timing.duration)} in all.`);
  if (timing.punctuation === 'display') md.push('On screen the film follows the display punctuation rule: a caption shows one sentence of its line at a time, and captions and large display lines drop a trailing ，、；：。 (AGENTS.md). The strings below are as written.');
} else md.push(`Times: none (${noTiming}).`);
md.push("A narration line's text is also its captions, unless it is marked (no caption): no caption is on screen while it plays (a line the scene shows itself).");
md.push(`Literals: every string and template-literal text part of the film's source files (scripts/literals.ts, comments skipped), without times${plan ? '' : ' (in this hand-written film they include the captions and chapter labels written in scene code)'}; a scene module scenes/<id>.ts that names its scene is listed under that scene. Lowercase identifiers (scene names, sound cues, alignment) are put together on one line, import paths left out.`);
md.push('');
scenes.forEach((s, i) => {
  md.push(`## ${i + 1}. ${s.id} (${s.kind}${s.start !== undefined ? `, ${span(s.start, s.end!)}` : ''})`, '');
  if (s.title) md.push(`- ${s.chapter !== undefined ? `chapter ${s.chapter} label` : 'title'}: ${q(s.title[0])}${s.title[1] ? ` / ${q(s.title[1])}` : ''}`);
  for (const [k, v] of Object.entries(s.copy ?? {})) md.push(`- copy.${k}: ${q(v)}`);
  if (s.captureTitle) md.push(`- capture window title: ${q(s.captureTitle)}`);
  for (const c of s.captions ?? []) md.push(`- caption ${span(c.start, c.end)}: ${q(c.zh)}${c.en ? ` / ${q(c.en)}` : ''}`);
  if (s.narration.length) {
    if (s.title || s.copy || s.captions || s.captureTitle) md.push('');
    md.push('Voice:', '');
    for (const l of s.narration) {
      md.push(`- ${'start' in l && l.start !== undefined ? `${span(l.start, l.end!)} ` : ''}\`${l.id}\`${'captioned' in l ? ' (no caption)' : ''}: ${q(l.text)}`);
      if (l.read) md.push(`  - read: ${q(l.read)}`);
      if (l.en) md.push(`  - en: ${q(l.en)}`);
    }
  }
  const code = files.find((f) => f.scene === s.id);
  if (code) {
    if (s.title || s.copy || s.captions || s.captureTitle || s.narration.length) md.push('');
    md.push(`Literals of ${code.file}:`, '');
    literalList(code);
  } else if (!s.title && !s.copy && !s.captions && !s.captureTitle && !s.narration.length) md.push('(no plan text, no narration and no scenes/<id>.ts naming it: see the literals below)');
  md.push('');
});
if (orphans.length) {
  md.push('## Narration lines in no scene', '');
  for (const l of orphans) md.push(`- \`${l.id}\` (scene ${q(l.scene)}): ${q(l.text)}`);
  md.push('');
}
md.push("## Literals in the film's other code", '');
md.push('The source files the film imports that are not one scene\'s module, file by file.', '');
for (const f of files.filter((f) => !f.scene)) {
  md.push(`### ${f.file}`, '');
  literalList(f);
  md.push('');
}
if (extra !== null) md.push(`## fonts.extra.txt`, '', 'Characters added to the font subsets for text made at run time:', '', q(extra), '');

mkdirSync(OUT, { recursive: true });
const write = (name: string, data: string) => {
  const f = path.join(OUT, name), tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, f);
  return f;
};
const jsonFile = write('texts.json', JSON.stringify(doc, null, 1) + '\n');
const mdFile = write('texts.md', md.join('\n'));
const lines = scenes.reduce((n, s) => n + s.narration.length, 0) + orphans.length;
console.log(`${scenes.length} scenes, ${lines} narration lines, ${files.reduce((n, f) => n + f.text.length, 0)} text literals in ${files.length} files${timing ? '' : ` (no times: ${noTiming})`} -> ${rel(mdFile)}, ${rel(jsonFile)}`);
