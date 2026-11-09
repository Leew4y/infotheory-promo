/**
 * A film's screen captures as the tools see them (scripts/import-capture.ts, scripts/capture.ts and every tool that
 * renders): the committed manifests films/<film>/captures/<id>.json, the frames derived from each source video in
 * .cache/captures/<film>/<id>/ (not committed), and where a source video may be found.
 *
 * Sources: videos stay outside the repository (the repository holds text and code; Develata, 2026-10-09 and 2026-11-09).
 * capture writes them to out/<film>/sources/, and `just captures <film>` rebuilds from there by default.
 *
 * requireCaptureFrames(film) is the pre-check of the render tools (validate, export and shots, render-scene and
 * render-range, sheet, regress): every manifest of the film must have exactly its frames 00000.jpg .. (frames - 1).
 * Otherwise it stops the tool (exit 2, a setup error) with one message that names each capture, its source file and
 * sha256, and the command that rebuilds the frames, or says that the source is not available on this machine. The
 * page itself stays strict (engine/media.ts): a frame that cannot be loaded still fails the render.
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { CaptureAsset } from '../../engine/capture';
import { FILM_ID, mediaDir } from '../film-arg';

const ROOT = path.resolve(import.meta.dir, '..', '..');
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, '/');

export const capturesDir = (film: string): string => path.join(ROOT, 'films', film, 'captures');
/** Where source videos live on this machine, unless told otherwise (out/ is not committed). */
export const outSourcesDir = (film: string): string => path.join(ROOT, 'out', film, 'sources');
export const mb = (bytes: number): string => `${(bytes / 2 ** 20).toFixed(1).replace(/\.0$/, '')} MB`;

export async function sha256(file: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk as Buffer);
  return h.digest('hex');
}

const posInt = (v: unknown, max = Infinity) => Number.isInteger(v) && (v as number) > 0 && (v as number) <= max;
/** Problems with a committed manifest (file name `n`), checked before any path is derived from it; empty when valid. */
export function checkManifest(n: string, a: CaptureAsset): string[] {
  const p: string[] = [];
  if (typeof a.id !== 'string' || !FILM_ID.test(a.id) || `${a.id}.json` !== n) p.push(`id "${a.id}" must be the file name's and lowercase letters, digits, hyphens`);
  const f = a.source?.file;
  if (typeof f !== 'string' || !f || f !== path.basename(f) || f !== path.win32.basename(f) || f === '.' || f === '..') p.push(`source.file "${f}" must be a plain file name`);
  if (typeof a.source?.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(a.source.sha256)) p.push('source.sha256 must be 64 hex digits');
  if (!posInt(a.fps, 120) || !posInt(a.frames) || !posInt(a.width) || !posInt(a.height)) p.push('fps (1–120), frames, width and height must be positive integers');
  const c = a.crop;
  if (c !== null && !(c && [c.x, c.y].every((v) => Number.isInteger(v) && v >= 0) && posInt(c.w) && posInt(c.h))) p.push('crop must be null or integers { x, y >= 0, w, h > 0 }');
  if (!posInt(+a.made?.quality, 31)) p.push('made.quality must be an integer 1–31');
  return p;
}

/** The manifest file names of a film (films/<film>/captures/*.json; sources/ is not looked into). */
export function manifestNames(film: string): string[] {
  const dir = capturesDir(film);
  return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.json') && statSync(path.join(dir, n)).isFile()).sort() : [];
}

/** A manifest, parsed and checked; throws with the file and the problems otherwise. */
export function readManifest(film: string, n: string): CaptureAsset {
  const f = path.join(capturesDir(film), n);
  let a: CaptureAsset;
  try { a = JSON.parse(readFileSync(f, 'utf8')); } catch { throw new Error(`${rel(f)}: not JSON`); }
  const p = checkManifest(n, a);
  if (p.length) throw new Error(`${rel(f)}: ${p.join('; ')}`);
  return a;
}

/** What is wrong with a capture's derived frames (null when exactly frames 0 .. frames - 1 are there). */
function framesProblem(film: string, a: CaptureAsset): string | null {
  const dir = path.join(mediaDir(film), a.id);
  if (!existsSync(dir)) return `no frames in ${rel(dir)}/`;
  const nums = new Set(readdirSync(dir).map((n) => /^(\d{5,})\.jpg$/.exec(n)).filter((m) => m !== null).map((m) => +m![1]));
  let missing = 0, first = -1;
  for (let i = 0; i < a.frames; i++) if (!nums.has(i)) { missing++; if (first < 0) first = i; }
  const extra = [...nums].filter((i) => i >= a.frames).length;
  if (!missing && !extra) return null;
  const parts = [missing ? `${missing} of its ${a.frames} frames missing (the first: ${String(first).padStart(5, '0')}.jpg)` : '', extra ? `${extra} frame(s) beyond the manifest's ${a.frames}` : ''].filter(Boolean);
  return `${parts.join(', ')} in ${rel(dir)}/ (frames from another import?)`;
}

/** Where the source of `a` is on this machine, and how to rebuild from it; or why it is not available. */
async function sourceAdvice(film: string, a: CaptureAsset): Promise<string> {
  const dir = outSourcesDir(film), f = path.join(dir, a.source.file);
  let wrong: string[] = [];
  if (existsSync(f) && statSync(f).isFile()) {
    const h = await sha256(f);
    if (h === a.source.sha256) return `rebuild the frames: just captures ${film}`;
    wrong = [`${rel(f)} has sha256 ${h}: not the recorded source`];
  }
  return [
    ...wrong,
    `the source is not available here: no ${a.source.file} with that sha256 in ${rel(dir)}/.`,
    `Get the file from whoever recorded it and put it in ${rel(dir)}/, then run: just captures ${film} (or keep it elsewhere: just captures ${film} <dir>).`,
    'Recording it again (just capture / OBS and just import-capture) makes a new source: it changes the manifest and the film.',
  ].join('\n    ');
}

/** One message per capture of the film whose frames are not all in place (empty: ready to render). */
export async function captureProblems(film: string): Promise<string[]> {
  const out: string[] = [];
  for (const n of manifestNames(film)) {
    let a: CaptureAsset;
    try { a = readManifest(film, n); } catch (e) { out.push(e instanceof Error ? e.message : String(e)); continue; }
    const p = framesProblem(film, a);
    if (!p) continue;
    out.push([
      `capture "${a.id}" (${rel(path.join(capturesDir(film), n))}): ${p}; the frames are derived from the source video and not committed.`,
      `    source: ${a.source.file}, sha256 ${a.source.sha256}${a.source.bytes ? `, ${a.source.bytes} bytes (${mb(a.source.bytes)})` : ''}`,
      `    ${await sourceAdvice(film, a)}`,
    ].join('\n'));
  }
  return out;
}

/**
 * The render tools' pre-check: stop (exit 2) unless every capture of the film has its frames. With `json`, stdout is
 * the diagnostics list (validate --json) and the message goes to stderr.
 */
export async function requireCaptureFrames(film: string, o: { json?: boolean } = {}): Promise<void> {
  const problems = await captureProblems(film);
  if (!problems.length) return;
  const message = `films/${film}: ${problems.length} capture(s) cannot be rendered on this machine:\n${problems.join('\n')}`;
  if (o.json) console.log(JSON.stringify(problems.map((p) => ({ level: 'error', code: 'capture-frames', path: `films/${film}/captures`, message: p })), null, 1));
  console.error(message);
  process.exit(2);
}
