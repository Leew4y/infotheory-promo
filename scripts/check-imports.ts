/**
 * Enforce the dependency direction films -> styles -> engine.
 *
 *   bun scripts/check-imports.ts [--json]
 *
 * engine/**          may import only engine/** (and packages)
 * styles/<id>/**     may import engine/** and its own styles/<id>/**; not films/, not other styles
 * films/<id>/**      may import engine/index.ts (the public API), styles/<x>/index.ts, and its own films/<id>/**;
 *                    not another film, not templates/
 * templates/film/** the rules of a film (copied into films/ by just new-film)
 * templates/style/** the rules of a style package (copied into styles/ by just new-style)
 *
 * Runtime imports (static, re-exports, dynamic with a literal specifier) come from Bun's own import scanner, which
 * handles any syntax and ignores comments and strings. Type-only imports, which the scanner drops, and Vite's
 * import.meta.glob(...) patterns are found by a pattern pass over the source with comments removed and string contents
 * blanked (so text inside strings never matches). A glob pattern is checked by its static directory prefix.
 * Specifiers starting with "/" are project-root paths (as Vite resolves them); bare names are packages. A dynamic
 * import() or import.meta.glob() whose argument is not a string literal cannot be checked and is an error.
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
/** Resolve a project-root specifier ("/films/x/y") like the bundler does. */
function resolveRoot(spec: string): string {
  return resolve(path.join(ROOT, '_'), '.' + spec);
}
/** The same text with the contents of every string and template literal replaced by spaces (positions kept). */
function blankStrings(code: string): string {
  let out = '', i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < code.length && code[j] !== c) j += code[j] === '\\' ? 2 : 1;
      out += c + ' '.repeat(Math.max(0, Math.min(j, code.length) - i - 1)) + (j < code.length ? c : '');
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
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
  // templates/style/ is a style package (copied into styles/ by just new-style): the style rules, its own folder only
  if (top === 'styles' || (top === 'templates' && fid === 'style')) {
    if (tt === 'films') return `${top}/${fid} may not import films/`;
    if ((tt === 'styles' || tt === 'templates') && !(tt === top && tid === fid)) return `${top}/${fid} may not import another style or template (${target})`;
    if (tt !== 'engine' && tt !== top) return `${top}/${fid} may import only engine/ and its own package (${target})`;
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
    const blank = blankStrings(code); // same positions; matches can only come from code, never from text in strings
    for (const re of TYPE_ONLY)
      for (const m of blank.matchAll(new RegExp(re.source, 'gd'))) {
        const [a, b] = m.indices![2]!;
        specs.add(code.slice(a, b));
      }
    for (const m of blank.matchAll(/\bimport\s*\(\s*([^)\s][^)]*)\)/g))
      if (!/^(['"])[^'"]*\1$/.test(m[1].trim())) diags.push({ level: 'error', code: 'import-dynamic', path: file, message: `dynamic import with a non-literal specifier cannot be checked: import(${code.slice(m.index!, m.index! + m[0].length)})` });
    // import.meta.glob('pattern' | ['p1', 'p2'], ...): every literal pattern, by its static directory prefix
    for (const m of blank.matchAll(/\bimport\.meta\.glob\s*\(\s*/g)) {
      const at = m.index! + m[0].length;
      const lit = /^(['"])([^'"]*)\1/;
      const pats: string[] = [];
      if (lit.test(code.slice(at))) pats.push(code.slice(at).match(lit)![2]);
      else if (code[at] === '[') {
        const end = code.indexOf(']', at);
        const body = code.slice(at + 1, end < 0 ? at + 1 : end).split(',').map((x) => x.trim()).filter(Boolean);
        for (const x of body) { const mm = x.match(lit); if (mm) pats.push(mm[2]); else pats.push('\0'); }
      } else pats.push('\0');
      for (const p of pats) {
        if (p === '\0') { diags.push({ level: 'error', code: 'import-glob', path: file, message: 'import.meta.glob() with a non-literal pattern cannot be checked' }); continue; }
        if (p.startsWith('!')) continue; // a negative pattern only removes files
        const stat = p.slice(0, p.search(/[*?{[]/) < 0 ? p.length : p.search(/[*?{[]/));
        const dir = stat.slice(0, stat.lastIndexOf('/') + 1) || './';
        specs.add(`${dir}${dir.endsWith('/') ? '' : '/'}*`);
      }
    }
    for (const spec of specs) {
      if (!spec.startsWith('.') && !spec.startsWith('/')) continue; // packages
      const target = spec.startsWith('/') ? resolveRoot(spec) : resolve(f, spec);
      const bad = verdict(top, file, target);
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
