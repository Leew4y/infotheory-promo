/**
 * Bundled fonts: download the font sources a style uses from the shared library, subset them to the film's characters,
 * check coverage.
 *
 *   bun scripts/fonts.ts --film <id> [--style <id>] [--lock]     (one bundle per film and style)
 *
 * Without --style: every style the film imports (styles/<id> in any .ts under films/<film>/), one after another.
 *
 * 1. The style lists font ids (styles/<style>/fonts.json); each id is an entry of the shared library fonts/catalog.json
 *    (URL pinned to an upstream commit, licence, sha256). Missing files are downloaded to .cache/fonts/ through a
 *    temporary file and only kept if the sha256 matches; the licence text of every family is fetched the same way
 *    (independently of the font cache). --lock records the sha256 of freshly downloaded fonts in the catalog (first
 *    download only); after that a mismatch is an error.
 * 2. The film's character set: every character in the string and template literals of films/<film>/**\/*.ts and of
 *    the style package (comments removed by a string-aware scanner, escapes decoded), plus printable ASCII, plus
 *    films/<film>/fonts.extra.txt if present (for text generated at run time, e.g. String.fromCodePoint(...)).
 * 3. Each source is subset to that set with a pinned fontTools (pyftsubset via `uv tool run`, WOFF2, all name records
 *    kept so the copyright and licence notices stay in the fonts) into a temporary directory; only when every face
 *    succeeded does it replace films/<film>/fonts/<style>/, together with each family's OFL text (LICENSE-<family>.txt) and
 *    manifest.json: family, style, weight range, role, file, sha256, source, licence, generator, and the characters
 *    of the set each face lacks. A failure leaves the existing fonts untouched.
 * Needs uv. Exit code 1 on any download, checksum or tool failure.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { literals } from './literals';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const opt = (k: string, d: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const FILM = opt('film', '');
if (!FILM) { console.error('--film <id> is required (one of films/*)'); process.exit(2); }

/** The styles a film imports: films may import a style only as styles/<id>/index.ts (scripts/check-imports.ts). */
function filmStyles(): string[] {
  const dir = path.join(ROOT, 'films', FILM), ids: string[] = [];
  const tr = new Bun.Transpiler({ loader: 'ts' });
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => {
    const p = path.join(d, n);
    return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(n) ? [p] : [];
  });
  for (const file of walk(dir))
    for (const imp of tr.scanImports(readFileSync(file, 'utf8'))) {
      const rel = path.relative(ROOT, path.resolve(path.dirname(file), imp.path)).split(path.sep);
      if (rel[0] === 'styles' && rel[1] && !ids.includes(rel[1])) ids.push(rel[1]);
    }
  return ids;
}
if (!argv.includes('--style')) {
  const ids = filmStyles();
  if (!ids.length) { console.error(`films/${FILM} imports no style`); process.exit(1); }
  for (const id of ids) {
    console.log(`== ${FILM} / ${id}`);
    const p = Bun.spawnSync([process.execPath, import.meta.path, ...argv, '--style', id], { stdout: 'inherit', stderr: 'inherit' });
    if (p.exitCode !== 0) process.exit(p.exitCode ?? 1);
  }
  process.exit(0);
}
const STYLE = opt('style', '');
const CATALOG = path.join(ROOT, 'fonts', 'catalog.json');
const REFS = path.join(ROOT, 'styles', STYLE, 'fonts.json');
const CACHE = path.join(ROOT, '.cache', 'fonts');
const OUT = path.join(ROOT, 'films', FILM, 'fonts', STYLE);
const EXTRA = path.join(ROOT, 'films', FILM, 'fonts.extra.txt');
// the subsetting toolchain is pinned: the same inputs give byte-identical subsets on any machine with these versions
const GENERATOR = { fonttools: '4.66.1', brotli: '1.2.0' };
const UV = process.env.UV ?? (existsSync(path.join(process.env.USERPROFILE ?? '', 'scoop', 'shims', 'uv.exe')) ? path.join(process.env.USERPROFILE!, 'scoop', 'shims', 'uv.exe') : 'uv');
const die = (msg: string): never => { console.error(msg); process.exit(1); };

