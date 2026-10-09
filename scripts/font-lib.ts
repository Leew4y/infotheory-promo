/**
 * The shared font library (fonts/catalog.json) and its download cache (.cache/fonts/), used by scripts/fonts.ts (a
 * film's subsets) and scripts/font-catalog.ts (the library itself).
 */
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dir, '..');
export const CATALOG = path.join(ROOT, 'fonts', 'catalog.json');
export const CACHE = path.join(ROOT, '.cache', 'fonts');

/** One font file of the library. `weight` is the file's weight or range ("400", "100 900"); null until measured. */
export interface Entry {
  id: string; family: string; style: 'normal' | 'italic'; weight: string | null; file: string; url: string;
  license: string; licenseUrl: string; sha256: string | null; tags?: string[];
}
export interface Catalog { comment: string; fonts: Entry[] }

export const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
/** Git's blob id of a file (what GitHub's contents API reports as `sha`). */
export const gitBlob = (b: Uint8Array) => createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
export const famKey = (family: string) => family.replace(/\s+/g, '');
export const die = (msg: string): never => { console.error(msg); process.exit(1); };

/** Read the catalog; ids must be unique (throws otherwise). */
export function readCatalog(): Catalog {
  const c: Catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
  const dup = c.fonts.map((e) => e.id).find((x, i, a) => a.indexOf(x) !== i);
  if (dup) throw new Error(`${CATALOG}: font id "${dup}" appears more than once`);
  return c;
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
