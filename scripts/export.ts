/**
 * Offline export (the design follows abstract-algebra-promo's export.mjs, driven here through puppeteer-core):
 *
 *   bun scripts/export.ts --film <id> [--workers 4] [--from 0] [--to <end>] [--crf 18] [--out out/<id>/<id>.mp4] [--draft]
 *     --draft: a quick look while editing, not the film: no motion blur (one sample per frame), x264 veryfast, written
 *     to out/<id>/<id>[-<style>]-draft.mp4 unless --out; with --from/--to it renders just the part being worked on.
 *   Frames reach this process as JPEG files the page POSTs to the local server (__frameTo: the JPEG is encoded off the
 *   page's main thread while it draws the next frame), each under the job's random token and its frame number; a
 *   frame out of range, repeated, already written or not a JPEG is refused and fails the job. --transport dataurl
 *   uses the older path (the data URL returned over the DevTools protocol), for comparison.
 *                         [--audio out/<id>/music.wav | --noaudio] [--deadline <seconds>]
 *   bun scripts/export.ts --film <id> --shots 5,20.5,60 [--dir out/<id>/shots]  write single frames (JPEG) for checking
 *   bun scripts/export.ts --film <id> --cues [films/<id>/cues.json]          dump the sound-effect cue sheet for the score
 *   bun scripts/export.ts --film <id> --timeline [films/<id>/timeline.json]  dump the resolved timeline (scene frames / seconds)
 *   bun scripts/export.ts --film <id> --scenes                               print the scene list with start/end times
 *   bun scripts/export.ts --film <id> --narration [out/<id>/narration.cues.json]  where each narration line plays, for audio/mix.py
 *   every form takes [--style <id>]: one of the film's styles (?style=<id>); omitted: the film's default.
 *   The page is the film's build, dist/<id>/ (just build <id>).
 *
 * Every worker is its own headless Chrome rendering exact frame times through the page's ?export=1 hooks.
 * Frames are handed out in chunks of consecutive frames (so a worker can read a capture's frames ahead, in order) and
 * written to ffmpeg in order. Needs `just build <id>` first (the page is
 * served from dist/<id>/), Chrome, and ffmpeg / ffprobe on PATH.
 *
 * Output contract (docs/plan/reusable-engine.md, "全局契约 / 导出产物"):
 *   - the range is snapped to the film's frame grid (fps from the page): frames round(from*fps) .. round(to*fps);
 *     the audio is cut to exactly that span;
 *   - a second export to the same --out fails at once: the lock is taken before anything else starts;
 *   - the video is encoded to a job-private temporary file next to --out; only after ffprobe (exit code checked,
 *     every field present and finite) confirms frame count, duration, an audio track as long as the video, and the
 *     colour tags is it renamed over --out (the commit point); on any failure before that, the old --out is left
 *     untouched and the temporary file is deleted;
 *   - (Windows) an existing --out that another program holds open without write sharing (a video player) fails the
 *     job before rendering; if the final rename is refused anyway (the file is held without delete sharing), it is
 *     retried for 5 s, and if --out is still held, the verified video is kept next to it as
 *     <out>.verified-<pid>.mp4 and the job fails (exit 1) with that path, so the render is not lost;
 *   - audio is required: a missing audio file is an error unless --noaudio; audio shorter than the span is an error;
 *   - one deadline (--deadline, default max(600 s, 2 s per frame)) covers the whole job, from launching browsers to
 *     the final probe; it, Ctrl+C / SIGTERM, worker launch failure and encoder failure all cancel the job: ffmpeg
 *     and ffprobe are killed (which unblocks any pending write), every Chrome process tree is killed, and the job
 *     exits. Puppeteer's own signal handlers are off, so cleanup always runs. Not covered: a hard kill of this
 *     process itself (that would need an external supervisor or a Windows Job Object);
 *   - colour: canvas JPEGs (full-range BT.601 YCbCr) are converted to limited-range BT.709 and tagged bt709. The
 *     canvas values are sRGB-encoded and passed through unchanged (no transfer conversion): tagging them bt709 is
 *     the usual convention for screen / web content, and what players and browsers expect for SDR HD video.
 * Exit codes: 0 success, 1 job failed, 2 usage or setup error, 130 interrupted.
 * Test hooks: EXPORT_FFMPEG / EXPORT_FFPROBE replace the binaries (a path or a JSON command array); --abort-after <n>
 * cancels after n frames.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { chromeArgs, findChrome, loadFilm, killTree, serveDist } from './chrome';
import { mediaDir, requireFilm } from './film-arg';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const opt = (k: string, d?: string): string | undefined => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] !== undefined && !/^--[a-z]/.test(argv[i + 1]) ? argv[i + 1] : d;
};
const FILM = requireFilm(argv);
const DIST = path.join(ROOT, 'dist', FILM);
const flag = (k: string): boolean => argv.includes(`--${k}`);
const fail = (exit: number, message: string): never => { throw Object.assign(new Error(message), { exit }); };

const CRF = opt('crf', '18')!;
const DRAFT = flag('draft');
const TRANSPORT = opt('transport', 'blob')!;
if (!['blob', 'dataurl'].includes(TRANSPORT)) { console.error('--transport blob|dataurl'); process.exit(2); }
/** The job's token for posted frames, and where they go (set once the frame range is known). */
const TOKEN = crypto.randomUUID().replace(/-/g, '');
let takeFrame: ((n: number, body: Uint8Array) => string | null) | null = null;
const SINGLE = flag('shots') || flag('cues') || flag('timeline') || flag('scenes') || flag('narration');
const WORKERS = SINGLE ? 1 : Math.max(1, +(opt('workers', '4') ?? 4));
const STYLE = opt('style');
const OUT = path.resolve(ROOT, opt('out', `out/${FILM}/${FILM}${STYLE ? `-${STYLE}` : ''}${DRAFT ? '-draft' : ''}.mp4`)!);
// the audio: --audio, else the final mix out/<film>/master.wav (music + narration, audio/mix.py) when there is one, else
// the score's loudness-normalized master out/<film>/music.wav (the MP3s are only for the preview player). A final mix
// must still match what it was made from (master.json: the music, the narration lock, the placements), checked below.
const MASTER = path.join(ROOT, 'out', FILM, 'master.wav');
const AUDIO = path.resolve(ROOT, opt('audio') ?? (existsSync(MASTER) ? MASTER : `out/${FILM}/music.wav`));
const NOAUDIO = flag('noaudio');
// a command prefix: a plain path, or a JSON array such as ["bun", "stub.ts"] (test hooks)
const cmdPrefix = (v: string | undefined, d: string): string[] => (v ? (v.startsWith('[') ? JSON.parse(v) : [v]) : [d]);
const FFMPEG = cmdPrefix(process.env.EXPORT_FFMPEG, 'ffmpeg');
const FFPROBE = cmdPrefix(process.env.EXPORT_FFPROBE, 'ffprobe');
const ABORT_AFTER = opt('abort-after') !== undefined ? +opt('abort-after')! : -1;

