/**
 * Bundled fonts: download the font sources a style uses from the shared library, check the CJK faces' glyphs, subset
 * them to the film's characters, check coverage.
 *
 *   bun scripts/fonts.ts --film <id> [--style <id>]     (one bundle per film and style)
 *
 * Without --style: film-plan.json's styles, or every style the hand-written film imports, one after another.
 *
 * 1. The style lists font ids (styles/<style>/fonts.json); each id is an entry of the shared library fonts/catalog.json
 *    (URL pinned to an upstream commit, licence, sha256). Missing files are downloaded to .cache/fonts/ through a
 *    temporary file and only kept if the sha256 matches; the licence text of every family is fetched the same way
 *    (independently of the font cache). A catalog entry must be locked first (sha256 and weight recorded by
 *    scripts/font-catalog.ts --lock); a mismatch is an error. An entry with a `defects` record is refused unless the
 *    style's fonts.json entry gives `"acceptDefects": "<why>"` (after a person agreed).
 * 2. The film's character set: every character in the string and template literals of films/<film>/**\/*.ts and of
 *    the style package (comments removed by a string-aware scanner, escapes decoded), plus printable ASCII, plus the
 *    displayed text in film-plan.json, or captions from narration.json (text and en), plus
 *    films/<film>/fonts.extra.txt if present (for text generated at run time, e.g. String.fromCodePoint(...) or
 *    toUpperCase(): every character of the file is added as it is, line breaks ignored).
 * 3. Glyph check of every CJK face (catalog tag zh) on that set (scripts/glyph_check.py on the source file): twins
 *    (two characters drawn alike), ink (filled counters, solid blocks), punctuation against Noto Serif SC / Noto Sans
 *    SC. Any error stops here, before anything is written, unless the style accepts the font's defects; warnings are
 *    printed. The check reads outlines; a person still looks at the glyphs (just glyphs <film>).
 * 4. Each source is subset to that set with a pinned fontTools (pyftsubset via `uv tool run`, WOFF2, all name records
 *    kept so the copyright and licence notices stay in the fonts) into a temporary directory; only when every face
 *    succeeded does it replace films/<film>/fonts/<style>/, together with each family's OFL text (LICENSE-<family>.txt,
 *    with LF line ends whatever the upstream file has) and manifest.json: family, style, weight range, role, file,
 *    sha256, source, licence, generator, and the characters of the set each face lacks. A failure leaves the existing
 *    fonts untouched.
 * Needs uv. Exit code 1 on any download, checksum, glyph-check or tool failure.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { requireFilm } from './film-arg';
import {
  CACHE, CATALOG, die, famKey, fontTools, GENERATOR, glyphCheck, isCJK, licence, printGlyphReport, readCatalog, referenceFor, ROOT,
  sha256 as sha, source, type Entry, type StyleFont,
} from './font-lib';
import { literals } from './literals';
import { FilmPlanSpec, planTexts } from '../engine/plan';

const argv = Bun.argv.slice(2);
const opt = (k: string, d: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const FILM = requireFilm(argv);

/** The styles a film imports: films may import a style only as styles/<id>/index.ts (scripts/check-imports.ts). */
function filmStyles(): string[] {
  const dir = path.join(ROOT, 'films', FILM), ids: string[] = [];
  const plan = path.join(dir, 'film-plan.json');
  if (existsSync(plan)) return FilmPlanSpec.parse(JSON.parse(readFileSync(plan, 'utf8'))).styles;
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
if (!/^[a-z0-9][a-z0-9-]*$/.test(STYLE) || !existsSync(path.join(ROOT, 'styles', STYLE, 'fonts.json'))) die(`--style "${STYLE}" is not a style package with a fonts.json`);
const REFS = path.join(ROOT, 'styles', STYLE, 'fonts.json');
const OUT = path.join(ROOT, 'films', FILM, 'fonts', STYLE);
const EXTRA = path.join(ROOT, 'films', FILM, 'fonts.extra.txt');

type Src = Entry & { role: string; sha256: string; weight: string; acceptDefects?: string };
const catalog = readCatalog();
const refs: StyleFont[] = JSON.parse(readFileSync(REFS, 'utf8')).fonts;
/** The style's faces in its order: a copy of each catalog entry plus the style's role for it. Entries must be locked. */
const lock: { fonts: Src[] } = {
  fonts: refs.map((r) => {
    const e = catalog.fonts.find((x) => x.id === r.id);
    if (!e) return die(`${REFS}: font "${r.id}" is not in ${CATALOG}`);
    if (e.sha256 === null || e.weight === null) return die(`${CATALOG}: "${e.id}" is not locked yet (sha256 / weight): run bun scripts/font-catalog.ts --lock`);
    if (r.acceptDefects !== undefined && !(typeof r.acceptDefects === 'string' && r.acceptDefects.trim()))
      return die(`${REFS}: "${r.id}".acceptDefects must say why the style uses the font anyway`);
    if (e.defects && !r.acceptDefects)
      return die(`${REFS}: "${e.id}" has a recorded defect: ${e.defects.note} (${e.defects.source}). Choose another font; or, if a person has looked at the glyphs and agreed, add "acceptDefects": "<why>" to its entry`);
    if (e.defects) console.log(`${e.id}: recorded defect accepted by the style (${r.acceptDefects}): ${e.defects.note}`);
    return { ...e, role: r.role, ...(r.acceptDefects ? { acceptDefects: r.acceptDefects } : {}) } as Src;
  }),
};

// ---- 1. sources and licences
mkdirSync(CACHE, { recursive: true });
for (const f of lock.fonts) {
  await source(f);
  await licence(f);
}

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
const NARRATION = path.join(ROOT, 'films', FILM, 'narration.json');
const PLAN = path.join(ROOT, 'films', FILM, 'film-plan.json');
if (existsSync(PLAN))
  for (const text of planTexts(FilmPlanSpec.parse(JSON.parse(readFileSync(PLAN, 'utf8'))))) for (const ch of text) chars.add(ch);
else if (existsSync(NARRATION))
  for (const l of (JSON.parse(readFileSync(NARRATION, 'utf8')).lines ?? []) as { text?: string; en?: string }[])
    for (const ch of `${l.text ?? ''}${l.en ?? ''}`) chars.add(ch);
if (existsSync(EXTRA)) for (const ch of readFileSync(EXTRA, 'utf8')) chars.add(ch);
for (const ws of ['\n', '\r', '\t', '\b', '\f', '\v', '\0']) chars.delete(ws);
const text = [...chars].sort().join('');
const textFile = path.join(CACHE, `${FILM}-${STYLE}-${process.pid}-chars.txt`);
writeFileSync(textFile, text, 'utf8');
console.log(`character set: ${chars.size} characters (${[...chars].filter((c) => c.charCodeAt(0) > 0x7e).length} beyond ASCII)${existsSync(EXTRA) ? `, including ${EXTRA}` : ''}`);

// ---- 3. glyph check of the CJK faces, before anything is written
const cjk = lock.fonts.filter(isCJK);
if (cjk.length) {
  const blocked: string[] = [];
  try {
    const reports = await glyphCheck(text, cjk);
    for (const r of reports) {
      const f = cjk.find((x) => x.id === r.id)!;
      printGlyphReport(r, referenceFor(f, catalog).family, f.acceptDefects);
      if (!f.acceptDefects && r.findings.some((x) => x.level === 'error')) blocked.push(f.id);
    }
  } catch (e) {
    rmSync(textFile, { force: true });
    die(`glyph check failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (blocked.length) {
    rmSync(textFile, { force: true });
    die(`${blocked.join(', ')}: glyph-check errors; nothing was written. Choose another font for the style, or record the defect in ${CATALOG} and, once a person has looked at the glyphs and agreed, add "acceptDefects": "<why>" to the entry in ${REFS}`);
  }
}

// ---- 4. subset into a temporary directory, then replace the film's fonts
const pyFile = path.join(CACHE, `coverage-${process.pid}.py`);
writeFileSync(pyFile, `
import json, sys
from fontTools.ttLib import TTFont
src, text = sys.argv[1], open(sys.argv[2], encoding='utf-8').read()
cmap = TTFont(src, lazy=True).getBestCmap()
print(json.dumps([c for c in text if ord(c) not in cmap]))
`);
const TMP = path.join(path.dirname(OUT), `.fonts.${process.pid}.tmp`);
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
try {
  const manifest = [];
  for (const f of lock.fonts) {
    const src = path.join(CACHE, f.file);
    const missing: string[] = JSON.parse(await fontTools(['python', pyFile, src, textFile]));
    // one file per family and style; a static face other than 400 adds its weight (IBM Plex Mono Medium, ...)
    const name = `${famKey(f.family)}-${f.style}${/^\d+$/.test(f.weight) && f.weight !== '400' ? `-${f.weight}` : ''}.woff2`;
    const dst = path.join(TMP, name);
    await fontTools(['pyftsubset', src, `--text-file=${textFile}`, '--flavor=woff2', '--layout-features=*', '--no-hinting',
      '--name-IDs=*', '--name-languages=*', '--name-legacy', `--output-file=${dst}`]);
    const bytes = readFileSync(dst);
    const license = `LICENSE-${famKey(f.family)}.txt`;
    // LF line ends: some upstream OFL.txt files are CRLF, and the committed copies must not depend on the host
    writeFileSync(path.join(TMP, license), readFileSync(path.join(CACHE, `${famKey(f.family)}-OFL.txt`), 'utf8').replace(/\r\n/g, '\n'));
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
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  rmSync(TMP, { recursive: true, force: true });
  rmSync(textFile, { force: true });
  rmSync(pyFile, { force: true });
}
