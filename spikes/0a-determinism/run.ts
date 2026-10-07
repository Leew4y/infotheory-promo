/**
 * Phase 0a: is the existing renderer deterministic on raw pixels?
 *
 *   just build infotheory && bun spikes/0a-determinism/run.ts [--out spikes/0a-determinism/result.json]
 *
 * Renders a fixed set of frames through the page's ?export=1 hook and hashes the canvas's raw RGBA
 * (getImageData, before any JPEG/PNG encoding). Runs: two cold starts in order, one shuffled with repeated
 * seeks, and four workers sharing the frames round-robin. Every run must give the same hash per frame.
 */
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dir, '../..');
const DIST = path.join(ROOT, 'dist', 'infotheory');
const FPS = 30;
const argv = Bun.argv.slice(2);
const outArg = argv.indexOf('--out');
const OUT = path.resolve(ROOT, outArg >= 0 ? argv[outArg + 1] : 'spikes/0a-determinism/result.json');

const CHROME = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error('Chrome not found (set CHROME_PATH)');
if (!existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/index.html missing: run `just build infotheory` first');

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  async fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname);
    const f = Bun.file(path.join(DIST, p === '/' ? 'index.html' : p));
    return (await f.exists()) ? new Response(f) : new Response('not found', { status: 404 });
  },
});
const URL_ = `http://127.0.0.1:${server.port}/?export=1`;
// Same flags as scripts/export.ts, except the ANGLE backend is only forced on Windows.
const ARGS = [
  '--window-size=1920,1080', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--mute-audio', '--no-first-run',
  '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  // ANGLE=swiftshader selects the software GPU (deterministic, slower); the default matches production.
  ...(process.env.ANGLE ? [`--use-angle=${process.env.ANGLE}`] : process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
  // EXTRA_ARGS="--disable-accelerated-2d-canvas" keeps the 2D canvas on the CPU rasterizer from the first frame.
  ...(process.env.EXTRA_ARGS ?? '').split(' ').filter(Boolean),
];

interface W { browser: Browser; page: Page }
async function launch(): Promise<W> {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }, args: ARGS });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e instanceof Error ? e.message : String(e)));
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__frame === 'function' && window.__ready(), { timeout: 60_000 });
  return { browser, page };
}
/** Render frame f with the export path (3 motion-blur sub-frames) and hash the canvas's raw RGBA. */
async function hashFrame(w: W, f: number): Promise<string> {
  return w.page.evaluate(async (t, fps) => {
    window.__frame(t, fps);
    const c = document.getElementById('c') as HTMLCanvasElement;
    const px = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', px));
    return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
  }, f / FPS, FPS);
}

const probe = await launch();
const scenes: { name: string; start: number; end: number }[] = await probe.page.evaluate(() => window.__scenes());
const duration: number = await probe.page.evaluate(() => window.__duration);
const gpu: string = await probe.page.evaluate(() => window.__gpu());
const chrome = await probe.browser.version();
await probe.browser.close();

// Frames: first/last, one frame either side of every scene boundary, and one frame every 5 s.
const last = Math.floor(duration * FPS) - 1;
const set = new Set<number>([0, last]);
for (const s of scenes) {
  const f0 = Math.ceil(s.start * FPS - 1e-9);
  for (const f of [f0 - 1, f0, f0 + 1]) if (f >= 0 && f <= last) set.add(f);
}
for (let f = 0; f <= last; f += 5 * FPS) set.add(f);
const frames = [...set].sort((a, b) => a - b);

// Seeded shuffle, with every 4th frame visited twice (repeated seek).
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const shuffled = [...frames, ...frames.filter((_, i) => i % 4 === 0)].sort(() => rnd() - 0.5);

type Run = Map<number, string[]>;
async function single(order: number[]): Promise<Run> {
  const w = await launch();
  const r: Run = new Map();
  for (const f of order) r.set(f, [...(r.get(f) ?? []), await hashFrame(w, f)]);
  await w.browser.close();
  return r;
}
async function parallel(order: number[], n: number): Promise<Run> {
  const ws = await Promise.all(Array.from({ length: n }, launch));
  const r: Run = new Map();
  await Promise.all(ws.map(async (w, k) => {
    for (let i = k; i < order.length; i += n) r.set(order[i], [...(r.get(order[i]) ?? []), await hashFrame(w, order[i])]);
  }));
  await Promise.all(ws.map((w) => w.browser.close()));
  return r;
}

const t0 = performance.now();
const runs: [string, Run][] = [];
runs.push(['cold-1 in order', await single(frames)]);
runs.push(['cold-2 in order', await single(frames)]);
runs.push(['shuffled + repeated seeks', await single(shuffled)]);
runs.push(['4 workers round-robin', await parallel(frames, 4)]);

const ref = runs[0][1];
const mismatches: { frame: number; run: string }[] = [];
for (const [name, r] of runs)
  for (const f of frames) for (const h of r.get(f) ?? []) if (h !== ref.get(f)![0]) mismatches.push({ frame: f, run: name });

const result = {
  commit: (await Bun.$`git -C ${ROOT} rev-parse HEAD`.text()).trim(),
  platform: `${process.platform} ${process.arch}`,
  chrome,
  gpu,
  args: ARGS,
  frames: frames.length,
  runs: runs.map(([n, r]) => ({ name: n, renders: [...r.values()].reduce((a, v) => a + v.length, 0) })),
  seconds: +((performance.now() - t0) / 1000).toFixed(1),
  pass: mismatches.length === 0,
  mismatches,
  hashes: Object.fromEntries(frames.map((f) => [f, ref.get(f)![0]])),
};
writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log(`${result.pass ? 'PASS' : 'FAIL'}: ${frames.length} frames x ${runs.length} runs, ${mismatches.length} mismatches, ${result.seconds}s -> ${OUT}`);
server.stop(true);
process.exit(result.pass ? 0 : 1);