// ---- job state: everything cancel() and cleanup() act on
const browsers: Browser[] = [];
const children = new Set<ReturnType<typeof Bun.spawn>>();
let tmpOut: string | null = null;
let lockPath: string | null = null;
let server: ReturnType<typeof serveDist> | null = null;
let cancelled: string | null = null;
const cancelReason = (): string | null => cancelled; // read through a call: it is set from callbacks
/** Cancel the job: remember why, and kill ffmpeg / ffprobe so that a blocked write or probe returns at once. */
let onCancel: (why: string) => void = () => {};
/** Settles (rejects) when the job is cancelled: waits that nothing else would interrupt race against it. */
const cancelledP = new Promise<never>((_, reject) => { onCancel = (why) => reject(new Error(why)); });
cancelledP.catch(() => {});
function cancel(why: string): void {
  if (cancelled) return;
  cancelled = why;
  onCancel(why);
  for (const c of children) { try { c.kill('SIGKILL'); } catch {} }
}
process.on('SIGINT', () => cancel('interrupted'));
process.on('SIGTERM', () => cancel('terminated'));
const checkCancel = () => { if (cancelReason()) throw new Error(cancelReason()!); };

function spawnTracked(cmd: string[], o: Parameters<typeof Bun.spawn>[1]): ReturnType<typeof Bun.spawn> {
  const p = Bun.spawn(cmd, o);
  children.add(p);
  p.exited.then(() => children.delete(p));
  if (cancelReason()) { try { p.kill('SIGKILL'); } catch {} }
  return p;
}

