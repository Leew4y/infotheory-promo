/**
 * Offline export (the design follows abstract-algebra-promo's export.mjs, driven here through puppeteer-core):
 *
 *   bun scripts/export.ts [--workers 4] [--fps 30] [--from 0] [--to <end>] [--crf 18] [--out out/infotheory.mp4] [--noaudio]
 *   bun scripts/export.ts --shots 5,20.5,60 [--dir out/shots]     write single frames (JPEG) for checking
 *   bun scripts/export.ts --cues films/infotheory/cues.json       dump the sound-effect cue sheet for the score
 *   bun scripts/export.ts --timeline films/infotheory/timeline.json  dump the resolved timeline (scene frames / seconds)
 *   bun scripts/export.ts --scenes                                print the scene list with start/end times
 *
 * Every worker is its own headless Chrome rendering exact frame times through the page's ?export=1 hooks.
 * Frames are handed out one at a time and written to ffmpeg in order, so the video is identical for any
 * worker count. Needs `bun run build` first (the page is served from dist/), Chrome, and ffmpeg on PATH.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dir, '..');
const DIST = path.join(ROOT, 'dist');
const argv = Bun.argv.slice(2);
const opt = (k: string, d?: string): string | undefined => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const flag = (k: string): boolean => argv.includes(`--${k}`);

const FPS = +(opt('fps', '30') ?? 30);
const CRF = opt('crf', '18')!;
const SINGLE = flag('shots') || flag('cues') || flag('timeline') || flag('scenes');
const WORKERS = SINGLE ? 1 : Math.max(1, +(opt('workers', '4') ?? 4));
const OUT = path.resolve(ROOT, opt('out', 'out/infotheory.mp4')!);
// the loudness-normalized WAV master from the score (the MP3 is only for the preview player)
const AUDIO = path.join(ROOT, 'audio', 'music.wav');

function findChrome(): string {
  const c = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ].find((p) => p && existsSync(p));
  if (!c) throw new Error('Chrome / Edge not found (set CHROME_PATH)');
  return c;
}

if (!existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/index.html missing: run `bun run build` first');
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  async fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/favicon.ico') return new Response(null, { status: 204 });
    const f = Bun.file(path.join(DIST, p === '/' ? 'index.html' : p));
    return (await f.exists()) ? new Response(f) : new Response('not found', { status: 404 });
  },
});
const URL_ = `http://127.0.0.1:${server.port}/?export=1`;
const CHROME = findChrome();

interface Worker { id: number; browser: Browser; page: Page; frame: (t: number) => Promise<Buffer>; evaluate: <T>(fn: () => T) => Promise<T> }
async function launch(id: number): Promise<Worker> {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
    args: ['--window-size=1920,1080', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-accelerated-2d-canvas', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (e: unknown) => console.error(`worker ${id} page error:`, e instanceof Error ? e.message : String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error(`worker ${id} console.error:`, m.text());
  });
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__frame === 'function' && window.__ready(), { timeout: 60_000 });
  const frame = async (t: number): Promise<Buffer> => {
    const url: string = await page.evaluate((t, fps) => window.__frame(t, fps), t, FPS);
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  };
  return { id, browser, page, frame, evaluate: (fn) => page.evaluate(fn) };
}

const tLoad = performance.now();
const workers = await Promise.all(Array.from({ length: WORKERS }, (_, i) => launch(i)));
const gpu = await workers[0].evaluate(() => window.__gpu());
console.log(`${WORKERS} worker${WORKERS > 1 ? 's' : ''} ready in ${((performance.now() - tLoad) / 1000).toFixed(1)}s   renderer: ${gpu}`);
if (/swiftshader|llvmpipe|software/i.test(gpu)) console.error('!!! WebGL is on a software renderer');
const DUR: number = await workers[0].evaluate(() => window.__duration);

async function shutdown(): Promise<void> {
  await Promise.all(workers.map((w) => w.browser.close().catch(() => {})));
  server.stop(true);
}

if (flag('scenes')) {
  const list = await workers[0].evaluate(() => window.__scenes());
  for (const s of list) console.log(`${s.name.padEnd(12)} ${s.start.toFixed(2).padStart(8)} -> ${s.end.toFixed(2).padStart(8)}  (${(s.end - s.start).toFixed(1)}s)`);
  console.log(`total ${DUR.toFixed(2)}s`);
  await shutdown();
  process.exit(0);
}
if (flag('cues') || flag('timeline')) {
  if (flag('timeline')) {
    const tf = path.resolve(ROOT, opt('timeline', 'films/infotheory/timeline.json')!);
    const tl = await workers[0].evaluate(() => window.__timeline());
    mkdirSync(path.dirname(tf), { recursive: true });
    writeFileSync(tf, JSON.stringify(tl, null, 1));
    console.log(`wrote timeline (${tl.scenes.length} scenes, ${tl.frames} frames) to ${tf}`);
  }
  if (!flag('cues')) { await shutdown(); process.exit(0); }
  const file = path.resolve(ROOT, opt('cues', 'films/infotheory/cues.json')!);
  const cues = await workers[0].evaluate(() => window.__cues());
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(cues, null, 1));
  console.log(`wrote ${cues.length} cues to ${file}`);
  await shutdown();
  process.exit(0);
}
if (flag('shots')) {
  const dir = path.resolve(ROOT, opt('dir', 'out/shots')!);
  mkdirSync(dir, { recursive: true });
  const times = opt('shots', '0')!.split(',').map(Number);
  for (const t of times) {
    const f = path.join(dir, `t${t.toFixed(2).padStart(7, '0')}.jpg`);
    writeFileSync(f, await workers[0].frame(t));
    console.log(f);
  }
  await shutdown();
  process.exit(0);
}

// ---- video
const FROM = +(opt('from', '0') ?? 0);
const TO = Math.min(+(opt('to', String(DUR)) ?? DUR), DUR);
const N = Math.round((TO - FROM) * FPS);
mkdirSync(path.dirname(OUT), { recursive: true });
const withAudio = !flag('noaudio') && existsSync(AUDIO);
if (!withAudio) console.log('no audio/music.wav: exporting video only');
console.log(`rendering ${N} frames (${FROM.toFixed(2)}s -> ${TO.toFixed(2)}s @ ${FPS} fps) -> ${OUT}`);
const ffArgs = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0'];
if (withAudio) ffArgs.push('-ss', String(FROM), '-t', String(TO - FROM), '-i', AUDIO, '-map', '0:v:0', '-map', '1:a:0');
ffArgs.push('-c:v', 'libx264', '-preset', 'medium', '-crf', CRF, '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS));
if (withAudio) ffArgs.push('-c:a', 'aac', '-b:a', '256k', '-shortest');
ffArgs.push('-movflags', '+faststart', OUT);
const ff = Bun.spawn(['ffmpeg', ...ffArgs], { stdin: 'pipe', stdout: 'inherit', stderr: 'inherit' });

// frames are rendered by whichever worker is free and written in order; rendering may run AHEAD frames past the encoder
const AHEAD = 12 * WORKERS;
const ready = new Map<number, Buffer>();
let nextTake = 0;
let nextWrite = 0;
let failed: Error | null = null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function work(w: Worker): Promise<void> {
  while (nextTake < N && !failed) {
    if (nextTake >= nextWrite + AHEAD) {
      await sleep(5);
      continue;
    }
    const i = nextTake++;
    try {
      ready.set(i, await w.frame(FROM + i / FPS));
    } catch (e) {
      failed = e instanceof Error ? e : new Error(String(e));
    }
  }
}
const t0 = performance.now();
async function write(): Promise<void> {
  let lastLog = 0;
  while (nextWrite < N) {
    if (failed) throw failed;
    const buf = ready.get(nextWrite);
    if (!buf) {
      await sleep(5);
      continue;
    }
    ready.delete(nextWrite);
    ff.stdin.write(buf);
    await ff.stdin.flush();
    nextWrite++;
    const now = performance.now();
    if (now - lastLog > 10_000 || nextWrite === N) {
      lastLog = now;
      const rate = nextWrite / ((now - t0) / 1000);
      console.log(`frame ${nextWrite}/${N}  ${((100 * nextWrite) / N).toFixed(1)}%  ${rate.toFixed(1)} fps  eta ${Math.round((N - nextWrite) / rate)}s`);
    }
  }
}
try {
  await Promise.all([write(), ...workers.map(work)]);
} finally {
  ff.stdin.end();
}
const code = await ff.exited;
await shutdown();
if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
console.log(`done: ${OUT}  (${(statSync(OUT).size / 1e6).toFixed(1)} MB, ${((performance.now() - t0) / 60000).toFixed(1)} min)`);
process.exit(0);
