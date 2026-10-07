/**
 * Enforce the dependency direction films -> styles -> engine.
 *
 *   bun scripts/check-imports.ts [--json]
 *
 * engine/**          may import only engine/** (and packages)
 * styles/<id>/**     may import engine/** and its own styles/<id>/**; not films/, not other styles
 * films/<id>/**      may import engine/index.ts (the public API), styles/<x>/index.ts, and its own films/<id>/**;
 *                    not another film, not templates/
 * templates/<id>/**  the same rules as a film (a template is copied into films/ by just new-film)
 *
 * Runtime imports (static, re-exports, dynamic with a literal specifier) come from Bun's own import scanner, which
 * handles any syntax and ignores comments and strings. Type-only imports, which the scanner drops, are found by a
 * pattern pass over the source with comments removed. A dynamic import() whose specifier is not a string literal
 * cannot be checked and is an error.
 * Diagnostics: { level, code, path, message }. With --json, stdout is only the JSON list and the summary goes to
 * stderr. Exit code 1 on any error.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const JSON_OUT = Bun.argv.includes('--json');
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, '/');
interface Diag { level: 'error' | 'warning'; code: string; path: string; message: string }
const diags: Diag[] = [];
const scanner = new Bun.Transpiler({ loader: 'ts' });

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|js|mjs)$/.test(n)) out.push(p);
  }
  return out;
}
/** Resolve a relative specifier to a repo path, adding .ts / index.ts like the bundler does. */
function resolve(from: string, spec: string): string {
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
    try { if (statSync(c).isFile()) return rel(c); } catch {}
  }
  return rel(base);
}
/** Remove // and block comments, keeping string and template literals intact. */
function stripComments(src: string): string {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 2; out += ' '; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
const TYPE_ONLY = [
  /\bimport\s+type\b[^;]*?\bfrom\s*(['"])([^'"]+)\1/g,
  /\bimport\s*\{[^}]*\btype\s+[^}]*\}\s*from\s*(['"])([^'"]+)\1/g,
  /\bexport\s+type\b[^;]*?\bfrom\s*(['"])([^'"]+)\1/g,
];

function verdict(top: string, file: string, target: string): string | null {
  const [tt, tid] = target.split('/');
  const [, fid] = file.split('/');
  if (top === 'engine') return tt === 'engine' ? null : 'engine may import only engine/';
  if (top === 'styles') {
    if (tt === 'films') return 'styles may not import films/';
    if (tt === 'styles' && tid !== fid) return `styles/${fid} may not import another style (${target})`;
    if (tt !== 'engine' && tt !== 'styles') return `styles may import only engine/ and their own package (${target})`;
    return null;
  }
  if (tt === 'engine' && target !== 'engine/index.ts') return `films may import only the engine's public API engine/index.ts, not ${target}`;
  if (tt === 'styles' && !/^styles\/[^/]+\/index\.ts$/.test(target)) return `films may import a style only through styles/<id>/index.ts, not ${target}`;
  if ((tt === 'films' || tt === 'templates') && !(tt === top && tid === fid)) return `${top}/${fid} may import only its own ${top}/${fid}/, not ${target}`;
  if (!['engine', 'styles', 'films', 'templates'].includes(tt)) return `${top} may not import ${target}`;
  return null;
}

let filesChecked = 0;
for (const top of ['engine', 'styles', 'films', 'templates']) {
  let files: string[] = [];
  try { files = walk(path.join(ROOT, top)); } catch { continue; }
  for (const f of files) {
    filesChecked++;
    const file = rel(f);
    const src = readFileSync(f, 'utf8');
    const specs = new Set<string>();
    try {
      for (const im of scanner.scanImports(src)) specs.add(im.path);
    } catch (e) {
      diags.push({ level: 'error', code: 'import-parse', path: file, message: `cannot scan imports: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    const code = stripComments(src);
    for (const re of TYPE_ONLY) for (const m of code.matchAll(re)) specs.add(m[2]);
    for (const m of code.matchAll(/\bimport\s*\(\s*([^)\s][^)]*)\)/g))
      if (!/^(['"])[^'"]*\1$/.test(m[1].trim())) diags.push({ level: 'error', code: 'import-dynamic', path: file, message: `dynamic import with a non-literal specifier cannot be checked: import(${m[1].trim()})` });
    for (const spec of specs) {
      if (!spec.startsWith('.')) continue; // packages
      const bad = verdict(top, file, resolve(f, spec));
      if (bad) diags.push({ level: 'error', code: 'import-direction', path: file, message: `${spec} -> ${bad}` });
    }
  }
}

const summary = `${diags.length ? 'FAIL' : 'PASS'} check-imports: ${filesChecked} files, ${diags.length} error(s)`;
if (JSON_OUT) {
  console.log(JSON.stringify(diags, null, 1));
  console.error(summary);
} else {
  for (const d of diags) console.log(`${d.level}: ${d.path}: ${d.message}`);
  console.log(summary);
}
process.exit(diags.length ? 1 : 0);