/** Remove a file, retrying while Windows still holds it open; returns false if it is still there. */
async function removeFile(f: string): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    try { rmSync(f, { force: true }); } catch {}
    if (!existsSync(f)) return true;
    await Bun.sleep(100);
  }
  return false;
}

let cleaned = false;
async function cleanup(): Promise<string[]> {
  if (cleaned) return [];
  cleaned = true;
  const problems: string[] = [];
  for (const c of children) {
    try { c.kill('SIGKILL'); } catch {}
    if (await Promise.race([c.exited.then(() => true), Bun.sleep(5000).then(() => false)]) === false) problems.push(`process ${c.pid} did not exit`);
  }
  // close politely for up to 3 s, then kill the whole Chrome process tree
  await Promise.all(browsers.map(async (b) => {
    const pid = b.process()?.pid;
    await Promise.race([b.close().catch(() => {}), Bun.sleep(3000)]);
    if (!(await killTree(pid))) problems.push(`Chrome ${pid} did not exit`);
  }));
  server?.stop();
  if (tmpOut && !(await removeFile(tmpOut))) problems.push(`could not delete ${tmpOut}`);
  if (lockPath && !(await removeFile(lockPath))) problems.push(`could not delete ${lockPath}`);
  return problems;
}

// ---- publishing over an existing --out (Windows: a player holding the file blocks the rename)
const IN_USE = new Set(['EBUSY', 'EPERM', 'EACCES']);
/** Fail before rendering if --out exists and another program holds it open without write sharing. Windows only: a
 *  POSIX rename replaces a file whatever holds it, and needs no write access to the old file (a read-only old video
 *  would fail this probe with EACCES though nothing holds it). */
function assertReplaceable(out: string): void {
  if (process.platform !== 'win32' || !existsSync(out)) return;
  try {
    closeSync(openSync(out, 'r+'));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code ?? '';
    if (IN_USE.has(code)) fail(1, `${out} is in use by another program (${code}): is it open in a video player? Close it and run again`);
    throw e;
  }
}
/** Rename the verified temporary file over --out, retrying for 5 s while --out is held; if it stays held, keep the
 *  verified video as <out>.verified-<pid>.mp4 and fail with its path. */
async function publish(tmp: string, out: string): Promise<void> {
  const until = performance.now() + 5000;
  for (;;) {
    checkCancel();
    try {
      renameSync(tmp, out);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? '';
      if (!IN_USE.has(code)) throw e;
      if (performance.now() < until) {
        await Bun.sleep(250);
        continue;
      }
      const kept = `${out.replace(/\.mp4$/i, '')}.verified-${process.pid}.mp4`;
      renameSync(tmp, kept);
      tmpOut = null; // kept on purpose: cleanup must not delete it
      fail(1, `could not replace ${out} (${code}): is it open in a video player? The verified video is kept as ${kept}`);
    }
  }
}

// ---- lock
const pidAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code !== 'ESRCH'; }
};
/** Create `file` exclusively with this process's identity; false if it already exists. */
function createExclusive(file: string): boolean {
  try {
    const fd = openSync(file, 'wx');
    writeSync(fd, `${process.pid}\n${hostname()}\n${new Date().toISOString()}\n`);
    closeSync(fd);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw e;
  }
}
/** A lock is stale if it names a process that no longer runs on this host, or is empty and older than 10 s. */
function lockIsStale(file: string): boolean {
  let text: string, age: number;
  try { text = readFileSync(file, 'utf8'); age = Date.now() - statSync(file).mtimeMs; } catch { return false; }
  const [pid, host] = text.split('\n');
  if (!pid) return age > 10_000;
  if (host && host !== hostname()) return false;
  return !pidAlive(Number(pid));
}
/**
 * Exclusive lock next to `out`. Taking over a stale lock is serialized by a second, short-lived `.break` lock:
 * every deletion of the main lock happens while holding it, after re-checking staleness, so two processes can never
 * both succeed (a fresh lock cannot appear between the re-check and the delete, since deleting needs `.break`).
 */
