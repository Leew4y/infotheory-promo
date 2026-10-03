/**
 * Enforce the dependency direction films -> styles -> engine.
 *
 *   bun scripts/check-imports.ts [--json]
 *
 * engine/**          may import only engine/** (and packages)
 * styles/<id>/**     may import engine/** and its own styles/<id>/**; not films/, not other styles
 * films/<id>/**      may import engine/index.ts (the public API), styles/<x>/index.ts, and its own films/<id>/**
 * Diagnostics follow the plan's format { level, code, path, message }; exit code 1 on any error.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, '/');
interface Diag { level: 'error' | 'warning'; code: string; path: string; message: string }
const diags: Diag[] = [];

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

const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
for (const top of ['engine', 'styles', 'films']) {
  let files: string[] = [];
  try { files = walk(path.join(ROOT, top)); } catch { continue; }
  for (const f of files) {
    const file = rel(f);
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(IMPORT)) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue; // packages
      const target = resolve(f, spec);
      const [tt, tid] = target.split('/');
      const [, fid] = file.split('/');
      let bad: string | null = null;
      if (top === 'engine') {
        if (tt !== 'engine') bad = 'engine may import only engine/';
      } else if (top === 'styles') {
        if (tt === 'films') bad = 'styles may not import films/';
        else if (tt === 'styles' && tid !== fid) bad = `styles/${fid} may not import another style (${target})`;
        else if (tt !== 'engine' && tt !== 'styles') bad = `styles may import only engine/ and their own package (${target})`;
      } else {
        if (tt === 'engine' && target !== 'engine/index.ts') bad = `films may import only the engine's public API engine/index.ts, not ${target}`;
        else if (tt === 'styles' && !/^styles\/[^/]+\/index\.ts$/.test(target)) bad = `films may import a style only through styles/<id>/index.ts, not ${target}`;
        else if (tt === 'films' && tid !== fid) bad = `films/${fid} may not import another film (${target})`;
        else if (!['engine', 'styles', 'films'].includes(tt)) bad = `films may not import ${target}`;
      }
      if (bad) diags.push({ level: 'error', code: 'import-direction', path: file, message: `${spec} -> ${bad}` });
    }
  }
}

if (Bun.argv.includes('--json')) console.log(JSON.stringify(diags, null, 1));
else for (const d of diags) console.log(`${d.level}: ${d.path}: ${d.message}`);
console.log(`${diags.length ? 'FAIL' : 'PASS'} check-imports: ${diags.length} error(s)`);
process.exit(diags.length ? 1 : 0);
