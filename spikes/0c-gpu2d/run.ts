/**
 * Spike 0c: how large are the pixel differences if the export's 2D canvas is GPU-accelerated?
 *
 *   just build infotheory && bun spikes/0c-gpu2d/run.ts [--film infotheory] [--out spikes/0c-gpu2d/result.json]
 *
 * 0a (spikes/RESULTS.md) found that a GPU-accelerated 2D canvas makes frames depend on rendering history (out-of-order
 * seeks, several workers) and fixed the 2D canvas to the CPU rasterizer; it measured whether hashes differ, not by how
 * much. This measures the size of every difference on the same frame set as 0a (first and last frame, both sides of
 * every scene boundary, one frame every 5 s), each rendered through the export path (__frame, 3 motion-blur
 * sub-frames) and read back losslessly (canvas.toBlob PNG: unlike getImageData it does not count toward Chrome's
 * "read back often, move the canvas to the CPU" heuristic). Runs:
 *   ref        CPU 2D (production today), cold, in order: the reference;
 *   cpu-again  CPU 2D, a second cold start: the GPU WebGL noise 0a already knew about (source 2);
 *   gpu        GPU 2D, cold, in order;
 *   gpu-mixed  GPU 2D, shuffled with repeated seeks;
 *   gpu-4w     GPU 2D, four workers round-robin.
 * For each run and frame against ref: pixels that differ, the largest channel difference, pixels off by more than 2
 * levels. Raw frames go to .cache/spike-0c/ (deleted at the end).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { chromeArgs, findChrome, loadFilm, serveDist, type FrameSink } from '../../scripts/chrome';

const ROOT = path.resolve(import.meta.dir, '../..');
const argv = Bun.argv.slice(2);
const opt = (k: string, d: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const FILM = opt('film', 'infotheory');
const OUT = path.resolve(ROOT, opt('out', 'spikes/0c-gpu2d/result.json'));
const TMP = path.join(ROOT, '.cache', 'spike-0c');
const W = 1920, H = 1080, FB = W * H * 4;

const posted = new Map<string, Uint8Array>();
const TOKEN = crypto.randomUUID().replace(/-/g, '');
const sink: FrameSink = { token: TOKEN, take: (n, b) => { posted.set(String(n), b); return null; } };
const server = serveDist(path.join(ROOT, 'dist', FILM), { frames: sink });

async function open(gpu2d: boolean): Promise<{ browser: Browser; page: Page }> {
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, defaultViewport: { width: W, height: H, deviceScaleFactor: 1 }, args: chromeArgs('platform', { cpu2d: !gpu2d }) });
  const page = await browser.newPage();
  await loadFilm(page, server.url, FILM, '');
  return { browser, page };
}
/** Render frame f and return its RGBA (PNG through toBlob, decoded by ffmpeg). */
let seq = 0;
async function render(page: Page, f: number, fps: number): Promise<Uint8Array> {
  const n = ++seq;
  await page.evaluate(async (u, t, fps) => {
    await window.__frame(t, fps, 3);
    const c = document.getElementById('c') as HTMLCanvasElement;
    const png = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
    const r = await fetch(u, { method: 'POST', body: png });
    if (!r.ok) throw new Error(`post ${r.status}`);
  }, `${server.url}/frames/${TOKEN}/${n}`, f / fps, fps);
  const png = posted.get(String(n))!;
  posted.delete(String(n));
  const d = Bun.spawnSync(['ffmpeg', '-v', 'error', '-f', 'png_pipe', '-i', 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { stdin: png, stdout: 'pipe' });
  if (d.stdout.length !== FB) throw new Error(`frame ${f}: decoded ${d.stdout.length} bytes`);
  return new Uint8Array(d.stdout);
}
function compare(a: Uint8Array, b: Uint8Array) {
  let differ = 0, over2 = 0, max = 0;
  for (let i = 0; i < FB; i += 4) {
    const m = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (m) { differ++; if (m > 2) over2++; if (m > max) max = m; }
  }
  return { differ, over2, max };
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
const result: Record<string, unknown> = {};
try {
  const probe = await open(false);
  const tl = await probe.page.evaluate(() => window.__timeline());
  const set = new Set<number>([0, tl.frames - 1]);
  for (const s of tl.scenes) for (const f of [s.f0 - 1, s.f0]) if (f >= 0 && f < tl.frames) set.add(f);
  for (let f = 0; f < tl.frames; f += 5 * tl.fps) set.add(f);
  const frames = [...set].sort((a, b) => a - b);
  // ref
  const t0 = performance.now();
  for (const f of frames) writeFileSync(path.join(TMP, `${f}.rgba`), await render(probe.page, f, tl.fps));
  await probe.browser.close();
  const refSeconds = (performance.now() - t0) / 1000;
  const ref = (f: number) => new Uint8Array(readFileSync(path.join(TMP, `${f}.rgba`)));
  const runs: Record<string, { frames: number; seconds: number; framesDiffering: number; pixelsDiffering: number; pixelsOver2: number; maxLevel: number; worst: { frame: number; differ: number; max: number }[] }> = {};
  const record = (name: string, seconds: number, rows: { frame: number; differ: number; over2: number; max: number }[]) => {
    const d = rows.filter((r) => r.differ);
    runs[name] = {
      frames: rows.length, seconds: +seconds.toFixed(1), framesDiffering: new Set(d.map((r) => r.frame)).size,
      pixelsDiffering: d.reduce((s, r) => s + r.differ, 0), pixelsOver2: d.reduce((s, r) => s + r.over2, 0), maxLevel: Math.max(0, ...d.map((r) => r.max)),
      worst: [...d].sort((a, b) => b.differ - a.differ).slice(0, 5).map(({ frame, differ, max }) => ({ frame, differ, max })),
    };
    console.log(`${name}: ${runs[name].framesDiffering}/${new Set(rows.map((r) => r.frame)).size} frames differ, ${runs[name].pixelsDiffering} px (${runs[name].pixelsOver2} > 2 levels), max ${runs[name].maxLevel}, ${runs[name].seconds}s`);
  };
  const sequential = async (name: string, gpu2d: boolean, order: number[]) => {
    const w = await open(gpu2d);
    const rows = [];
    const a = performance.now();
    for (const f of order) rows.push({ frame: f, ...compare(ref(f), await render(w.page, f, tl.fps)) });
    record(name, (performance.now() - a) / 1000, rows);
    await w.browser.close();
  };
  await sequential('cpu-again', false, frames);
  await sequential('gpu', true, frames);
  // shuffled with repeated seeks (seeded)
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const mixed = [...frames, ...frames.slice(0, 20)].map((f) => [rnd(), f] as const).sort((a, b) => a[0] - b[0]).map(([, f]) => f);
  await sequential('gpu-mixed', true, mixed);
  // four workers round-robin
  const ws = await Promise.all([0, 1, 2, 3].map(() => open(true)));
  const rows: { frame: number; differ: number; over2: number; max: number }[] = [];
  const a = performance.now();
  await Promise.all(ws.map(async (w, k) => { for (let i = k; i < frames.length; i += 4) rows.push({ frame: frames[i], ...compare(ref(frames[i]), await render(w.page, frames[i], tl.fps)) }); }));
  record('gpu-4w', (performance.now() - a) / 1000, rows);
  for (const w of ws) await w.browser.close();
  Object.assign(result, {
    film: FILM, chrome: await (async () => { const b = await puppeteer.launch({ executablePath: findChrome(), headless: true }); const v = await b.version(); await b.close(); return v; })(),
    platform: `${process.platform} ${process.arch}`, commit: Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: ROOT, stdout: 'pipe' }).stdout.toString().trim(),
    frames, refSeconds: +refSeconds.toFixed(1), runs,
  });
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 1));
  console.log(`-> ${path.relative(ROOT, OUT)}`);
} finally {
  server.stop();
  rmSync(TMP, { recursive: true, force: true });
}
