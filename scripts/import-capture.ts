/**
 * Turn a screen recording (OBS or any video file) into a capture asset of a film:
 *
 *   bun scripts/import-capture.ts --film <film> --id <id> <video> [--fps 30] [--crop W:H:X:Y] [--quality 2]
 *                                 [--viewport WxH] [--dpr 1] [--events <file.jsonl> --sync <rec>=<video>]
 *   bun scripts/import-capture.ts --film <film> --rebuild --from <dir>      re-derive every asset's frames from its source
 *
 * - The frames, a fixed-rate JPEG sequence of the first video stream (ffmpeg crop with exact=1, then the fps filter,
 *   -q:v <quality>), go to .cache/captures/<film>/<id>/ (derived, not committed). The frame count is what the fps filter
 *   gives (it rounds on timestamps); it must be at least one, numbered from 0 without gaps, and within one frame of the
 *   video stream's duration x fps when the container states that duration.
 * - The manifest, films/<film>/captures/<id>.json (engine/capture.ts CaptureAsset), is committed: rate, frame count,
 *   frame size, viewport (CSS pixels the source video shows; default the source size) and device pixel ratio (default
 *   1), the crop in source pixels, the source's name, sha256, size, duration and format, how the frames were made
 *   (fps, quality, ffmpeg version), and the events.
 * - The source video stays outside the repository (Develata's decision, 2026-10-09): only its sha256 is recorded.
 *   --rebuild finds each source by file name in --from, checks the sha256, and re-derives the frames (another machine,
 *   a cleared cache). Every manifest is checked first (id, file names, numbers), so no path comes from an unchecked value.
 * - Events: a JSON-lines file, one { t, type: click|move|key|mark, x, y, label, target, box } per line, on its own
 *   clock; --sync <rec>=<video> says that recording-clock time <rec> is video time <video>. Times keep full precision.
 *   Events outside the video are dropped.
 * - Nothing is replaced until everything is checked: frames are made in a staging directory; the old frames are moved
 *   aside, the new ones moved in, the manifest written (the commit point), and only then the old frames deleted (before
 *   the commit point a failure puts them back). Cleaning up after the commit point never fails the import: a leftover
 *   is reported as a warning. One import per asset at a time (a lock directory .cache/captures/<film>/.<id>.lock);
 *   --rebuild reads each manifest again under its lock and does all its work there.
 * Exit code 0: committed (every asset, for --rebuild); 1: nothing committed for the failing asset; 2: bad arguments.
 */
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { CaptureAsset, CaptureEvent } from '../engine/capture';
import { FILM_ID, mediaDir, requireFilm } from './film-arg';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const usage = (m: string): never => { console.error(m); process.exit(2); };
const fail = (m: string): never => { throw new Error(m); };
const FILM = requireFilm(argv);
let args: ReturnType<typeof parse>;
function parse() {
  return parseArgs({
    args: argv, allowPositionals: true, strict: true,
    options: {
      film: { type: 'string' }, id: { type: 'string' }, fps: { type: 'string' }, crop: { type: 'string' }, quality: { type: 'string' },
      viewport: { type: 'string' }, dpr: { type: 'string' }, events: { type: 'string' }, sync: { type: 'string' },
      rebuild: { type: 'boolean' }, from: { type: 'string' },
    },
  });
}
try { args = parse(); } catch (e) { usage(e instanceof Error ? e.message : String(e)); }
const o = args!.values;
const CAPTURES = path.join(ROOT, 'films', FILM, 'captures');
const MEDIA = path.resolve(mediaDir(FILM));

/** A path directly inside the film's media directory (the only place this tool creates, replaces or deletes). */
function inMedia(name: string): string {
  const p = path.resolve(MEDIA, name);
  if (path.dirname(p) !== MEDIA || !name || name === '.' || name === '..') fail(`refusing a media path outside ${MEDIA}: ${name}`);
  return p;
}