function takeLock(out: string): string {
  const lp = `${out}.lock`, bp = `${lp}.break`;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (createExclusive(lp)) return lp;
    if (!lockIsStale(lp)) {
      const pid = (() => { try { return readFileSync(lp, 'utf8').split('\n')[0]; } catch { return '?'; } })();
      fail(1, `another export (pid ${pid || '?'}) is writing ${out} (lock ${lp})`);
    }
    if (!createExclusive(bp)) {
      if (lockIsStale(bp)) fail(1, `stale ${bp} left by a crashed export: delete it by hand`);
      Bun.sleepSync(100);
      continue;
    }
    try { if (lockIsStale(lp)) rmSync(lp, { force: true }); } finally { rmSync(bp, { force: true }); }
  }
  return fail(1, `cannot lock ${out}`);
}

// ---- ffprobe, strictly
async function runProbe(args: string[], timeoutMs = 60_000): Promise<string> {
  const p = spawnTracked([...FFPROBE, '-v', 'error', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const timer = setTimeout(() => { try { p.kill('SIGKILL'); } catch {} }, timeoutMs);
  const [out, err, code] = await Promise.all([new Response(p.stdout as ReadableStream).text(), new Response(p.stderr as ReadableStream).text(), p.exited]);
  clearTimeout(timer);
  checkCancel();
  if (code !== 0) throw new Error(`ffprobe failed (exit ${code}): ${err.trim().split('\n').slice(-1)[0] ?? ''}`);
  return out;
}
const finite = (v: unknown, what: string): number => {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new Error(`ffprobe reported no usable ${what} (${JSON.stringify(v)})`);
  return n;
};
interface Probe { videoFrames: number; videoDuration: number; audioDuration: number | null; color: string }
async function probe(file: string): Promise<Probe> {
  const j = JSON.parse(await runProbe(['-count_packets', '-show_entries', 'stream=codec_type,nb_read_packets,duration,color_space,color_primaries,color_transfer,color_range', '-of', 'json', file]));
  const streams: Record<string, unknown>[] = Array.isArray(j?.streams) ? j.streams : [];
  const v = streams.find((s) => s.codec_type === 'video');
  const a = streams.find((s) => s.codec_type === 'audio');
  if (!v) throw new Error('ffprobe found no video stream');
  return {
    videoFrames: finite(v.nb_read_packets, 'video frame count'),
    videoDuration: finite(v.duration, 'video duration'),
    audioDuration: a ? finite(a.duration, 'audio duration') : null,
    color: [v.color_space, v.color_primaries, v.color_transfer, v.color_range].join('/'),
  };
}
const audioSeconds = async (file: string) => finite((await runProbe(['-show_entries', 'format=duration', '-of', 'csv=p=0', file])).trim(), `duration of ${file}`);

const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
/** The placements' identity, computed the same way by audio/mix.py (id, start, duration to 1 µs). */
/**
 * The placements' identity: ids with start and duration in whole microseconds (floor(x * 1e6 + 0.5)). Computed here only:
 * export --narration writes it into the placements file, audio/mix.py copies it into master.json.
 */
const placementsDigest = (ps: { id: string; t: number; dur: number }[]) =>
  sha256(ps.map((p) => `${p.id}:${Math.floor(p.t * 1e6 + 0.5)}:${Math.floor(p.dur * 1e6 + 0.5)}`).join('\n'));
/** Why the final mix no longer matches the film (out/<film>/master.json, written by audio/mix.py), or null. */
function masterStale(tl: { frames: number; fps: number }, placements: { id: string; t: number; dur: number }[]): string | null {
  const meta = path.join(ROOT, 'out', FILM, 'master.json');
  if (!existsSync(meta)) return 'no master.json';
  const m: { frames: number; fps: number; music: { path: string; external: boolean; sha256: string } | 'none'; lock: string; placements: string; master: string } = JSON.parse(readFileSync(meta, 'utf8'));
  if (m.frames !== tl.frames || m.fps !== tl.fps) return `it was mixed for ${m.frames} frames at ${m.fps} fps, the film has ${tl.frames} at ${tl.fps}`;
  if (!existsSync(MASTER) || sha256(readFileSync(MASTER)) !== m.master) return 'master.wav is not the one master.json describes';
  if (m.music !== 'none') {
    const music = m.music.external ? m.music.path : path.join(ROOT, m.music.path);
    if (!existsSync(music) || sha256(readFileSync(music)) !== m.music.sha256) return 'the music changed';
  }
  const lock = path.join(ROOT, 'films', FILM, 'narration.lock.json');
  if ((existsSync(lock) ? sha256(readFileSync(lock)) : 'none') !== m.lock) return 'the narration changed';
  if (placementsDigest(placements) !== m.placements) return 'the narration moved in the timeline';
  return null;
}

interface Worker {
  id: number; browser: Browser; page: Page; frame: (t: number) => Promise<Buffer>;
  /** Render frame n (time t) and have the page post it as JPEG n; resolves once drawn (the upload goes on). */
  frameTo: (n: number, t: number) => Promise<void>;
  /** Wait for this worker's uploads; throws the first upload error. */
  drain: () => Promise<void>;
  prefetch: (ts: number[]) => Promise<void>; evaluate: <T>(fn: () => T) => Promise<T>;
}
async function launch(id: number, chrome: string, url: string, fps: () => number): Promise<Worker> {
  checkCancel();
  const browser = await puppeteer.launch({
    executablePath: chrome, headless: true, defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }, args: chromeArgs('platform'),
    timeout: 30_000, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
  });
  browsers.push(browser);
  checkCancel();
  const page = await browser.newPage();
  page.on('pageerror', (e: unknown) => console.error(`worker ${id} page error:`, e instanceof Error ? e.message : String(e)));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`worker ${id} console.error:`, m.text()); });
  await loadFilm(page, url, FILM, STYLE ?? '');
  const frame = async (t: number): Promise<Buffer> => {
    const durl: string = await page.evaluate((t, f, k) => window.__frame(t, f, k), t, fps(), DRAFT ? 1 : 3);
    return Buffer.from(durl.slice(durl.indexOf(',') + 1), 'base64');
  };
  const frameTo = (n: number, t: number) => page.evaluate((u, t, f, k) => window.__frameTo(u, t, f, k), `${url}/frames/${TOKEN}/${n}`, t, fps(), DRAFT ? 1 : 3);
  const drain = () => page.evaluate(() => window.__drain());
  const prefetch = (ts: number[]) => page.evaluate((ts) => window.__prefetch(ts), ts);
  return { id, browser, page, frame, frameTo, drain, prefetch, evaluate: (fn) => page.evaluate(fn) };
}

