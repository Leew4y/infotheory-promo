/**
 * Offline export (the design follows abstract-algebra-promo's export.mjs, driven here through puppeteer-core):
 *
 *   bun scripts/export.ts [--workers 4] [--from 0] [--to <end>] [--crf 18] [--out out/infotheory.mp4]
 *                         [--audio audio/music.wav | --noaudio] [--deadline <seconds>]
 *   bun scripts/export.ts --shots 5,20.5,60 [--dir out/shots]     write single frames (JPEG) for checking
 *   bun scripts/export.ts --cues films/infotheory/cues.json       dump the sound-effect cue sheet for the score
 *   bun scripts/export.ts --timeline films/infotheory/timeline.json  dump the resolved timeline (scene frames / seconds)
 *   bun scripts/export.ts --scenes                                print the scene list with start/end times
 *
 * Every worker is its own headless Chrome rendering exact frame times through the page's ?export=1 hooks.
 * Frames are handed out one at a time and written to ffmpeg in order. Needs `bun run build` first (the page is
 * served from dist/), Chrome, and ffmpeg on PATH.
 *
 * Output contract (docs/plan/reusable-engine.md, "全局契约 / 导出产物"):
 *   - the video is encoded to a job-private temporary file next to --out; only after it passes the checks (frame
 *     count, duration, an audio track at least as long as the video) is it moved over --out; on any failure the old
 *     --out is left untouched and the temporary file is deleted;
 *   - audio is required: a missing audio file is an error unless --noaudio; audio shorter than the video is an error;
 *   - a second export to the same --out while one runs fails at once (lock file next to --out);
 *   - worker launch failure, encoder failure, an interrupt (Ctrl+C) or the --deadline all end the job within a bound:
 *     Chrome and ffmpeg are closed or killed, nothing is left running;
 *   - colour: canvas JPEGs (full-range BT.601 YCbCr) are converted to limited-range BT.709 and the stream is tagged so.
 * Exit codes: 0 success, 1 job failed, 2 usage or setup error.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { chromeArgs, findChrome, serveDist } from './chrome';

const ROOT = path.resolve(import.meta.dir, '..');
const DIST = path.join(ROOT, 'dist');
const argv = Bun.argv.slice(2);
const opt = (k: string, d?: string): string | undefined => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const flag = (k: string): boolean => argv.includes(`--${k}`);
const die = (code: number, msg: string): never => { console.error(msg); process.exit(code); };

const FPS = 30;
const CRF = opt('crf', '18')!;
const SINGLE = flag('shots') || flag('cues') || flag('timeline') || flag('scenes');
const WORKERS = SINGLE ? 1 : Math.max(1, +(opt('workers', '4') ?? 4));
const OUT = path.resolve(ROOT, opt('out', 'out/infotheory.mp4')!);
// the loudness-normalized WAV master from the score (the MP3 is only for the preview player)
const AUDIO = path.resolve(ROOT, opt('audio', 'audio/music.wav')!);
const NOAUDIO = flag('noaudio');
// test hook: abort through the same path as Ctrl+C after this many frames have been written
const ABORT_AFTER = opt('abort-after') !== undefined ? +opt('abort-after')! : -1;

if (!existsSync(path.join(DIST, 'index.html'))) die(2, 'dist/index.html missing: run `bun run build` first');
let CHROME = '';
try { CHROME = findChrome(); } catch (e) { die(2, (e as Error).message); }

// ---- everything that must be cleaned up, whatever happens
const browsers: Browser[] = [];
let ff: ReturnType<typeof Bun.spawn> | null = null;
let tmpOut: string | null = null;
let lockPath: string | null = null;
const server = serveDist(DIST);
let cleaned = false;
async function cleanup(): Promise<void> {
  if (cleaned) return;
  cleaned = true;
  if (ff && ff.exitCode === null) { try { ff.kill(); } catch {} }
  // close politely, then make sure: a browser that does not close within 5 s is killed
  await Promise.all(browsers.map(async (b) => {
    const proc = b.process();
    await Promise.race([b.close().catch(() => {}), Bun.sleep(5000)]);
    if (proc && proc.exitCode === null) { try { proc.kill('SIGKILL'); } catch {} }
  }));
  server.stop();
  if (tmpOut) { try { rmSync(tmpOut, { force: true }); } catch {} }
  if (lockPath) { try { rmSync(lockPath, { force: true }); } catch {} }
}
let aborting: string | null = null;
const abortReason = (): string | null => aborting; // read through a call: it is set from callbacks
const abort = (why: string) => { aborting ??= why; };
process.on('SIGINT', () => abort('interrupted'));
process.on('SIGTERM', () => abort('terminated'));

interface Worker { id: number; browser: Browser; page: Page; frame: (t: number) => Promise<Buffer>; evaluate: <T>(fn: () => T) => Promise<T> }
async function launch(id: number): Promise<Worker> {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }, args: chromeArgs('platform'), timeout: 30_000 });
  browsers.push(browser);
  const page = await browser.newPage();
  page.on('pageerror', (e: unknown) => console.error(`worker ${id} page error:`, e instanceof Error ? e.message : String(e)));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`worker ${id} console.error:`, m.text()); });
  await page.goto(`${server.url}/?export=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__frame === 'function' && window.__ready(), { timeout: 60_000 });
  const frame = async (t: number): Promise<Buffer> => {
    const url: string = await page.evaluate((t, fps) => window.__frame(t, fps), t, FPS);
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  };
  return { id, browser, page, frame, evaluate: (fn) => page.evaluate(fn) };
}

/** Exclusive lock next to `out`; a lock left by a process that no longer runs is taken over. */
function takeLock(out: string): string {
  const lp = `${out}.lock`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lp, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return lp;
    } catch {
      const pid = Number(readFileSync(lp, 'utf8').trim());
      let alive = false;
      try { process.kill(pid, 0); alive = true; } catch {}
      if (alive && pid !== process.pid) throw new Error(`another export (pid ${pid}) is writing ${out}`);
      rmSync(lp, { force: true });
    }
  }
  throw new Error(`cannot lock ${out}`);
}