interface Entry { id: string; family: string; style: 'normal' | 'italic'; weight: string; file: string; url: string; license: string; licenseUrl: string; sha256: string | null }
type Src = Entry & { role: string };
const catalog: { comment: string; fonts: Entry[] } = JSON.parse(readFileSync(CATALOG, 'utf8'));
const refs: { id: string; role: string }[] = JSON.parse(readFileSync(REFS, 'utf8')).fonts;
/** The style's faces in its order; each is the catalog entry itself (so --lock can record its sha256) plus the role. */
const lock: { fonts: Src[] } = {
  fonts: refs.map((r) => {
    const e = catalog.fonts.find((x) => x.id === r.id);
    if (!e) { console.error(`${REFS}: font "${r.id}" is not in ${CATALOG}`); process.exit(1); }
    return Object.assign(e, { role: r.role }) as Src;
  }),
};
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const famKey = (family: string) => family.replace(/\s+/g, '');

/** Download to a temporary file; keep it only if `accept` says so. */
async function download(url: string, dst: string, accept: (b: Uint8Array) => string | null): Promise<void> {
  const r = await fetch(url);
  if (!r.ok) die(`download failed: ${r.status} ${url}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const problem = accept(bytes);
  if (problem) die(`${url}: ${problem}`);
  const tmp = `${dst}.${process.pid}.part`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, dst);
}

// ---- 1. sources and licences
mkdirSync(CACHE, { recursive: true });
let lockChanged = false;
for (const f of lock.fonts) {
  const dst = path.join(CACHE, f.file);
  if (!existsSync(dst)) {
    console.log(`downloading ${f.file} <- ${f.url}`);
    await download(f.url, dst, (b) => {
      if (f.sha256 === null) return argv.includes('--lock') ? null : `no sha256 in ${CATALOG}; run once with --lock to record it`;
      return sha(b) === f.sha256 ? null : `sha256 ${sha(b)} does not match the lock ${f.sha256}`;
    });
  }
  const h = sha(readFileSync(dst));
  if (f.sha256 === null) {
    if (!argv.includes('--lock')) die(`${f.file}: no sha256 in ${CATALOG}; run once with --lock to record it`);
    f.sha256 = h;
    lockChanged = true;
  } else if (f.sha256 !== h) die(`${f.file}: cached copy has sha256 ${h}, the lock says ${f.sha256}; delete it from ${CACHE}`);
  const lic = path.join(CACHE, `${famKey(f.family)}-OFL.txt`);
  if (!existsSync(lic)) {
    console.log(`downloading licence of ${f.family} <- ${f.licenseUrl}`);
    await download(f.licenseUrl, lic, (b) => (/SIL OPEN FONT LICENSE/i.test(new TextDecoder().decode(b)) ? null : 'does not look like the SIL Open Font License'));
  }
}
// record new sha256 values in the catalog (the role is the style's, not the catalog's)
if (lockChanged) writeFileSync(CATALOG, JSON.stringify({ ...catalog, fonts: catalog.fonts.map(({ role: _, ...e }: Entry & { role?: string }) => e) }, null, 1) + '\n');

// ---- 2. character set
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? (n === 'fonts' ? [] : walk(p)) : /\.ts$/.test(n) ? [p] : [];
  });
}
const chars = new Set<string>();
for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
for (const f of [...walk(path.join(ROOT, 'films', FILM)), ...walk(path.join(ROOT, 'styles', STYLE))])
  for (const s of literals(readFileSync(f, 'utf8'))) for (const ch of s) chars.add(ch);
if (existsSync(EXTRA)) for (const ch of readFileSync(EXTRA, 'utf8')) chars.add(ch);
for (const ws of ['\n', '\r', '\t', '\b', '\f', '\v', '\0']) chars.delete(ws);
const text = [...chars].sort().join('');
const textFile = path.join(CACHE, `${FILM}-${STYLE}-${process.pid}-chars.txt`);
writeFileSync(textFile, text, 'utf8');
console.log(`character set: ${chars.size} characters (${[...chars].filter((c) => c.charCodeAt(0) > 0x7e).length} beyond ASCII)${existsSync(EXTRA) ? `, including ${EXTRA}` : ''}`);

// ---- 3. subset into a temporary directory, then replace the film's fonts
const pyFile = path.join(CACHE, `coverage-${process.pid}.py`);
writeFileSync(pyFile, `
import json, sys
from fontTools.ttLib import TTFont
src, text = sys.argv[1], open(sys.argv[2], encoding='utf-8').read()
cmap = TTFont(src, lazy=True).getBestCmap()
print(json.dumps([c for c in text if ord(c) not in cmap]))
`);
const run = async (args: string[]) => {
  let p: ReturnType<typeof Bun.spawn>;
  try {
    p = Bun.spawn([UV, 'tool', 'run', '--from', `fonttools[woff]==${GENERATOR.fonttools}`, '--with', `brotli==${GENERATOR.brotli}`, ...args], { stdout: 'pipe', stderr: 'pipe' });
  } catch (e) {
    return die(`cannot run uv (${UV}): ${e instanceof Error ? e.message : String(e)}; install uv or set UV`);
  }
  const [out, err, code] = await Promise.all([new Response(p.stdout as ReadableStream).text(), new Response(p.stderr as ReadableStream).text(), p.exited]);
  if (code !== 0) die(`${args.slice(0, 2).join(' ')} failed (${code}): ${err.trim().split('\n').slice(-3).join(' ')}`);
  return out;
};
const TMP = path.join(path.dirname(OUT), `.fonts.${process.pid}.tmp`);
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
try {
  const manifest = [];
  for (const f of lock.fonts) {
    const src = path.join(CACHE, f.file);
    const missing: string[] = JSON.parse(await run(['python', pyFile, src, textFile]));
    const name = `${famKey(f.family)}-${f.style}.woff2`;
    const dst = path.join(TMP, name);
    await run(['pyftsubset', src, `--text-file=${textFile}`, '--flavor=woff2', '--layout-features=*', '--no-hinting',
      '--name-IDs=*', '--name-languages=*', '--name-legacy', `--output-file=${dst}`]);
    const bytes = readFileSync(dst);
    const license = `LICENSE-${famKey(f.family)}.txt`;
    writeFileSync(path.join(TMP, license), readFileSync(path.join(CACHE, `${famKey(f.family)}-OFL.txt`)));
    manifest.push({ family: f.family, role: f.role, style: f.style, weight: f.weight, file: name, sha256: sha(bytes), bytes: bytes.length,
      source: { file: f.file, url: f.url, sha256: f.sha256 }, license: f.license, licenseFile: license, chars: chars.size - missing.length, missing: missing.join('') });
    console.log(`${name.padEnd(28)} ${(bytes.length / 1024).toFixed(0).padStart(5)} KiB  covers ${chars.size - missing.length}/${chars.size}`);
  }
  writeFileSync(path.join(TMP, 'manifest.json'), JSON.stringify({ film: FILM, style: STYLE, generator: GENERATOR, charset: text, fonts: manifest }, null, 1) + '\n');
  // publish: the new set replaces the old one only now
  mkdirSync(OUT, { recursive: true });
  for (const n of readdirSync(OUT)) if (/\.woff2$|^LICENSE-.*\.txt$|^manifest\.json$/.test(n)) rmSync(path.join(OUT, n));
  for (const n of readdirSync(TMP)) renameSync(path.join(TMP, n), path.join(OUT, n));
  console.log(`-> ${path.join(OUT, 'manifest.json')}`);
} finally {
  rmSync(TMP, { recursive: true, force: true });
  rmSync(textFile, { force: true });
  rmSync(pyFile, { force: true });
}
