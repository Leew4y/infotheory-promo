/**
 * Phase 0c: Playwright page.screencast quality and event alignment.
 *
 *   cd spikes/0c-capture && bun install && bun run.ts [--seconds 16]
 *
 * For each config (viewport 1920x1080 @ DPR 1, viewport 1280x720 @ DPR 2; size 1920x1080, quality 90) it records
 * the local test page (CSS animation, a scroll list, clicks) with onFrame, logs DOM pointerdown times on the same
 * epoch clock, then:
 *   - frame intervals (median / p95 / max) and actual JPEG size;
 *   - resamples to 30 fps (last frame at or before each output time) and finds, for each click, the first output
 *     frame whose in-page marker shows that click; deviation = that frame - the output frame containing the event.
 * Writes result.json and one sample frame per config to out/0c-capture/.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(import.meta.dir, '../..');
const OUT = path.join(ROOT, 'out', '0c-capture');
mkdirSync(OUT, { recursive: true });
const argv = Bun.argv.slice(2);
const SECONDS = argv.includes('--seconds') ? +argv[argv.indexOf('--seconds') + 1] : 16;
const CHROME = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
if (!CHROME) throw new Error('Chrome not found (set CHROME_PATH)');
const PAGE_URL = 'file:///' + path.join(import.meta.dir, 'page.html').replace(/\\/g, '/');

/** Width and height from a JPEG's SOF marker. */
function jpegSize(b: Buffer): [number, number] {
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return [0, 0];
}
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };

/** Decode the click marker of each JPEG (crop to the marker strip in ffmpeg, then sample block centres). */
async function readMarkers(jpegs: Buffer[], w: number, h: number): Promise<number[]> {
  const cw = Math.floor(w * 0.6), ch = Math.round(h * 0.08), cy = Math.round(h * 0.88);
  const ff = Bun.spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-i', 'pipe:0', '-vf', `crop=${cw}:${ch}:0:${cy}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { stdin: 'pipe', stdout: 'pipe' });
  const outP = new Response(ff.stdout).arrayBuffer();
  for (const j of jpegs) ff.stdin.write(j);
  ff.stdin.end();
  const raw = new Uint8Array(await outP);
  const sz = cw * ch * 3;
  const res: number[] = [];
  for (let f = 0; f * sz < raw.length; f++) {
    const mean = (k: number) => {
      const cx = Math.round((0.06 * k + 0.03) * w), y0 = Math.round(ch / 2);
      let s = 0, n = 0;
      for (let y = y0 - 6; y < y0 + 6; y++) for (let x = cx - 6; x < cx + 6; x++) { const i = f * sz + (y * cw + x) * 3; s += (raw[i] + raw[i + 1] + raw[i + 2]) / 3; n++; }
      return s / n;
    };
    const white = mean(0), black = mean(1);
    if (white - black < 128) { res.push(-1); continue; }
    const th = (white + black) / 2;
    let n = 0, ok = true;
    for (let k = 0; k < 8; k++) { const v = mean(2 + k); if (Math.abs(v - th) < (white - black) * 0.25) ok = false; if (v > th) n |= 1 << k; }
    res.push(ok ? n : -1);
  }
  return res;
}