let code = 0;
let committed = false; // set once the rename has published the export
let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
try {
  if (!existsSync(path.join(DIST, 'index.html'))) fail(2, `dist/${FILM}/index.html missing: run \`just build ${FILM}\` first`);
  let chrome = '';
  try { chrome = findChrome(); } catch (e) { fail(2, (e as Error).message); }
  const video = !SINGLE;
  const deadline = opt('deadline') !== undefined ? +opt('deadline')! : 0; // 0: set once the frame count is known
  if (video) {
    // an explicit --audio is checked now; the default once the page says whether the film has narration (below)
    if (!NOAUDIO && opt('audio') !== undefined && !existsSync(AUDIO)) fail(2, `audio ${AUDIO} not found`);
    mkdirSync(path.dirname(OUT), { recursive: true });
    lockPath = takeLock(OUT);
    assertReplaceable(OUT);
    if (deadline > 0) deadlineTimer = setTimeout(() => cancel(`deadline of ${deadline}s exceeded`), deadline * 1000);
  }
  server = serveDist(DIST, { media: mediaDir(FILM), frames: { token: TOKEN, take: (n, b) => (takeFrame ? takeFrame(n, b) : 'no export is taking frames') } });
  let FPS = 30;
  const tLoad = performance.now();
  const workers = await Promise.all(Array.from({ length: WORKERS }, (_, i) => launch(i, chrome, server!.url, () => FPS)));
  checkCancel();
  const tl = await workers[0].evaluate(() => window.__timeline());
  FPS = tl.fps;
  const gpu = await workers[0].evaluate(() => window.__gpu());
  console.log(`${WORKERS} worker${WORKERS > 1 ? 's' : ''} ready in ${((performance.now() - tLoad) / 1000).toFixed(1)}s   renderer: ${gpu}`);
  if (/swiftshader|llvmpipe|software/i.test(gpu)) console.error('!!! WebGL is on a software renderer');
  if (!SINGLE && !NOAUDIO) {
    // a film with narration exports its final mix (or --audio, explicitly); the mix must match the film as it is now
    const { placements, unplaced } = await workers[0].evaluate(() => window.__narration());
    if (unplaced.length) fail(2, `narration lines placed in no scene: ${unplaced.join(', ')}`);
    if (placements.length && opt('audio') === undefined && AUDIO !== MASTER) fail(2, `the film has narration but no final mix (${path.relative(ROOT, MASTER)}): run just mix ${FILM}`);
    if (!existsSync(AUDIO)) fail(2, `audio ${AUDIO} not found: run \`just music ${FILM}\` (and \`just mix ${FILM}\`), or pass --noaudio for a silent export`);
    if (AUDIO === MASTER) {
      const stale = masterStale(tl, placements);
      if (stale) fail(2, `the final mix ${path.relative(ROOT, MASTER)} is stale (${stale}): run just mix ${FILM}`);
    }
  }

  if (flag('scenes')) {
    const list = await workers[0].evaluate(() => window.__scenes());
    for (const s of list) console.log(`${s.name.padEnd(12)} ${s.start.toFixed(2).padStart(8)} -> ${s.end.toFixed(2).padStart(8)}  (${(s.end - s.start).toFixed(1)}s)`);
    console.log(`total ${tl.duration.toFixed(2)}s`);
  } else if (flag('cues') || flag('timeline') || flag('narration')) {
    if (flag('timeline')) {
      const tf = path.resolve(ROOT, opt('timeline', `films/${FILM}/timeline.json`)!);
      mkdirSync(path.dirname(tf), { recursive: true });
      writeFileSync(tf, JSON.stringify(tl, null, 1));
      console.log(`wrote timeline (${tl.scenes.length} scenes, ${tl.frames} frames) to ${tf}`);
    }
    if (flag('narration')) {
      const file = path.resolve(ROOT, opt('narration', `out/${FILM}/narration.cues.json`)!);
      const { placements, unplaced } = await workers[0].evaluate(() => window.__narration());
      if (unplaced.length) fail(1, `narration lines placed in no scene: ${unplaced.join(', ')}`);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ film: FILM, frames: tl.frames, fps: tl.fps, bar: (4 * 60) / tl.bpm, duration: tl.duration, digest: placementsDigest(placements), placements }, null, 1));
      console.log(`wrote ${placements.length} narration placements to ${file}`);
    }
    if (flag('cues')) {
      const file = path.resolve(ROOT, opt('cues', `films/${FILM}/cues.json`)!);
      const cues = await workers[0].evaluate(() => window.__cues());
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(cues, null, 1));
      console.log(`wrote ${cues.length} cues to ${file}`);
    }
  } else if (flag('shots')) {
    const dir = path.resolve(ROOT, opt('dir', `out/${FILM}/shots${STYLE ? `-${STYLE}` : ''}`)!);
    mkdirSync(dir, { recursive: true });
    for (const t of opt('shots', '0')!.split(',').map(Number)) {
      const f = path.join(dir, `t${t.toFixed(2).padStart(7, '0')}.jpg`);
      writeFileSync(f, await workers[0].frame(t));
      console.log(f);
    }
  } else {
    // ---- video: the range on the film's frame grid
    const from = Number(opt('from', '0')), to = Number(opt('to', String(tl.duration)));
    if (!Number.isFinite(from) || !Number.isFinite(to)) fail(2, `--from / --to must be numbers (got ${opt('from')} / ${opt('to')})`);
    const F0 = Math.round(from * FPS), F1 = Math.min(Math.round(to * FPS), tl.frames);
    if (F0 < 0 || F1 <= F0) fail(2, `empty or invalid range: frames ${F0}..${F1} of 0..${tl.frames} (--from ${from} --to ${to})`);
    const N = F1 - F0, span = N / FPS;
    if (!deadlineTimer) deadlineTimer = setTimeout(() => cancel(`deadline of ${Math.max(600, N * 2)}s exceeded`), Math.max(600, N * 2) * 1000);
    if (!NOAUDIO) {
      const secs = await audioSeconds(AUDIO);
      if (secs + 1e-6 < F1 / FPS) fail(1, `audio ${AUDIO} is ${secs.toFixed(3)}s, shorter than the export end ${(F1 / FPS).toFixed(3)}s`);
    }
    tmpOut = `${OUT.replace(/\.mp4$/i, '')}.${process.pid}.partial.mp4`;
    console.log(`rendering ${N} frames (${F0}..${F1}, ${(F0 / FPS).toFixed(3)}s -> ${(F1 / FPS).toFixed(3)}s @ ${FPS} fps) -> ${OUT}${NOAUDIO ? ' (no audio)' : `, audio ${path.relative(ROOT, AUDIO)}`}`);
    const ffArgs = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0'];
    if (!NOAUDIO) ffArgs.push('-ss', (F0 / FPS).toFixed(6), '-t', span.toFixed(6), '-i', AUDIO, '-map', '0:v:0', '-map', '1:a:0');
    ffArgs.push('-vf', // accurate_rnd / full_chroma_int: swscale's default rounding shifts colours by 2-6 levels here (measured, see the plan's 1c record)
      'scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+full_chroma_inp,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv',
      '-c:v', 'libx264', '-preset', DRAFT ? 'veryfast' : 'medium', '-crf', CRF, '-profile:v', 'high', '-r', String(FPS),
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv');
    if (!NOAUDIO) ffArgs.push('-c:a', 'aac', '-b:a', '256k');
    ffArgs.push('-movflags', '+faststart', '-f', 'mp4', tmpOut);
    const enc = spawnTracked([...FFMPEG, ...ffArgs], { stdin: 'pipe', stdout: 'inherit', stderr: 'inherit' });
    const stdin = enc.stdin as import('bun').FileSink;
    const t0 = performance.now();

    // frames are rendered in chunks of CHUNK consecutive frames by whichever worker is free, and written in order;
    // rendering may run AHEAD frames past the encoder. A worker starts loading the media of its whole chunk when it takes
    // it (captures are read in order, ahead of the frame being drawn).
    const CHUNK = 15;
    const AHEAD = Math.max(12, 2 * CHUNK) * WORKERS;
    const ready = new Map<number, Buffer>();
    let nextTake = 0, nextWrite = 0;
    let failed: Error | null = null;
    const stop = () => failed ?? (cancelReason() ? new Error(cancelReason()!) : enc.exitCode !== null ? new Error(`ffmpeg exited early with code ${enc.exitCode}`) : null);
    // posted frames: frame i of this range is URL number i; anything else is refused and fails the job
    const taken = new Set<number>();
    takeFrame = (n, body) => {
      const why = !(Number.isInteger(n) && n >= 0 && n < N) ? `frame ${n} is outside 0..${N - 1}`
        : taken.has(n) ? `frame ${n} arrived twice`
        : !(body.length > 2 && body[0] === 0xff && body[1] === 0xd8) ? `frame ${n} is not a JPEG`
        : null;
      if (why) failed ??= new Error(`posted frame refused: ${why}`);
      else { taken.add(n); ready.set(n, Buffer.from(body.buffer, body.byteOffset, body.byteLength)); }
      return why;
    };
    const work = async (w: Worker): Promise<void> => {
      while (nextTake < N && !stop()) {
        if (nextTake >= nextWrite + AHEAD) { await Bun.sleep(5); continue; }
        const a = nextTake, b = Math.min(N, a + CHUNK);
        nextTake = b;
        try {
          await w.prefetch(Array.from({ length: b - a }, (_, k) => (F0 + a + k) / FPS));
          if (TRANSPORT === 'dataurl') for (let i = a; i < b && !stop(); i++) ready.set(i, await w.frame((F0 + i) / FPS));
          else for (let i = a; i < b && !stop(); i++) await w.frameTo(i, (F0 + i) / FPS);
        } catch (e) { failed ??= e instanceof Error ? e : new Error(String(e)); }
      }
      // the last uploads; a cancelled job does not wait for them
      if (TRANSPORT === 'blob' && !stop()) { try { await Promise.race([w.drain(), cancelledP]); } catch (e) { failed ??= e instanceof Error ? e : new Error(String(e)); } }
    };
    const write = async (): Promise<void> => {
      let lastLog = 0;
      while (nextWrite < N) {
        const s = stop();
        if (s) throw s;
        const buf = ready.get(nextWrite);
        if (!buf) { await Bun.sleep(5); continue; }
        ready.delete(nextWrite);
        try {
          stdin.write(buf);
          await stdin.flush();
        } catch (e) {
          // a broken pipe usually means ffmpeg exited: give it a moment so the error names its exit code
          await Promise.race([enc.exited, Bun.sleep(1000)]);
          throw stop() ?? new Error(`ffmpeg stopped accepting frames: ${e instanceof Error ? e.message : String(e)}`);
        }
        nextWrite++;
        if (nextWrite === ABORT_AFTER) cancel('interrupted (test hook)');
        const now = performance.now();
        if (now - lastLog > 10_000 || nextWrite === N) {
          lastLog = now;
          const rate = nextWrite / ((now - t0) / 1000);
          console.log(`frame ${nextWrite}/${N}  ${((100 * nextWrite) / N).toFixed(1)}%  ${rate.toFixed(1)} fps  eta ${Math.round((N - nextWrite) / rate)}s`);
        }
      }
    };
    try {
      await Promise.race([Promise.all([write(), ...workers.map(work)]), cancelledP]);
      // a failure after the last frame was written (e.g. a lost upload response) still fails the job
      const late = stop();
      if (late) throw late;
    } finally {
      // end() can reject asynchronously (EPIPE) when ffmpeg is already gone
      try { Promise.resolve(stdin.end()).catch(() => {}); } catch {}
    }
    const ffCode = await enc.exited;
    checkCancel();
    if (ffCode !== 0) throw new Error(`ffmpeg exited with ${ffCode}`);
    // check the result before it replaces --out
    const p = await probe(tmpOut);
    const problems: string[] = [];
    const aacFrame = 1024 / 44100; // AAC packets are 1024 samples: the audio track ends on a packet boundary
    if (p.videoFrames !== N) problems.push(`video has ${p.videoFrames} frames, expected ${N}`);
    if (Math.abs(p.videoDuration - span) > 0.5 / FPS) problems.push(`video lasts ${p.videoDuration.toFixed(4)}s, expected ${span.toFixed(4)}s`);
    if (!NOAUDIO && p.audioDuration === null) problems.push('no audio track');
    if (!NOAUDIO && p.audioDuration !== null && Math.abs(p.audioDuration - span) > aacFrame + 1e-3) problems.push(`audio lasts ${p.audioDuration.toFixed(4)}s, the video ${span.toFixed(4)}s`);
    if (p.color !== 'bt709/bt709/bt709/tv') problems.push(`video colour tags are ${p.color}, expected bt709/bt709/bt709/tv (space/primaries/transfer/range)`);
    if (problems.length) throw new Error(`output failed its checks: ${problems.join('; ')}`);
    const size = statSync(tmpOut).size;
    checkCancel();
    await publish(tmpOut, OUT); // the commit point: nothing after this may turn the job into a failure
    tmpOut = null;
    committed = true;
    console.log(`done: ${OUT}  (${(size / 1e6).toFixed(1)} MB, ${((performance.now() - t0) / 60000).toFixed(1)} min, ${p.videoFrames} frames${NOAUDIO ? '' : `, audio ${p.audioDuration!.toFixed(3)}s`})`);
  }
} catch (e) {
  const err = e as Error & { exit?: number };
  const why = cancelReason();
  console.error(`export failed: ${why ?? err.message}`);
  code = err.exit ?? (why?.startsWith('interrupted') || why === 'terminated' ? 130 : 1);
} finally {
  if (deadlineTimer) clearTimeout(deadlineTimer);
  const problems = await cleanup();
  for (const p of problems) console.error(`cleanup: ${p}`);
  // after the commit point the export is published: cleanup trouble is reported, but does not change the exit code
  if (problems.length && code === 0 && !committed) code = 1;
}
process.exit(code);
