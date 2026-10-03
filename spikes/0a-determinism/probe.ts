/**
 * Phase 0a follow-up: render one frame repeatedly (fresh browser each time and within one browser)
 * and report how the raw RGBA differs from the first render: pixel count, max channel delta, bounding box.
 *
 *   bun spikes/0a-determinism/probe.ts <frame> [repeats=4] [--warm <frame,frame,...>]
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dir, '../..');
const DIST = path.join(ROOT, 'dist');
const argv = Bun.argv.slice(2);
const FRAME = +argv[0];
const REPEATS = +(argv[1] ?? 4);
const wi = argv.indexOf('--warm');
const WARM = wi >= 0 ? argv[wi + 1].split(',').map(Number) : [];
const CHROME = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p))!;
const server = Bun.serve({
  hostname: '127.0.0.1', port: 0,
  async fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname);
    const f = Bun.file(path.join(DIST, p === '/' ? 'index.html' : p));
    return (await f.exists()) ? new Response(f) : new Response('nf', { status: 404 });
  },
});
const ARGS = ['--window-size=1920,1080', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--mute-audio', ...(process.platform === 'win32' && !process.env.ANGLE ? ['--use-angle=d3d11'] : []), ...(process.env.ANGLE ? [`--use-angle=${process.env.ANGLE}`] : []), ...(process.env.EXTRA_ARGS ?? '').split(' ').filter(Boolean)];

let printed = false;
async function session(): Promise<Uint8Array[]> {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1920, height: 1080 }, args: ARGS });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}/?export=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__frame === 'function' && window.__ready(), { timeout: 60_000 });
  if (!printed) console.log('renderer:', await page.evaluate(() => window.__gpu())), (printed = true);
  for (const f of WARM) await page.evaluate((t) => void window.__frame(t, 30), f / 30);
  const out: Uint8Array[] = [];
  for (let i = 0; i < 2; i++) {
    const b64: string = await page.evaluate((t) => {
      window.__frame(t, 30);
      const c = document.getElementById('c') as HTMLCanvasElement;
      const px = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let s = '';
      for (let k = 0; k < px.length; k += 0x8000) s += String.fromCharCode(...px.subarray(k, k + 0x8000));
      return btoa(s);
    }, FRAME / 30);
    out.push(Uint8Array.from(Buffer.from(b64, 'base64')));
  }
  await browser.close();
  return out;
}
function diff(a: Uint8Array, b: Uint8Array): string {
  let n = 0, mx = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (d) {
      n++; mx = Math.max(mx, d);
      const p = i / 4, x = p % 1920, y = (p / 1920) | 0;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  return n ? `${n} px differ, max delta ${mx}, bbox x ${x0}-${x1} y ${y0}-${y1}` : 'identical';
}

const ref = (await session())[0];
for (let r = 0; r < REPEATS; r++) {
  const [first, second] = await session();
  console.log(`session ${r + 1}: first render ${diff(ref, first)} | second render ${diff(ref, second)}`);
}
server.stop(true);
process.exit(0);
