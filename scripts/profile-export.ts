/**
 * Where export time goes, per frame and per stage:
 *
 *   bun scripts/profile-export.ts --film <id> [--from <frame>] [--count 300] [--runs 3] [--style <id>]
 *                                 [--transport dataurl|blob] [--samples 3] [--gpu2d] [--encoders]
 *
 * One worker (the export's Chrome flags; --gpu2d drops --disable-accelerated-2d-canvas) renders --count consecutive
 * frames from --from (default: the middle of the film), --runs times:
 *   dataurl  as the export does today: __frame -> data URL over CDP -> base64 decode here;
 *   blob     __frameTo: the page JPEG-encodes a snapshot off the main thread (toBlob) and POSTs it here, while it draws
 *            the next frame (at most two in flight).
 * The page reports its stages (engine/perf.ts: intervals between calls, so deferred work lands in the stage that forces
 * it); this process adds the round trip. --encoders then encodes the collected JPEGs (consecutive frames) with each
 * encoder setting alone. Everything is written with the run's identity (commit, Chrome, ffmpeg) to
 * out/<film>/profile-<transport>[-gpu2d][-k<samples>].json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeArgs, findChrome, loadFilm, serveDist } from './chrome';
import { mediaDir, requireFilm } from './film-arg';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const opt = (k: string, d?: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const FILM = requireFilm(argv);
const COUNT = +(opt('count', '300')!), RUNS = +(opt('runs', '3')!), SAMPLES = +(opt('samples', '3')!);
const STYLE = opt('style', '')!;
const TRANSPORT = opt('transport', 'dataurl')!;
const GPU2D = argv.includes('--gpu2d');
if (!['dataurl', 'blob'].includes(TRANSPORT)) throw new Error('--transport dataurl|blob');

const sh = (cmd: string[]) => Bun.spawnSync(cmd, { cwd: ROOT, stdout: 'pipe' }).stdout.toString().trim();
const received = new Map<number, Uint8Array>();
const TOKEN = crypto.randomUUID().replace(/-/g, '');
const server = serveDist(path.join(ROOT, 'dist', FILM), { media: mediaDir(FILM), frames: { token: TOKEN, take: (n, b) => { received.set(n, b); return null; } } });
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }, args: chromeArgs('platform', { cpu2d: !GPU2D }) });
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1); };
try {
  const page = await browser.newPage();
  await loadFilm(page, server.url, FILM, STYLE);
  const tl = await page.evaluate(() => window.__timeline());
  const from = +(opt('from', String(Math.max(0, Math.floor(tl.frames / 2 - COUNT / 2))))!);
  const frames = Array.from({ length: Math.min(COUNT, tl.frames - from) }, (_, i) => from + i);
  const N = frames.length;
  for (const f of frames.slice(0, 3)) await page.evaluate((t, fps, k) => window.__frame(t, fps, k), f / tl.fps, tl.fps, SAMPLES); // warm-up
  const runs: { wallMs: number; fps: number; p50: number; p95: number; stages: Record<string, number> }[] = [];
  let jpegs: Uint8Array[] = [];
  for (let r = 0; r < RUNS; r++) {
    received.clear();
    await page.evaluate(() => window.__perf(true));
    const per: number[] = [];
    let roundTrip = 0;
    const t0 = performance.now();
    if (TRANSPORT === 'dataurl') {
      jpegs = [];
      for (const f of frames) {
        const a = performance.now();
        const url: string = await page.evaluate((t, fps, k) => window.__frame(t, fps, k), f / tl.fps, tl.fps, SAMPLES);
        roundTrip += performance.now() - a;
        jpegs.push(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
        per.push(performance.now() - a);
      }
    } else {
      for (const f of frames) {
        const a = performance.now();
        await page.evaluate((u, t, fps, k) => window.__frameTo(u, t, fps, k), `${server.url}/frames/${TOKEN}/${f}`, f / tl.fps, tl.fps, SAMPLES);
        roundTrip += performance.now() - a;
        per.push(performance.now() - a);
      }
      await page.evaluate(() => window.__drain());
      if (received.size !== N) throw new Error(`blob: received ${received.size} of ${N} frames`);
      jpegs = frames.map((f) => received.get(f)!);
    }
    const wall = performance.now() - t0;
    const st = await page.evaluate(() => window.__perf(false));
    const pageTotal = Object.values(st).reduce((s, v) => s + v, 0);
    const stages = Object.fromEntries(Object.entries(st).map(([k, v]) => [k, +(v / N).toFixed(2)]));
    stages['round trip beyond the page stages'] = +((roundTrip - pageTotal) / N).toFixed(2);
    runs.push({ wallMs: +(wall / N).toFixed(1), fps: +(N / (wall / 1000)).toFixed(2), p50: q(per, 0.5), p95: q(per, 0.95), stages });
    console.log(`run ${r + 1}: ${runs[r].fps} fps (${runs[r].wallMs} ms/frame, call p50 ${runs[r].p50} p95 ${runs[r].p95})`);
  }

  const enc: Record<string, number | string> = {};
  if (argv.includes('--encoders')) {
    const encoders: Record<string, string[]> = {
      'x264 medium (export)': ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18'],
      'x264 veryfast (draft)': ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18'],
      'h264_nvenc p5': ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '19'],
    };
    for (const [name, args] of Object.entries(encoders)) {
      const a = performance.now();
      const p = Bun.spawn(['ffmpeg', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(tl.fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
        '-vf', 'scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+full_chroma_inp,format=yuv420p', ...args, '-f', 'null', '-'], { stdin: 'pipe', stderr: 'pipe' });
      try { for (const j of jpegs) { p.stdin.write(j); await p.stdin.flush(); } p.stdin.end(); } catch { /* the encoder exited: reported below */ }
      const code = await p.exited;
      enc[name] = code === 0 ? +(jpegs.length / ((performance.now() - a) / 1000)).toFixed(1) : `failed: ${(await new Response(p.stderr).text()).trim()}`;
      console.log(`encoder ${name}: ${enc[name]}`);
    }
  }
  const fpsRuns = runs.map((r) => r.fps);
  const result = {
    identity: {
      commit: sh(['git', 'rev-parse', 'HEAD']), dirty: sh(['git', 'status', '--porcelain', '--', 'engine', 'scripts', 'styles']) !== '',
      chrome: await browser.version(), ffmpeg: sh(['ffmpeg', '-version']).split('\n')[0], gpu: await page.evaluate(() => window.__gpu()),
      platform: `${process.platform} ${process.arch}`,
    },
    film: FILM, style: STYLE || '(default)', canvas2d: GPU2D ? 'gpu (flag removed)' : 'cpu (--disable-accelerated-2d-canvas)',
    transport: TRANSPORT, samples: SAMPLES, frames: [from, from + N], fpsPerRun: fpsRuns, fpsMedian: q(fpsRuns, 0.5),
    runs, jpegKBPerFrame: +(jpegs.reduce((s, j) => s + j.length, 0) / jpegs.length / 1024).toFixed(0), encoderFps: enc,
  };
  mkdirSync(path.join(ROOT, 'out', FILM), { recursive: true });
  const file = path.join(ROOT, 'out', FILM, `profile-${TRANSPORT}${GPU2D ? '-gpu2d' : ''}-k${SAMPLES}.json`);
  writeFileSync(file, JSON.stringify(result, null, 1));
  console.log(`median ${result.fpsMedian} fps one worker -> ${path.relative(ROOT, file)}`);
  console.log(JSON.stringify(runs[runs.length - 1].stages));
} finally {
  await browser.close();
  server.stop();
}