async function run(cmd: string[]): Promise<string> {
  const p = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code !== 0) fail(`${cmd[0]} failed (${code}): ${err.trim().split('\n').slice(-3).join(' ')}`);
  return out;
}
async function sha256(file: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk as Buffer);
  return h.digest('hex');
}
/** The first video stream (the one extract() maps): size, rate, and its duration if the container states it. */
async function probe(file: string) {
  const j = JSON.parse(await run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,duration', '-show_entries', 'format=duration', '-of', 'json', file]));
  const s = j.streams?.[0];
  if (!s) fail(`${file}: no video stream`);
  const [n, m] = String(s.r_frame_rate ?? '0/1').split('/').map(Number);
  const streamDur = +s.duration, formatDur = +j.format?.duration;
  return { width: +s.width, height: +s.height, fps: m ? n / m : 0, streamDuration: Number.isFinite(streamDur) && streamDur > 0 ? streamDur : null, duration: Number.isFinite(streamDur) && streamDur > 0 ? streamDur : formatDur };
}

type Crop = { x: number; y: number; w: number; h: number };
interface Make { fps: number; crop: Crop | null; quality: number }
interface Staged { tmp: string; frames: number; width: number; height: number; ffmpeg: string }

/** Extract the frames of `src` into a staging directory; checks the numbering. The caller commits or discards it. */
async function stage(id: string, src: string, mk: Make): Promise<Staged> {
  const tmp = inMedia(`.${id}.${process.pid}.tmp`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  try {
    const c = mk.crop;
    const vf = [c ? `crop=${c.w}:${c.h}:${c.x}:${c.y}:exact=1` : null, `fps=${mk.fps}`].filter(Boolean).join(',');
    await run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-map', '0:v:0', '-vf', vf, '-q:v', String(mk.quality), '-start_number', '0', path.join(tmp, '%05d.jpg')]);
    const nums = readdirSync(tmp).map((n) => /^(\d{5,})\.jpg$/.exec(n)).filter((m) => m !== null).map((m) => +m![1]).sort((a, b) => a - b);
    if (!nums.length) fail(`${id}: ffmpeg wrote no frames`);
    const gap = nums.findIndex((v, i) => v !== i);
    if (gap >= 0) fail(`${id}: frame files are not numbered 0..${nums.length - 1} (frame ${gap} is missing)`);
    const size = JSON.parse(await run(['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', path.join(tmp, '00000.jpg')])).streams[0];
    const ffmpeg = (await run(['ffmpeg', '-version'])).split('\n')[0].trim();
    return { tmp, frames: nums.length, width: +size.width, height: +size.height, ffmpeg };
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
}

/**
 * Put staged frames in place of the asset's (and write its manifest, if given). The old frames are moved aside first
 * and deleted only after everything succeeded; on a failure they are put back.
 */
function commit(id: string, s: Staged, manifest?: CaptureAsset): void {
  const dir = inMedia(id), bak = inMedia(`.${id}.${process.pid}.bak`);
  rmSync(bak, { recursive: true, force: true });
  const had = existsSync(dir);
  let moved = false;
  if (had) renameSync(dir, bak);
  try {
    renameSync(s.tmp, dir);
    moved = true;
    if (manifest) writeManifest(manifest);
  } catch (e) {
    // before the commit point: the new frames out, the old ones back
    if (moved) rmSync(dir, { recursive: true, force: true });
    if (had) renameSync(bak, dir);
    rmSync(s.tmp, { recursive: true, force: true });
    throw e;
  }
  // committed: what follows is cleanup only
  tidy(bak);
}

/** Remove a leftover after the commit point; a failure is a warning, never a failed import. */
function tidy(p: string): void {
  try { rmSync(p, { recursive: true, force: true }); } catch (e) { console.warn(`warning: could not remove ${p}: ${e instanceof Error ? e.message : e}`); }
}

/** One import per asset at a time: an exclusive lock directory, released by the returned function. */
function lock(id: string): () => void {
  mkdirSync(MEDIA, { recursive: true });
  const l = inMedia(`.${id}.lock`);
  try { mkdirSync(l); } catch { fail(`${id}: another import of this capture is running (or one crashed: remove ${l})`); }
  return () => tidy(l);
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function readEvents(file: string, shift: number, duration: number): CaptureEvent[] {
  const out: CaptureEvent[] = [];
  readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    let e: CaptureEvent;
    try { e = JSON.parse(line); } catch { return fail(`${file}:${i + 1}: not JSON`); }
    if (!num(e.t) || !['click', 'move', 'key', 'mark'].includes(e.type)) fail(`${file}:${i + 1}: needs a numeric t and a type click|move|key|mark`);
    if ((e.x !== undefined && !num(e.x)) || (e.y !== undefined && !num(e.y))) fail(`${file}:${i + 1}: x and y must be numbers`);
    const t = e.t + shift;
    if (t >= 0 && t < duration) out.push({ ...e, t });
  });
  return out.sort((a, b) => a.t - b.t);
}

/** Write the manifest atomically. */
function writeManifest(a: CaptureAsset): void {
  mkdirSync(CAPTURES, { recursive: true });
  const f = path.join(CAPTURES, `${a.id}.json`), tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(a, null, 1) + '\n');
  renameSync(tmp, f);
}

const posInt = (v: unknown, max = Infinity) => Number.isInteger(v) && (v as number) > 0 && (v as number) <= max;
/** A committed manifest, checked before anything is derived from it. */
function checkManifest(n: string, a: CaptureAsset): string[] {
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

function parseCrop(s: string, src: { width: number; height: number }): Crop {
  const m = /^(\d+):(\d+):(\d+):(\d+)$/.exec(s) ?? usage(`--crop ${s}: W:H:X:Y in pixels`);
  const [w, h, x, y] = m.slice(1).map(Number);
  if (!(w > 0 && h > 0 && x + w <= src.width && y + h <= src.height)) usage(`--crop ${s}: must lie inside the ${src.width}x${src.height} video`);
  return { x, y, w, h };
}

try {
  if (o.rebuild) {
    const from = o.from ?? usage('--rebuild needs --from <dir> with the source videos');
    if (!existsSync(CAPTURES)) usage(`films/${FILM} has no captures`);
    const read = (n: string): CaptureAsset => {
      let a: CaptureAsset;
      try { a = JSON.parse(readFileSync(path.join(CAPTURES, n), 'utf8')); } catch { return fail(`films/${FILM}/captures/${n}: not JSON`); }
      const p = checkManifest(n, a);
      if (p.length) fail(`films/${FILM}/captures/${n}: ${p.join('; ')}`);
      return a;
    };
    // every manifest checked before anything is touched; each read again under its lock (another import may commit
    // meanwhile), and the source check, extraction and commit done under that lock
    const names = readdirSync(CAPTURES).filter((n) => n.endsWith('.json'));
    for (const n of names) read(n);
    for (const n of names) {
      const release = lock(n.slice(0, -'.json'.length));
      try {
        const a = read(n);
        const src = path.join(from, a.source.file);
        if (!existsSync(src)) fail(`${a.id}: source ${a.source.file} not found in ${from}`);
        const h = await sha256(src);
        if (h !== a.source.sha256) fail(`${a.id}: ${src} has sha256 ${h}, the manifest says ${a.source.sha256}`);
        const s = await stage(a.id, src, { fps: a.fps, crop: a.crop, quality: +a.made.quality });
        if (s.frames !== a.frames || s.width !== a.width || s.height !== a.height) {
          rmSync(s.tmp, { recursive: true, force: true });
          fail(`${a.id}: re-derived ${s.frames} frames ${s.width}x${s.height}, the manifest says ${a.frames} frames ${a.width}x${a.height}`);
        }
        commit(a.id, s);
        console.log(`${a.id}: ${s.frames} frames re-derived -> ${inMedia(a.id)}`);
      } finally {
        release();
      }
    }
  } else {
    const id = o.id ?? usage('--id <id> is required');
    if (!FILM_ID.test(id)) usage(`--id "${id}": lowercase letters, digits, hyphens`);
    if (args!.positionals.length !== 1) usage(`one video file is required (got ${args!.positionals.length})`);
    const src = args!.positionals[0];
    if (!existsSync(src) || !statSync(src).isFile()) usage(`${src}: not a file`);
    const fps = +(o.fps ?? 30);
    if (!(Number.isInteger(fps) && fps > 0 && fps <= 120)) usage(`--fps ${o.fps}: an integer 1–120`);
    const quality = +(o.quality ?? 2);
    if (!(Number.isInteger(quality) && quality >= 1 && quality <= 31)) usage(`--quality ${o.quality}: an integer 1–31`);
    const vp = o.viewport?.split('x').map(Number);
    if (vp && !(vp.length === 2 && vp.every((v) => Number.isInteger(v) && v > 0))) usage(`--viewport ${o.viewport}: WxH`);
    const dpr = +(o.dpr ?? 1);
    if (!(Number.isFinite(dpr) && dpr > 0)) usage(`--dpr ${o.dpr}: a number > 0`);
    let sync: number[] | null = null;
    if (o.events) {
      sync = o.sync?.split('=').map(Number) ?? null;
      if (!sync || sync.length !== 2 || !sync.every(Number.isFinite)) usage('--events needs --sync <recording time>=<video time> (seconds)');
    }
    const info = await probe(src);
    const crop = o.crop ? parseCrop(o.crop, info) : null;
    const release = lock(id);
    try {
      const s = await stage(id, src, { fps, crop, quality });
      try {
        if (info.streamDuration !== null && Math.abs(s.frames - info.streamDuration * fps) > 1 + 1e-6)
          fail(`${id}: ${s.frames} frames extracted, but the video stream lasts ${info.streamDuration}s (${(info.streamDuration * fps).toFixed(2)} frames at ${fps} fps)`);
        const events = o.events ? readEvents(o.events, sync![1] - sync![0], s.frames / fps) : [];
        const asset: CaptureAsset = {
          id, fps, frames: s.frames, width: s.width, height: s.height,
          viewport: vp ? { width: vp[0], height: vp[1] } : { width: info.width, height: info.height }, dpr, crop,
          source: { file: path.basename(src), sha256: await sha256(src), bytes: statSync(src).size, duration: info.duration, width: info.width, height: info.height, fps: +info.fps.toFixed(3) },
          events,
          made: { tool: 'import-capture', fps, quality, ffmpeg: s.ffmpeg },
        };
        commit(id, s, asset);
        console.log(`${id}: ${s.frames} frames ${s.width}x${s.height} @ ${fps} fps, ${events.length} events -> films/${FILM}/captures/${id}.json, frames in ${inMedia(id)}`);
      } finally {
        tidy(s.tmp);
      }
    } finally {
      release();
    }
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
