/**
 * The shared font library (fonts/catalog.json) and its download cache (.cache/fonts/), used by scripts/fonts.ts (a
 * film's subsets), scripts/font-catalog.ts (the library itself) and scripts/glyph-check.ts / glyphs.ts (glyph checks).
 */
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dir, '..');
export const CATALOG = path.join(ROOT, 'fonts', 'catalog.json');
export const CACHE = path.join(ROOT, '.cache', 'fonts');

/**
 * One font file of the library. `weight` is the file's weight or range ("400", "100 900"); null until measured.
 * `defects`: a known fault of the upstream file (what is wrong, and where it was found). scripts/fonts.ts refuses such
 * a font unless the style's fonts.json entry carries `acceptDefects` (the reason, after a person agreed).
 */
export interface Entry {
  id: string; family: string; style: 'normal' | 'italic'; weight: string | null; file: string; url: string;
  license: string; licenseUrl: string; sha256: string | null; tags?: string[]; defects?: { note: string; source: string };
}
export interface Catalog { comment: string; fonts: Entry[] }
/** An entry of a style's fonts.json. */
export interface StyleFont { id: string; role: string; acceptDefects?: string }

export const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
/** Git's blob id of a file (what GitHub's contents API reports as `sha`). */
export const gitBlob = (b: Uint8Array) => createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
export const famKey = (family: string) => family.replace(/\s+/g, '');
export const die = (msg: string): never => { console.error(msg); process.exit(1); };

/** Read the catalog; ids must be unique and a `defects` record needs a note and a source (throws otherwise). */
export function readCatalog(): Catalog {
  const c: Catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
  const dup = c.fonts.map((e) => e.id).find((x, i, a) => a.indexOf(x) !== i);
  if (dup) throw new Error(`${CATALOG}: font id "${dup}" appears more than once`);
  for (const e of c.fonts)
    if (e.defects !== undefined && !(typeof e.defects?.note === 'string' && e.defects.note.trim() && typeof e.defects.source === 'string' && e.defects.source.trim()))
      throw new Error(`${CATALOG}: "${e.id}".defects must be { "note": "<what is wrong>", "source": "<where it was found>" }`);
  return c;
}

/** The pinned fontTools toolchain: the same inputs give byte-identical subsets on any machine with these versions. */
export const GENERATOR = { fonttools: '4.66.1', brotli: '1.2.0' };
export const UV = process.env.UV ?? (existsSync(path.join(process.env.USERPROFILE ?? '', 'scoop', 'shims', 'uv.exe')) ? path.join(process.env.USERPROFILE!, 'scoop', 'shims', 'uv.exe') : 'uv');

/** Run a command (pyftsubset, python, ...) in the pinned fontTools environment; returns stdout. Throws on failure. */
export async function fontTools(args: string[]): Promise<string> {
  let p: ReturnType<typeof Bun.spawn>;
  try {
    p = Bun.spawn([UV, 'tool', 'run', '--from', `fonttools[woff]==${GENERATOR.fonttools}`, '--with', `brotli==${GENERATOR.brotli}`, ...args], { stdout: 'pipe', stderr: 'pipe' });
  } catch (e) {
    throw new Error(`cannot run uv (${UV}): ${e instanceof Error ? e.message : String(e)}; install uv or set UV`);
  }
  const [out, err, code] = await Promise.all([new Response(p.stdout as ReadableStream).text(), new Response(p.stderr as ReadableStream).text(), p.exited]);
  if (code !== 0) throw new Error(`${args.slice(0, 2).join(' ')} failed (${code}): ${err.trim().split('\n').slice(-3).join(' ')}`);
  return out;
}

/** The cached source file of a locked catalog entry: downloaded if missing, checked against the catalog's sha256. */
export async function source(e: Entry): Promise<string> {
  if (e.sha256 === null) return die(`${CATALOG}: "${e.id}" is not locked yet (sha256 / weight): run bun scripts/font-catalog.ts --lock`);
  const dst = path.join(CACHE, e.file);
  if (!existsSync(dst)) {
    console.log(`downloading ${e.file} <- ${e.url}`);
    await download(e.url, dst, (b) => (sha256(b) === e.sha256 ? null : `sha256 ${sha256(b)} does not match the catalog ${e.sha256}`));
  }
  const h = sha256(readFileSync(dst));
  if (h !== e.sha256) die(`${e.file}: cached copy has sha256 ${h}, the catalog says ${e.sha256}; delete it from ${CACHE}`);
  return dst;
}

// ---- glyph check (scripts/glyph_check.py): CJK faces only