interface Probe { videoFrames: number; videoDuration: number; audioDuration: number | null; color: string }
async function probe(file: string): Promise<Probe> {
  const p = Bun.spawn(['ffprobe', '-v', 'error', '-count_packets', '-show_entries', 'stream=codec_type,nb_read_packets,duration,color_space,color_primaries,color_transfer,color_range', '-of', 'json', file], { stdout: 'pipe', stderr: 'pipe' });
  const j = JSON.parse(await new Response(p.stdout).text());
  const v = j.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  const a = j.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
  return { videoFrames: +(v?.nb_read_packets ?? 0), videoDuration: +(v?.duration ?? 0), audioDuration: a ? +a.duration : null, color: [v?.color_space, v?.color_primaries, v?.color_transfer, v?.color_range].join('/') };
}
async function audioSeconds(file: string): Promise<number> {
  const p = Bun.spawn(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { stdout: 'pipe', stderr: 'pipe' });
  return +(await new Response(p.stdout).text()).trim();
}

let code = 0;
try {
  const tLoad = performance.now();
  const workers = await Promise.all(Array.from({ length: WORKERS }, (_, i) => launch(i)));
  const gpu = await workers[0].evaluate(() => window.__gpu());
  console.log(`${WORKERS} worker${WORKERS > 1 ? 's' : ''} ready in ${((performance.now() - tLoad) / 1000).toFixed(1)}s   renderer: ${gpu}`);
  if (/swiftshader|llvmpipe|software/i.test(gpu)) console.error('!!! WebGL is on a software renderer');
  const DUR: number = await workers[0].evaluate(() => window.__duration);

  if (flag('scenes')) {
    const list = await workers[0].evaluate(() => window.__scenes());
    for (const s of list) console.log(`${s.name.padEnd(12)} ${s.start.toFixed(2).padStart(8)} -> ${s.end.toFixed(2).padStart(8)}  (${(s.end - s.start).toFixed(1)}s)`);
    console.log(`total ${DUR.toFixed(2)}s`);
  } else if (flag('cues') || flag('timeline')) {
    if (flag('timeline')) {
      const tf = path.resolve(ROOT, opt('timeline', 'films/infotheory/timeline.json')!);
      const tl = await workers[0].evaluate(() => window.__timeline());
      mkdirSync(path.dirname(tf), { recursive: true });
      writeFileSync(tf, JSON.stringify(tl, null, 1));
      console.log(`wrote timeline (${tl.scenes.length} scenes, ${tl.frames} frames) to ${tf}`);
    }
    if (flag('cues')) {
      const file = path.resolve(ROOT, opt('cues', 'films/infotheory/cues.json')!);
      const cues = await workers[0].evaluate(() => window.__cues());
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(cues, null, 1));
      console.log(`wrote ${cues.length} cues to ${file}`);
    }
  } else if (flag('shots')) {
    const dir = path.resolve(ROOT, opt('dir', 'out/shots')!);
    mkdirSync(dir, { recursive: true });
    for (const t of opt('shots', '0')!.split(',').map(Number)) {
      const f = path.join(dir, `t${t.toFixed(2).padStart(7, '0')}.jpg`);
      writeFileSync(f, await workers[0].frame(t));
      console.log(f);
    }
  } else {
    // ---- video
    const FROM = +(opt('from', '0') ?? 0);
    const TO = Math.min(+(opt('to', String(DUR)) ?? DUR), DUR);
    const N = Math.round((TO - FROM) * FPS);
    if (!(N > 0)) throw Object.assign(new Error(`nothing to render: --from ${FROM} --to ${TO}`), { exit: 2 });
    const deadline = opt('deadline') !== undefined ? +opt('deadline')! : Math.max(600, N * 2);
    if (!NOAUDIO) {
      if (!existsSync(AUDIO)) throw Object.assign(new Error(`audio ${AUDIO} not found: run \`just music\`, or pass --noaudio for a silent export`), { exit: 2 });
      const secs = await audioSeconds(AUDIO);
      if (!(secs + 1e-6 >= TO)) throw new Error(`audio ${AUDIO} is ${secs.toFixed(3)}s, shorter than the export end ${TO.toFixed(3)}s`);
    }
    mkdirSync(path.dirname(OUT), { recursive: true });
    lockPath = takeLock(OUT);
    tmpOut = `${OUT.replace(/\.mp4$/i, '')}.${process.pid}.partial.mp4`;
    console.log(`rendering ${N} frames (${FROM.toFixed(2)}s -> ${TO.toFixed(2)}s @ ${FPS} fps) -> ${OUT}${NOAUDIO ? ' (no audio)' : ''}`);
    const ffArgs = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0'];
    if (!NOAUDIO) ffArgs.push('-ss', String(FROM), '-t', String(TO - FROM), '-i', AUDIO, '-map', '0:v:0', '-map', '1:a:0');
    ffArgs.push('-vf', // accurate_rnd / full_chroma_int: swscale's default rounding shifts colours by 2-6 levels here (measured, see the plan's 1c record)
      'scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+full_chroma_inp,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', CRF, '-profile:v', 'high', '-r', String(FPS),
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv');
    if (!NOAUDIO) ffArgs.push('-c:a', 'aac', '-b:a', '256k');
    ffArgs.push('-movflags', '+faststart', '-f', 'mp4', tmpOut);
    const enc = Bun.spawn(['ffmpeg', ...ffArgs], { stdin: 'pipe', stdout: 'inherit', stderr: 'inherit' });
    ff = enc;
    const t0 = performance.now();
    const timer = setTimeout(() => abort(`deadline of ${deadline}s exceeded`), deadline * 1000);

    // frames are rendered by whichever worker is free and written in order; rendering may run AHEAD frames past the encoder
    const AHEAD = 12 * WORKERS;
    const ready = new Map<number, Buffer>();
    let nextTake = 0, nextWrite = 0;
    let failed: Error | null = null;
    const stop = () => failed ?? (abortReason() ? new Error(abortReason()!) : enc.exitCode !== null ? new Error(`ffmpeg exited early with code ${enc.exitCode}`) : null);
    const work = async (w: Worker): Promise<void> => {
      while (nextTake < N && !stop()) {
        if (nextTake >= nextWrite + AHEAD) { await Bun.sleep(5); continue; }
        const i = nextTake++;
        try { ready.set(i, await w.frame(FROM + i / FPS)); } catch (e) { failed ??= e instanceof Error ? e : new Error(String(e)); }
      }
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
          enc.stdin.write(buf);
          await enc.stdin.flush();
        } catch (e) {
          throw new Error(`ffmpeg stopped accepting frames: ${e instanceof Error ? e.message : String(e)}`);
        }
        nextWrite++;
        if (nextWrite === ABORT_AFTER) abort('interrupted (test hook)');
        const now = performance.now();
        if (now - lastLog > 10_000 || nextWrite === N) {
          lastLog = now;
          const rate = nextWrite / ((now - t0) / 1000);
          console.log(`frame ${nextWrite}/${N}  ${((100 * nextWrite) / N).toFixed(1)}%  ${rate.toFixed(1)} fps  eta ${Math.round((N - nextWrite) / rate)}s`);
        }
      }
    };
    try {
      await Promise.all([write(), ...workers.map(work)]);
    } finally {
      clearTimeout(timer);
      try { enc.stdin.end(); } catch {}
    }
    const ffCode = await Promise.race([enc.exited, Bun.sleep(120_000).then(() => -1)]);
    if (ffCode !== 0) throw new Error(ffCode === -1 ? 'ffmpeg did not finish within 120 s of the last frame' : `ffmpeg exited with ${ffCode}`);
    // check the result before it replaces --out
    const p = await probe(tmpOut);
    const want = N / FPS, problems: string[] = [];
    if (p.videoFrames !== N) problems.push(`video has ${p.videoFrames} frames, expected ${N}`);
    if (Math.abs(p.videoDuration - want) > 1.5 / FPS) problems.push(`video lasts ${p.videoDuration.toFixed(3)}s, expected ${want.toFixed(3)}s`);
    if (!NOAUDIO && p.audioDuration === null) problems.push('no audio track');
    if (!NOAUDIO && p.audioDuration !== null && p.audioDuration + 1.5 / FPS < want) problems.push(`audio lasts ${p.audioDuration.toFixed(3)}s, shorter than the video ${want.toFixed(3)}s`);
    if (p.color !== 'bt709/bt709/bt709/tv') problems.push(`video colour tags are ${p.color}, expected bt709/bt709/bt709/tv (space/primaries/transfer/range)`);
    if (problems.length) throw new Error(`output failed its checks: ${problems.join('; ')}`);
    renameSync(tmpOut, OUT);
    tmpOut = null;
    console.log(`done: ${OUT}  (${(statSync(OUT).size / 1e6).toFixed(1)} MB, ${((performance.now() - t0) / 60000).toFixed(1)} min, ${p.videoFrames} frames${NOAUDIO ? '' : `, audio ${p.audioDuration!.toFixed(3)}s`})`);
  }
} catch (e) {
  const err = e as Error & { exit?: number };
  console.error(`export failed: ${err.message}`);
  code = err.exit ?? (abortReason()?.startsWith('interrupted') ? 130 : 1);
} finally {
  await cleanup();
}
process.exit(code);