const configs = [
  { name: 'vp1920-dpr1', viewport: { width: 1920, height: 1080 }, dpr: 1 },
  { name: 'vp1280-dpr2', viewport: { width: 1280, height: 720 }, dpr: 2 },
];
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const results = [];
for (const c of configs) {
  const ctx = await browser.newContext({ viewport: c.viewport, deviceScaleFactor: c.dpr });
  const page = await ctx.newPage();
  await page.goto(PAGE_URL);
  await page.waitForTimeout(500);
  const frames: { data: Buffer; ts: number; vw: number; vh: number }[] = [];
  await page.screencast.start({
    size: { width: 1920, height: 1080 },
    quality: 90,
    onFrame: async ({ data, timestamp, viewportWidth, viewportHeight }) => { frames.push({ data, ts: timestamp, vw: viewportWidth, vh: viewportHeight }); },
  });
  const tStart = Date.now();
  // clicks on the button grid every ~0.8-1.2 s, plus scrolling the list
  let k = 0;
  while (Date.now() - tStart < SECONDS * 1000 - 1500) {
    await page.waitForTimeout(800 + ((k * 137) % 400));
    const bx = c.viewport.width * (0.70 + 0.07 * (k % 4)), by = c.viewport.height * (0.08 + 0.09 * ((k >> 2) % 4));
    await page.mouse.click(bx, by);
    if (k % 3 === 2) { await page.mouse.move(c.viewport.width * 0.1, c.viewport.height * 0.3); await page.mouse.wheel(0, 400); }
    k++;
  }
  await page.waitForTimeout(1000);
  await page.screencast.stop();
  const events: { i: number; t: number }[] = await page.evaluate(() => (window as any).__events);
  await ctx.close();

  frames.sort((a, b) => a.ts - b.ts);
  const sizes = new Set(frames.map((f) => jpegSize(f.data).join('x')));
  const [w, h] = jpegSize(frames[0].data);
  const iv = frames.slice(1).map((f, i) => f.ts - frames[i].ts);
  writeFileSync(path.join(OUT, `sample-${c.name}.jpg`), frames[Math.floor(frames.length / 2)].data);
  // resample to 30 fps from the first frame
  const t0 = frames[0].ts, tEnd = frames[frames.length - 1].ts;
  const nOut = Math.floor(((tEnd - t0) * 30) / 1000) + 1;
  const pick: number[] = [];
  for (let i = 0, j = 0; i < nOut; i++) { const t = t0 + (i * 1000) / 30; while (j + 1 < frames.length && frames[j + 1].ts <= t) j++; pick.push(j); }
  const markers = await readMarkers(frames.map((f) => f.data), w, h);
  const outMarker = pick.map((j) => markers[j]);
  const align = events.map((e) => {
    const expected = Math.floor(((e.t - t0) * 30) / 1000);
    const observed = outMarker.findIndex((m) => m === e.i);
    return { click: e.i, expected, observed, deviation: observed < 0 ? null : observed - expected, latencyMs: observed < 0 ? null : +(frames[pick[observed]].ts - e.t).toFixed(1) };
  });
  const r = {
    config: c.name, viewport: c.viewport, dpr: c.dpr, requestedSize: '1920x1080', quality: 90,
    jpegSizes: [...sizes], frameViewport: `${frames[0].vw}x${frames[0].vh}`,
    frames: frames.length, seconds: +((tEnd - t0) / 1000).toFixed(2), effectiveFps: +((frames.length - 1) / ((tEnd - t0) / 1000)).toFixed(1),
    intervalMs: { median: +q(iv, 0.5).toFixed(1), p95: +q(iv, 0.95).toFixed(1), max: +Math.max(...iv).toFixed(1) },
    unreadableMarkers: markers.filter((m) => m < 0).length,
    clicks: events.length, alignment: align,
    maxAbsDeviation: Math.max(...align.map((a) => (a.deviation === null ? Infinity : Math.abs(a.deviation)))),
  };
  results.push(r);
  console.log(JSON.stringify({ ...r, alignment: undefined }));
}
await browser.close();
const env = { platform: `${process.platform} ${process.arch}`, chrome: CHROME, playwright: '1.63.0' };
// RESULT_DIR lets another machine keep its results apart (e.g. spikes/0d-macos)
const RES = process.env.RESULT_DIR ? path.resolve(ROOT, process.env.RESULT_DIR) : import.meta.dir;
mkdirSync(RES, { recursive: true });
const resultFile = path.join(RES, 'capture-result.json');
writeFileSync(resultFile, JSON.stringify({ env, results }, null, 1));
console.log(`-> ${resultFile}`);
