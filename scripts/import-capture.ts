/**
 * Turn a screen recording (OBS or any video file) into a capture asset of a film:
 *
 *   bun scripts/import-capture.ts --film <film> --id <id> <video> [--fps 30] [--crop W:H:X:Y] [--quality 2]
 *                                 [--viewport WxH] [--dpr 1] [--events <file.jsonl> --sync <rec>=<video>]
 *   bun scripts/import-capture.ts --film <film> --rebuild --from <dir>      re-derive every asset's frames from its source
 *
 * - The frames, a fixed-rate JPEG sequence (ffmpeg fps filter, -q:v <quality>), go to .cache/captures/<film>/<id>/
 *   (derived, not committed). They are written to a temporary directory and replace the old ones only when complete.
 *   The frame count must equal round(duration x fps).
 * - The manifest, films/<film>/captures/<id>.json (engine/capture.ts CaptureAsset), is committed: rate, frame count,
 *   frame size, viewport and device pixel ratio (defaults: the frame size and 1), the source's name, sha256, size,
 *   duration and format, how the frames were made (fps, crop, quality, ffmpeg version), and the events.
 * - The source video stays outside the repository (Develata's decision, 2026-10-09): only its sha256 is recorded.
 *   --rebuild finds each source by file name in --from, checks the sha256, and re-derives the frames (another machine,
 *   a cleared cache).
 * - Events: a JSON-lines file, one { t, type: click|move|key|mark, x, y, label } per line, on its own clock; --sync
 *   <rec>=<video> says that recording-clock time <rec> is video time <video>. Events outside the video are dropped.
 * Exit code 1 on any failure, 2 on bad arguments.
 */
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { CaptureAsset, CaptureEvent } from '../engine/capture';
import { FILM_ID, mediaDir, requireFilm } from './film-arg';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const opt = (k: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : undefined);
const usage = (m: string): never => { console.error(m); process.exit(2); };
const fail = (m: string): never => { throw new Error(m); };
const FILM = requireFilm(argv);
const CAPTURES = path.join(ROOT, 'films', FILM, 'captures');

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
async function probe(file: string) {
  const j = JSON.parse(await run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', file]));
  const s = j.streams?.[0], d = +j.format?.duration;
  const [n, m] = String(s?.r_frame_rate ?? '0/1').split('/').map(Number);
  if (!s || !Number.isFinite(d) || d <= 0) fail(`${file}: no video stream with a duration`);
  return { width: +s.width, height: +s.height, fps: m ? n / m : 0, duration: d };
}

interface Make { fps: number; crop: string | null; quality: number }

/** Extract the frames of `src` into the asset's cache directory (atomically); returns the frame count and size. */
async function extract(id: string, src: string, mk: Make): Promise<{ frames: number; width: number; height: number; ffmpeg: string }> {
  const dir = path.join(mediaDir(FILM), id), tmp = path.join(mediaDir(FILM), `.${id}.${process.pid}.tmp`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  try {
    const vf = [mk.crop ? `crop=${mk.crop}` : null, `fps=${mk.fps}`].filter(Boolean).join(',');
    await run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vf', vf, '-q:v', String(mk.quality), '-start_number', '0', path.join(tmp, '%05d.jpg')]);
    const frames = readdirSync(tmp).filter((n) => /^\d{5}\.jpg$/.test(n)).length;
    const size = JSON.parse(await run(['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', path.join(tmp, '00000.jpg')])).streams[0];
    const ffmpeg = (await run(['ffmpeg', '-version'])).split('\n')[0].trim();
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(path.dirname(dir), { recursive: true });
    renameSync(tmp, dir);
    return { frames, width: +size.width, height: +size.height, ffmpeg };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function readEvents(file: string, shift: number, duration: number): CaptureEvent[] {
  const out: CaptureEvent[] = [];
  readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    let e: CaptureEvent;
    try { e = JSON.parse(line); } catch { return fail(`${file}:${i + 1}: not JSON`); }
    if (!Number.isFinite(e.t) || !['click', 'move', 'key', 'mark'].includes(e.type)) fail(`${file}:${i + 1}: needs a numeric t and a type click|move|key|mark`);
    const t = e.t + shift;
    if (t >= 0 && t < duration) out.push({ ...e, t: +t.toFixed(4) });
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

try {
  if (argv.includes('--rebuild')) {
    const from = opt('from') ?? usage('--rebuild needs --from <dir> with the source videos');
    if (!existsSync(CAPTURES)) usage(`films/${FILM} has no captures`);
    for (const n of readdirSync(CAPTURES).filter((n) => n.endsWith('.json'))) {
      const a: CaptureAsset = JSON.parse(readFileSync(path.join(CAPTURES, n), 'utf8'));
      const src = path.join(from, a.source.file);
      if (!existsSync(src)) fail(`${a.id}: source ${a.source.file} not found in ${from}`);
      const h = await sha256(src);
      if (h !== a.source.sha256) fail(`${a.id}: ${src} has sha256 ${h}, the manifest says ${a.source.sha256}`);
      const r = await extract(a.id, src, { fps: a.fps, crop: (a.made.crop as string) || null, quality: +a.made.quality || 2 });
      if (r.frames !== a.frames || r.width !== a.width || r.height !== a.height) fail(`${a.id}: re-derived ${r.frames} frames ${r.width}x${r.height}, the manifest says ${a.frames} frames ${a.width}x${a.height}`);
      console.log(`${a.id}: ${r.frames} frames re-derived -> ${path.join(mediaDir(FILM), a.id)}`);
    }
  } else {
    const id = opt('id') ?? usage('--id <id> is required');
    if (!FILM_ID.test(id)) usage(`--id "${id}": lowercase letters, digits, hyphens`);
    const src = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--')) ?? usage('the video file is required');
    if (!existsSync(src) || !statSync(src).isFile()) usage(`${src}: not a file`);
    const fps = +(opt('fps') ?? 30);
    if (!(Number.isInteger(fps) && fps > 0 && fps <= 120)) usage(`--fps ${opt('fps')}: an integer 1–120`);
    const crop = opt('crop') ?? null;
    if (crop && !/^\d+:\d+:\d+:\d+$/.test(crop)) usage(`--crop ${crop}: W:H:X:Y in pixels`);
    const quality = +(opt('quality') ?? 2);
    const info = await probe(src);
    const expected = Math.round(info.duration * fps);
    const r = await extract(id, src, { fps, crop, quality });
    if (r.frames !== expected) fail(`${id}: ${r.frames} frames extracted, expected round(${info.duration} x ${fps}) = ${expected}`);
    const vp = opt('viewport')?.split('x').map(Number);
    if (vp && !(vp.length === 2 && vp.every((v) => Number.isInteger(v) && v > 0))) usage(`--viewport ${opt('viewport')}: WxH`);
    let events: CaptureEvent[] = [];
    if (opt('events')) {
      const sync = opt('sync')?.split('=').map(Number);
      if (!sync || sync.length !== 2 || !sync.every(Number.isFinite)) usage('--events needs --sync <recording time>=<video time> (seconds)');
      events = readEvents(opt('events')!, sync![1] - sync![0], r.frames / fps);
    }
    writeManifest({
      id, fps, frames: r.frames, width: r.width, height: r.height,
      viewport: vp ? { width: vp[0], height: vp[1] } : { width: r.width, height: r.height }, dpr: +(opt('dpr') ?? 1),
      source: { file: path.basename(src), sha256: await sha256(src), bytes: statSync(src).size, duration: info.duration, width: info.width, height: info.height, fps: +info.fps.toFixed(3) },
      events,
      made: { tool: 'import-capture', fps, crop: crop ?? '', quality, ffmpeg: r.ffmpeg },
    });
    console.log(`${id}: ${r.frames} frames ${r.width}x${r.height} @ ${fps} fps, ${events.length} events -> films/${FILM}/captures/${id}.json, frames in ${path.join(mediaDir(FILM), id)}`);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
