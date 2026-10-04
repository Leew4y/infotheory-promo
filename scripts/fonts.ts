/**
 * Bundled fonts: download a style's pinned font sources, subset them to the film's characters, check coverage.
 *
 *   bun scripts/fonts.ts [--film infotheory] [--style paper-dawn] [--lock]
 *
 * 1. Sources come from styles/<style>/fonts.lock.json (URL pinned to an upstream commit, licence, sha256). Missing
 *    files are downloaded to .cache/fonts/ together with their licence text; a sha256 mismatch is an error.
 *    --lock records the sha256 of freshly downloaded files in the lock file (first download only).
 * 2. The film's character set: every character in string and template literals of films/<film>/**\/*.ts and of the
 *    style package, plus printable ASCII (digits and punctuation produced at run time).
 * 3. Each source is subset to that set (fonttools pyftsubset via uv, WOFF2) into films/<film>/fonts/, with
 *    manifest.json: family, style, weight range, role, file, sha256, source, licence, and the characters of the set
 *    each font lacks. scripts/validate.ts checks the text actually drawn against this manifest.
 * Needs uv (fonttools and brotli are fetched by `uv tool run`). Exit code 1 on a download or checksum failure.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const opt = (k: string, d: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const FILM = opt('film', 'infotheory');
const STYLE = opt('style', 'paper-dawn');
const LOCK = path.join(ROOT, 'styles', STYLE, 'fonts.lock.json');
const CACHE = path.join(ROOT, '.cache', 'fonts');
const OUT = path.join(ROOT, 'films', FILM, 'fonts');
const UV = process.env.UV ?? (existsSync(path.join(process.env.USERPROFILE ?? '', 'scoop', 'shims', 'uv.exe')) ? path.join(process.env.USERPROFILE!, 'scoop', 'shims', 'uv.exe') : 'uv');

interface Src { family: string; role: string; style: 'normal' | 'italic'; weight: string; file: string; url: string; license: string; licenseUrl: string; sha256: string | null }
const lock: { comment: string; fonts: Src[] } = JSON.parse(readFileSync(LOCK, 'utf8'));
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

// ---- 1. sources
mkdirSync(CACHE, { recursive: true });
let lockChanged = false;
for (const f of lock.fonts) {
  const dst = path.join(CACHE, f.file);
  if (!existsSync(dst)) {
    console.log(`downloading ${f.file} <- ${f.url}`);
    const r = await fetch(f.url);
    if (!r.ok) { console.error(`download failed: ${r.status} ${f.url}`); process.exit(1); }
    await Bun.write(dst, new Uint8Array(await r.arrayBuffer()));
    const lic = path.join(CACHE, `${f.family.replace(/\s+/g, '')}-OFL.txt`);
    if (!existsSync(lic)) {
      const l = await fetch(f.licenseUrl);
      if (!l.ok) { console.error(`licence download failed: ${l.status} ${f.licenseUrl}`); process.exit(1); }
      await Bun.write(lic, await l.text());
    }
  }
  const h = sha(readFileSync(dst));
  if (f.sha256 === null) {
    if (!argv.includes('--lock')) { console.error(`${f.file}: no sha256 in ${LOCK}; run once with --lock to record it`); process.exit(1); }
    f.sha256 = h;
    lockChanged = true;
  } else if (f.sha256 !== h) {
    console.error(`${f.file}: sha256 ${h} does not match the lock ${f.sha256}`);
    process.exit(1);
  }
}
if (lockChanged) writeFileSync(LOCK, JSON.stringify(lock, null, 1) + '\n');

// ---- 2. character set
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? (n === 'fonts' ? [] : walk(p)) : /\.ts$/.test(n) ? [p] : [];
  });
}
const chars = new Set<string>();
for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
const LIT = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/gs;
for (const f of [...walk(path.join(ROOT, 'films', FILM)), ...walk(path.join(ROOT, 'styles', STYLE))]) {
  const src = readFileSync(f, 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  for (const m of src.matchAll(LIT)) for (const ch of m[2].replace(/\\u\{?([0-9a-fA-F]+)\}?/g, (_x, h) => String.fromCodePoint(parseInt(h, 16)))) chars.add(ch);
}
for (const ws of ['\n', '\r', '\t']) chars.delete(ws);
const text = [...chars].sort().join('');
mkdirSync(OUT, { recursive: true });
const textFile = path.join(CACHE, `${FILM}-chars.txt`);
writeFileSync(textFile, text, 'utf8');
console.log(`character set: ${chars.size} characters (${[...chars].filter((c) => c.charCodeAt(0) > 0x7e).length} beyond ASCII)`);

// ---- 3. subset, coverage
const py = `
import json, sys
from fontTools.ttLib import TTFont
src, text = sys.argv[1], open(sys.argv[2], encoding='utf-8').read()
cmap = TTFont(src, lazy=True).getBestCmap()
print(json.dumps([c for c in text if ord(c) not in cmap]))
`;
const pyFile = path.join(CACHE, 'coverage.py');
writeFileSync(pyFile, py);
const run = async (args: string[]) => {
  const p = Bun.spawn([UV, 'tool', 'run', '--from', 'fonttools[woff]', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = [await new Response(p.stdout).text(), await new Response(p.stderr).text(), await p.exited];
  if (code !== 0) throw new Error(`${args.slice(0, 2).join(' ')} failed (${code}): ${err.trim().split('\n').slice(-3).join(' ')}`);
  return out;
};
for (const n of readdirSync(OUT)) if (n.endsWith('.woff2')) rmSync(path.join(OUT, n));
const manifest = [];
for (const f of lock.fonts) {
  const src = path.join(CACHE, f.file);
  const missing: string[] = JSON.parse(await run(['python', pyFile, src, textFile]));
  const name = `${f.family.replace(/\s+/g, '')}-${f.style}.woff2`;
  const dst = path.join(OUT, name);
  await run(['pyftsubset', src, `--text-file=${textFile}`, '--flavor=woff2', '--layout-features=*', '--no-hinting', `--output-file=${dst}`]);
  const bytes = readFileSync(dst);
  manifest.push({ family: f.family, role: f.role, style: f.style, weight: f.weight, file: name, sha256: sha(bytes), bytes: bytes.length,
    source: { file: f.file, url: f.url, sha256: f.sha256 }, license: f.license, chars: chars.size - missing.length, missing: missing.join('') });
  console.log(`${name.padEnd(28)} ${(bytes.length / 1024).toFixed(0).padStart(5)} KiB  covers ${chars.size - missing.length}/${chars.size}`);
}
writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ film: FILM, style: STYLE, charset: text, fonts: manifest }, null, 1) + '\n');
console.log(`-> ${path.join(OUT, 'manifest.json')}`);