export const isCJK = (e: Entry) => (e.tags ?? []).includes('zh');
/** The face a CJK font's punctuation is compared with: Noto Serif SC for a face tagged serif, else Noto Sans SC. */
export function referenceFor(e: Entry, cat: Catalog): Entry {
  const id = (e.tags ?? []).includes('serif') ? 'noto-serif-sc' : 'noto-sans-sc';
  return cat.fonts.find((x) => x.id === id) ?? die(`${CATALOG}: the reference face "${id}" of the glyph check is missing`);
}
export interface GlyphFinding { check: 'twin' | 'ink' | 'punct'; level: 'error' | 'warning'; chars: string; message: string }
export interface GlyphReport { id: string; checked: { ideographs: number; punctuation: number }; stats: Record<string, unknown>; findings: GlyphFinding[] }

/** Check CJK faces (catalog entries) on `text`: twins, ink, punctuation (see scripts/glyph_check.py). Downloads sources. */
export async function glyphCheck(text: string, faces: Entry[], ref?: Entry): Promise<GlyphReport[]> {
  const cat = readCatalog();
  const fonts = [];
  for (const e of faces) fonts.push({ id: e.id, path: await source(e), ref: await source(ref ?? referenceFor(e, cat)) });
  mkdirSync(CACHE, { recursive: true });
  const job = path.join(CACHE, `glyph-check-${process.pid}.json`);
  writeFileSync(job, JSON.stringify({ text, fonts }));
  try {
    return JSON.parse(await fontTools(['python', '-I', path.join(ROOT, 'scripts', 'glyph_check.py'), job])).fonts;
  } finally {
    rmSync(job, { force: true });
  }
}

/** Print one font's report; `accepted` (the style's acceptDefects reason) turns its errors into accepted notes. */
export function printGlyphReport(r: GlyphReport, ref: string, accepted?: string): void {
  const errors = r.findings.filter((f) => f.level === 'error');
  const head = `glyph check ${r.id}: ${r.checked.ideographs} ideographs, ${r.checked.punctuation} punctuation marks against ${ref}`;
  if (!r.findings.length) { console.log(`${head}: no findings`); return; }
  console.log(`${head}: ${errors.length} error(s), ${r.findings.length - errors.length} warning(s)${errors.length && accepted ? ` (accepted by the style: ${accepted})` : ''}`);
  for (const f of r.findings) console.log(`  ${f.level === 'error' ? (accepted ? 'accepted' : 'ERROR') : 'warning'} ${f.check}: ${f.message}`);
}

/** Download to a temporary file; keep it only if `accept` returns null (else exit with its reason). */
export async function download(url: string, dst: string, accept: (b: Uint8Array) => string | null): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) die(`download failed: ${r.status} ${url}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const problem = accept(bytes);
  if (problem) die(`${url}: ${problem}`);
  mkdirSync(path.dirname(dst), { recursive: true });
  const tmp = `${dst}.${process.pid}.part`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, dst);
  return bytes;
}

/** The family's OFL text in the cache, downloaded once. */
export async function licence(e: Entry): Promise<string> {
  const lic = path.join(CACHE, `${famKey(e.family)}-OFL.txt`);
  if (!existsSync(lic)) {
    console.log(`downloading licence of ${e.family} <- ${e.licenseUrl}`);
    await download(e.licenseUrl, lic, (b) => (/SIL OPEN FONT LICENSE/i.test(new TextDecoder().decode(b)) ? null : 'does not look like the SIL Open Font License'));
  }
  return lic;
}

/**
 * Record measured values (sha256, weight) in the catalog: under an exclusive lock, re-read the catalog (another job may
 * have recorded other fonts meanwhile), fill in only fields that are still null, refuse a conflicting value, and replace
 * the file atomically. Throws on a conflict; the lock is released in every case.
 */
export async function recordInCatalog(measured: { id: string; sha256?: string; weight?: string }[]): Promise<void> {
  if (!measured.length) return;
  const lockFile = `${CATALOG}.lock`;
  let fd = -1;
  for (let i = 0; fd < 0; i++) {
    try { fd = openSync(lockFile, 'wx'); } catch {
      if (i >= 200) throw new Error(`${lockFile} is held by another job (remove it if no fonts job is running)`);
      await Bun.sleep(50);
    }
  }
  try {
    const fresh = readCatalog();
    for (const m of measured) {
      const e = fresh.fonts.find((x) => x.id === m.id);
      if (!e) throw new Error(`${CATALOG}: font "${m.id}" disappeared while recording it`);
      for (const k of ['sha256', 'weight'] as const) {
        if (m[k] === undefined) continue;
        if (e![k] === null) e![k] = m[k]!;
        else if (e![k] !== m[k]) throw new Error(`${CATALOG}: "${m.id}" ${k} was recorded meanwhile as ${e![k]}, this job measured ${m[k]}`);
      }
    }
    const tmp = `${CATALOG}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(fresh, null, 1) + '\n');
    renameSync(tmp, CATALOG);
  } finally {
    closeSync(fd);
    rmSync(lockFile, { force: true });
  }
}
