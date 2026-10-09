/**
 * Record a web demo with Playwright and make it a capture asset of a film:
 *
 *   bun scripts/capture.ts --film <film> --id <id> <scenario.ts> [--fps 30] [--quality 92] [--sources <dir>] [--no-keep-alive]
 *
 * 1. Opens the scenario's page in headless Chrome (the machine's Chrome, as every tool here), viewport from the
 *    scenario (default 1920x1080, DPR 1), and records it with page.screencast (JPEG frames with timestamps) while the
 *    scenario runs (scripts/lib/scenario.ts). The page reports pointer moves (at most every 30 ms), presses and keys
 *    with performance.timeOrigin + event.timeStamp, the clock of the frames. Unless --no-keep-alive, a near-invisible
 *    2x2 px element keeps the page painting so frames arrive at the display rate (see below).
 * 2. Resamples the frames to a fixed rate (output frame i shows the last frame recorded at or before t0 + i / fps)
 *    (until the recording was stopped: a still page sends no frames) and encodes them losslessly-enough (H.264 CRF 12) as the source video <sources>/<id>.mp4 (default
 *    out/<film>/sources/, outside the repository like every capture source), with <id>.events.jsonl beside it
 *    (seconds from the first output frame).
 * 3. Runs scripts/import-capture.ts on that video with the events, the viewport and DPR 1: the asset's frames and
 *    manifest come from the same pipeline as any other recording, and --rebuild works from the saved video.
 * Exit code 1 on failure, 2 on bad arguments.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import type { CaptureEvent } from '../engine/capture';
import { findChrome } from './chrome';
import { FILM_ID, requireFilm } from './film-arg';
import type { Act, Scenario } from './lib/scenario';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const opt = (k: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : undefined);
const usage = (m: string): never => { console.error(m); process.exit(2); };
const FILM = requireFilm(argv);
const ID = opt('id') ?? usage('--id <id> is required');
if (!FILM_ID.test(ID)) usage(`--id "${ID}": lowercase letters, digits, hyphens`);
const FILE = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--')) ?? usage('the scenario file is required');
if (!existsSync(FILE)) usage(`${FILE}: not found`);
const FPS = +(opt('fps') ?? 30);
if (!(Number.isInteger(FPS) && FPS > 0 && FPS <= 60)) usage(`--fps ${opt('fps')}: an integer 1–60`);
const QUALITY = +(opt('quality') ?? 92);
const SOURCES = path.resolve(ROOT, opt('sources') ?? `out/${FILM}/sources`);
const KEEP_ALIVE = !argv.includes('--no-keep-alive');

const scenario: Scenario = (await import(pathToFileURL(path.resolve(FILE)).href)).default;
if (!scenario?.url || typeof scenario.run !== 'function') usage(`${FILE}: the default export must be a Scenario { url, run(act) }`);
const vp = scenario.viewport ?? { width: 1920, height: 1080 };

const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
let code = 0;
try {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const raw: { t: number; type: CaptureEvent['type']; x?: number; y?: number; label?: string }[] = [];
  await ctx.exposeBinding('__capEvent', (_src, e) => { raw.push(e); });
  await ctx.addInitScript(() => {
    const send = (e: unknown) => (window as unknown as { __capEvent: (e: unknown) => void }).__capEvent(e);
    let lastMove = 0;
    addEventListener('pointermove', (ev) => {
      const e = ev as PointerEvent;
      if (e.timeStamp - lastMove < 30) return;
      lastMove = e.timeStamp;
      send({ t: performance.timeOrigin + e.timeStamp, type: 'move', x: e.clientX, y: e.clientY });
    }, true);
    addEventListener('pointerdown', (ev) => { const e = ev as PointerEvent; send({ t: performance.timeOrigin + e.timeStamp, type: 'click', x: e.clientX, y: e.clientY }); }, true);
    addEventListener('keydown', (ev) => { const e = ev as KeyboardEvent; send({ t: performance.timeOrigin + e.timeStamp, type: 'key', label: e.key }); }, true);
  });
  if (KEEP_ALIVE)
    // keep the compositor producing frames: a 2x2 px element at opacity 0.004 in the bottom-right corner changes colour
    // every animation frame (at most one level on four pixels). A still page otherwise sends no screencast frames, and
    // the first frame after a long pause arrives late (measured: up to 3 frames after the event).
    await ctx.addInitScript(() => {
      addEventListener('DOMContentLoaded', () => {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:0.004;pointer-events:none;z-index:2147483647';
        document.documentElement.appendChild(d);
        let k = 0;
        const tick = () => { d.style.background = k++ % 2 ? '#000' : '#fff'; requestAnimationFrame(tick); };
        tick();
      });
    });
  const page = await ctx.newPage();
  await page.goto(scenario.url, { waitUntil: 'load' });
  // the mouse starts at the centre, as a viewer expects a cursor somewhere visible
  let mx = vp.width / 2, my = vp.height / 2;
  await page.mouse.move(mx, my);
  const glide = async (x: number, y: number, ms = 600) => {
    const steps = Math.max(2, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const u = i / steps, e = u * u * (3 - 2 * u);
      await page.mouse.move(mx + (x - mx) * e, my + (y - my) * e);
      await page.waitForTimeout(ms / steps);
    }
    mx = x; my = y;
  };
  const act: Act = {
    page,
    async click(sel, o) {
      const box = await page.locator(sel).first().boundingBox();
      if (!box) throw new Error(`click: "${sel}" is not visible`);
      await glide(box.x + box.width / 2, box.y + box.height / 2, o?.ms);
      await page.mouse.down();
      await page.waitForTimeout(70);
      await page.mouse.up();
    },
    move: (x, y, o) => glide(x, y, o?.ms),
    async type(sel, text, o) {
      await act.click(sel);
      await page.keyboard.type(text, { delay: o?.delay ?? 70 });
    },
    async scroll(dy) {
      const n = Math.max(1, Math.round(Math.abs(dy) / 80));
      for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy / n); await page.waitForTimeout(16); }
    },
    wait: (ms) => page.waitForTimeout(ms),
    mark: (label) => { raw.push({ t: Date.now(), type: 'mark', label }); },
  };
  const frames: { data: Buffer; ts: number }[] = [];
  await page.screencast.start({ size: vp, quality: QUALITY, onFrame: ({ data, timestamp }) => { frames.push({ data, ts: timestamp }); } });
  await page.waitForTimeout(300);
  await scenario.run(act);
  await page.waitForTimeout(500);
  // the screencast sends a frame only when the page changes: the recording lasts until it is stopped, not until the
  // last frame (a still page repeats its last frame), on the frames' clock (wall-clock milliseconds)
  const tStop = Date.now();
  await page.screencast.stop();
  await ctx.close();
  if (frames.length < 2) throw new Error(`only ${frames.length} screencast frame(s) recorded`);

  // 2. resample to a fixed rate and encode the source video
  frames.sort((a, b) => a.ts - b.ts);
  const t0 = frames[0].ts, n = Math.floor(((Math.max(tStop, frames[frames.length - 1].ts) - t0) * FPS) / 1000) + 1;
  mkdirSync(SOURCES, { recursive: true });
  const video = path.join(SOURCES, `${ID}.mp4`);
  const ff = Bun.spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-vf', `scale=${vp.width}:${vp.height}:flags=bicubic,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-r', String(FPS), video], { stdin: 'pipe', stderr: 'pipe' });
  for (let i = 0, j = 0; i < n; i++) {
    const t = t0 + (i * 1000) / FPS;
    while (j + 1 < frames.length && frames[j + 1].ts <= t) j++;
    ff.stdin.write(frames[j].data);
  }
  ff.stdin.end();
  if ((await ff.exited) !== 0) throw new Error(`ffmpeg (source video): ${(await new Response(ff.stderr).text()).trim()}`);
  const events = raw.map((e) => ({ ...e, t: +((e.t - t0) / 1000).toFixed(4) })).filter((e) => e.t >= 0 && e.t < n / FPS).sort((a, b) => a.t - b.t);
  const evFile = path.join(SOURCES, `${ID}.events.jsonl`);
  writeFileSync(evFile, events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''));
  console.log(`recorded ${frames.length} screencast frames over ${((Math.max(tStop, frames[frames.length - 1].ts) - t0) / 1000).toFixed(2)}s -> ${n} frames at ${FPS} fps, ${events.length} events -> ${video}`);

  // 3. the import pipeline
  const imp = Bun.spawnSync(['bun', path.join(import.meta.dir, 'import-capture.ts'), '--film', FILM, '--id', ID, video, '--fps', String(FPS),
    '--viewport', `${vp.width}x${vp.height}`, '--dpr', '1', '--events', evFile, '--sync', '0=0'], { stdout: 'inherit', stderr: 'inherit' });
  if (imp.exitCode !== 0) throw new Error('import-capture failed');
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  code = 1;
} finally {
  await browser.close().catch(() => {});
}
process.exit(code);
