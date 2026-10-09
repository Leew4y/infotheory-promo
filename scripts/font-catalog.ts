/**
 * The shared font library itself: make every entry of fonts/catalog.json present in the cache and verified.
 *
 *   bun scripts/font-catalog.ts [--lock]        (just font-catalog [--lock])
 *
 * For each entry: download the file to .cache/fonts/ if missing and check its sha256 against the catalog; fetch the
 * family's OFL text. An entry whose sha256 is still null is accepted only with --lock, and only if the downloaded bytes
 * have the git blob id GitHub reports for that path at the pinned commit (so the first download is checked against the
 * upstream repository, not just trusted). A null weight is measured from the file with the pinned fontTools (the wght
 * axis range of a variable font, else OS/2 usWeightClass). Measured values are written back under the catalog lock.
 * Prints the library. Adding entries to the catalog needs Develata's confirmation (licences, size).
 * Needs uv for measuring weights. Exit code 1 on any download, checksum or tool failure.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { CACHE, die, download, gitBlob, licence, readCatalog, recordInCatalog, sha256, type Entry } from './font-lib';

const LOCK = Bun.argv.includes('--lock');
const GENERATOR = { fonttools: '4.66.1', brotli: '1.2.0' };
const UV = process.env.UV ?? (existsSync(path.join(process.env.USERPROFILE ?? '', 'scoop', 'shims', 'uv.exe')) ? path.join(process.env.USERPROFILE!, 'scoop', 'shims', 'uv.exe') : 'uv');

/** GitHub directory listings by owner/repo/dir@ref, fetched once per run (the anonymous API allows 60 calls an hour). */
const listings = new Map<string, Promise<{ path: string; sha: string }[]>>();
/** GitHub's blob id for a raw.githubusercontent.com URL at its pinned ref (GITHUB_TOKEN, if set, raises the rate limit). */
async function upstreamBlob(url: string): Promise<string> {
  const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([0-9a-f]{40})\/(.+)$/.exec(url);
  if (!m) return die(`${url}: not a raw.githubusercontent.com URL pinned to a 40-hex commit`);
  const [, owner, repo, ref, p] = m;
  const file = decodeURIComponent(p);
  const dir = file.slice(0, file.lastIndexOf('/'));
  const key = `${owner}/${repo}/${dir}@${ref}`;
  if (!listings.has(key)) listings.set(key, (async () => {
    const headers: Record<string, string> = { 'User-Agent': 'font-catalog', Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${dir}?ref=${ref}`, { headers });
    if (r.status === 403 || r.status === 429) {
      const reset = Number(r.headers.get('x-ratelimit-reset'));
      return die(`GitHub API rate limit for ${key}${reset ? `; it resets at ${new Date(reset * 1000).toISOString()}` : ''} (set GITHUB_TOKEN to raise it)`);
    }
    if (!r.ok) return die(`GitHub contents API ${r.status} for ${key}`);
    return (await r.json()) as { path: string; sha: string }[];
  })());
  const hit = (await listings.get(key)!).find((x) => x.path === file);
  if (!hit) return die(`${file} is not in ${owner}/${repo}@${ref}`);
  return hit.sha;
}

const cat = readCatalog();
const measured: { id: string; sha256?: string; weight?: string }[] = [];
for (const e of cat.fonts) {
  const dst = path.join(CACHE, e.file);
  if (e.sha256 === null && !LOCK) die(`"${e.id}" has no sha256 in the catalog: run with --lock to download, verify against GitHub and record it`);
  if (!existsSync(dst)) {
    console.log(`downloading ${e.file} <- ${e.url}`);
    await download(e.url, dst, (b) => (e.sha256 === null || sha256(b) === e.sha256 ? null : `sha256 ${sha256(b)} does not match the catalog ${e.sha256}`));
  }
  const bytes = readFileSync(dst);
  const h = sha256(bytes);
  if (e.sha256 === null) {
    const want = await upstreamBlob(e.url);
    if (gitBlob(bytes) !== want) die(`${e.file}: git blob ${gitBlob(bytes)} differs from GitHub's ${want}; delete it from ${CACHE}`);
    measured.push({ id: e.id, sha256: h });
  } else if (h !== e.sha256) die(`${e.file}: cached copy has sha256 ${h}, the catalog says ${e.sha256}; delete it from ${CACHE}`);
  await licence(e);
}

// weights still unknown: measure them from the files in one fontTools run
const unweighted = cat.fonts.filter((e) => e.weight === null);
if (unweighted.length) {
  if (!LOCK) die(`${unweighted.map((e) => e.id).join(', ')}: no weight in the catalog; run with --lock`);
  const py = `
import json, sys
from fontTools.ttLib import TTFont
out = {}
for p in sys.argv[1:]:
    f = TTFont(p, lazy=True)
    ax = [a for a in f['fvar'].axes if a.axisTag == 'wght'] if 'fvar' in f else []
    out[p] = f'{int(ax[0].minValue)} {int(ax[0].maxValue)}' if ax else str(f['OS/2'].usWeightClass)
print(json.dumps(out))
`;
  const files = unweighted.map((e) => path.join(CACHE, e.file));
  // the script goes in with -c: nothing to clean up
  const p = Bun.spawnSync([UV, 'tool', 'run', '--from', `fonttools==${GENERATOR.fonttools}`, 'python', '-c', py, ...files], { stdout: 'pipe', stderr: 'pipe' });
  if (p.exitCode !== 0) die(`measuring weights failed: ${p.stderr.toString().trim().split('\n').slice(-3).join(' ')}`);
  const w: Record<string, string> = JSON.parse(p.stdout.toString());
  for (const e of unweighted) {
    const m = measured.find((x) => x.id === e.id);
    const weight = w[path.join(CACHE, e.file)];
    if (m) m.weight = weight; else measured.push({ id: e.id, weight });
  }
}
try {
  await recordInCatalog(measured);
} catch (e) {
  die(e instanceof Error ? e.message : String(e));
}

const now = readCatalog();
for (const e of now.fonts) {
  const mb = (statSync(path.join(CACHE, e.file)).size / 1048576).toFixed(1).padStart(5);
  console.log(`${e.id.padEnd(26)} ${`${e.family} ${e.style}`.padEnd(32)} ${String(e.weight).padEnd(9)} ${mb} MB  ${(e.tags ?? []).join(' ')}`);
}
console.log(`${now.fonts.length} fonts, all present and verified${measured.length ? `; recorded ${measured.length} in the catalog` : ''}`);
