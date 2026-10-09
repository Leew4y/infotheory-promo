/**
 * Record a web demo with Playwright and make it a capture asset of a film:
 *
 *   bun scripts/capture.ts --film <film> --id <id> <scenario.ts> [--fps 30] [--quality 92] [--sources <dir>]
 *                          [--max-seconds 600] [--no-keep-alive]
 *
 * 1. Opens the scenario's page in headless Chrome (the machine's Chrome, as every tool here), viewport from the
 *    scenario (default 1920x1080, DPR 1), and records it with page.screencast (JPEG frames with timestamps) while the
 *    scenario runs (scripts/lib/scenario.ts). The page reports pointer moves (at most every 30 ms), presses (with the
 *    target element and its box) and keys with performance.timeOrigin + event.timeStamp, the clock of the frames.
 *    Only events of the recorded page's main frame are kept: events inside iframes and in popups are dropped (and
 *    counted), since their coordinates are not the recorded viewport's. Unless --no-keep-alive, a near-invisible 2x2 px
 *    element keeps the page painting so frames arrive at the display rate (see below). The scenario must finish within
 *    --max-seconds.
 * 2. Resamples the frames to a fixed rate as they arrive (output frame i shows the last frame recorded at or before
 *    t0 + i / fps, until the recording was stopped: a still page sends no frames) and streams them into the encoder
 *    (H.264 CRF 12), so memory stays bounded; an encoder that falls more than 10 s behind fails the recording. The
 *    source video <sources>/<id>.mp4 (default out/<film>/sources/, outside the repository like every capture source)
 *    gets <id>.events.jsonl beside it (seconds from the first output frame, full precision). The page's clock and this
 *    process's are compared at the start and the stop; a jump (clock adjusted, machine slept) fails the recording.
 * 3. Runs scripts/import-capture.ts on that video with the events, the viewport and DPR 1: the asset's frames and
 *    manifest come from the same pipeline as any other recording, and --rebuild works from the saved video.
 * The new video and events are written under temporary names; the previous ones are kept aside until the import
 * succeeded and put back if it fails. Exit code 1 on failure, 2 on bad arguments.
 */
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium, type Page } from 'playwright-core';
import type { CaptureEvent } from '../engine/capture';
import { findChrome } from './chrome';
import { FILM_ID, requireFilm } from './film-arg';
import type { Act, Scenario } from './lib/scenario';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const usage = (m: string): never => { console.error(m); process.exit(2); };
const FILM = requireFilm(argv);
let parsed: { values: Record<string, string | boolean | undefined>; positionals: string[] } = { values: {}, positionals: [] };
try {
  parsed = parseArgs({
    args: argv, allowPositionals: true, strict: true,
    options: {
      film: { type: 'string' }, id: { type: 'string' }, fps: { type: 'string' }, quality: { type: 'string' }, sources: { type: 'string' },
      'max-seconds': { type: 'string' }, 'no-keep-alive': { type: 'boolean' },
    },
  });
} catch (e) { usage(e instanceof Error ? e.message : String(e)); }
const o = parsed.values as Record<string, string | undefined>;
const ID = o.id ?? usage('--id <id> is required');
if (!FILM_ID.test(ID)) usage(`--id "${ID}": lowercase letters, digits, hyphens`);
if (parsed.positionals.length !== 1) usage(`one scenario file is required (got ${parsed.positionals.length})`);
const FILE = parsed.positionals[0];
if (!existsSync(FILE)) usage(`${FILE}: not found`);
const FPS = +(o.fps ?? 30);
if (!(Number.isInteger(FPS) && FPS > 0 && FPS <= 60)) usage(`--fps ${o.fps}: an integer 1–60`);
const QUALITY = +(o.quality ?? 92);
if (!(Number.isInteger(QUALITY) && QUALITY >= 1 && QUALITY <= 100)) usage(`--quality ${o.quality}: an integer 1–100`);
const MAX_SECONDS = +(o['max-seconds'] ?? 600);
if (!(Number.isFinite(MAX_SECONDS) && MAX_SECONDS > 0)) usage(`--max-seconds ${o['max-seconds']}: a number > 0`);
const SOURCES = path.resolve(ROOT, o.sources ?? `out/${FILM}/sources`);
const KEEP_ALIVE = !parsed.values['no-keep-alive'];
/** How far (output frames) the encoder may fall behind the recording before it fails: 10 s. */
const BACKLOG = 10 * FPS;
/** The largest disagreement between the page's clock and this process's, start vs stop, before the recording fails. */
const CLOCK_TOLERANCE_MS = 50;

const scenario: Scenario = (await import(pathToFileURL(path.resolve(FILE)).href)).default;
if (!scenario?.url || typeof scenario.run !== 'function') usage(`${FILE}: the default export must be a Scenario { url, run(act) }`);
const vp = scenario.viewport ?? { width: 1920, height: 1080 };

mkdirSync(SOURCES, { recursive: true });
const video = path.join(SOURCES, `${ID}.mp4`), evFile = path.join(SOURCES, `${ID}.events.jsonl`);
const tag = `${process.pid}`;
const tmpVideo = path.join(SOURCES, `.${ID}.${tag}.tmp.mp4`), tmpEvents = path.join(SOURCES, `.${ID}.${tag}.tmp.events.jsonl`);
const lockDir = path.join(SOURCES, `.${ID}.lock`);
try { mkdirSync(lockDir); } catch { usage(`${ID}: another capture of this id is running (or one crashed: remove ${lockDir})`); }

const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
let ff: ReturnType<typeof Bun.spawn> | null = null;
const backups: [string, string][] = [];
let code = 0;
try {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const raw: CaptureEvent[] = [];
  let page: Page | null = null;
  const dropped = { popup: 0, frame: 0 };
  await ctx.exposeBinding('__capEvent', (src, e: CaptureEvent) => {
    if (src.page !== page) dropped.popup++;
    else if (src.frame !== page.mainFrame()) dropped.frame++;
    else raw.push(e);
  });
  await ctx.addInitScript(() => {
    const send = (e: unknown) => (window as unknown as { __capEvent: (e: unknown) => void }).__capEvent(e);
    const describe = (el: Element) => {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
      return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + cls.map((c) => `.${c}`).join('');
    };
    let lastMove = 0;
    addEventListener('pointermove', (ev) => {
      const e = ev as PointerEvent;
      if (e.timeStamp - lastMove < 30) return;
      lastMove = e.timeStamp;
      send({ t: performance.timeOrigin + e.timeStamp, type: 'move', x: e.clientX, y: e.clientY });
    }, true);
    addEventListener('pointerdown', (ev) => {
      const e = ev as PointerEvent;
      const el = e.target instanceof Element ? e.target : null;
      const r = el?.getBoundingClientRect();
      send({
        t: performance.timeOrigin + e.timeStamp, type: 'click', x: e.clientX, y: e.clientY,
        ...(el ? { target: describe(el) } : {}), ...(r ? { box: { x: r.x, y: r.y, w: r.width, h: r.height } } : {}),
      });
    }, true);
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
  page = await ctx.newPage();
  const pg = page;
  await pg.goto(scenario.url, { waitUntil: 'load' });
  // the mouse starts at the centre, as a viewer expects a cursor somewhere visible
  let mx = vp.width / 2, my = vp.height / 2;
  await pg.mouse.move(mx, my);
  const glide = async (x: number, y: number, ms = 600) => {
    const steps = Math.max(2, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const u = i / steps, e = u * u * (3 - 2 * u);
      await pg.mouse.move(mx + (x - mx) * e, my + (y - my) * e);
      await pg.waitForTimeout(ms / steps);
    }
    mx = x; my = y;
  };
  const act: Act = {
    page: pg,
    async click(sel, o) {
      const box = await pg.locator(sel).first().boundingBox();
      if (!box) throw new Error(`click: "${sel}" is not visible`);
      await glide(box.x + box.width / 2, box.y + box.height / 2, o?.ms);
      await pg.mouse.down();
      await pg.waitForTimeout(70);
      await pg.mouse.up();
    },
    move: (x, y, o) => glide(x, y, o?.ms),
    async type(sel, text, o) {
      await act.click(sel);
      await pg.keyboard.type(text, { delay: o?.delay ?? 70 });
    },
    async scroll(dy) {
      const n = Math.max(1, Math.round(Math.abs(dy) / 80));
      for (let i = 0; i < n; i++) { await pg.mouse.wheel(0, dy / n); await pg.waitForTimeout(16); }
    },
    wait: (ms) => pg.waitForTimeout(ms),
    mark: (label) => { raw.push({ t: Date.now(), type: 'mark', label }); },
  };
  /** This process's clock minus the page's (ms): the frames and marks use the one, the events the other. */
  const clockSkew = async () => {
    const a = Date.now(), p = await pg.evaluate(() => performance.timeOrigin + performance.now()), b = Date.now();
    return (a + b) / 2 - p;
  };

  // 2. the encoder, fed while recording: output frame i (at t0 + i / fps) shows the last frame at or before it
  ff = Bun.spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-vf', `scale=${vp.width}:${vp.height}:flags=bicubic,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-r', String(FPS), '-f', 'mp4', tmpVideo], { stdin: 'pipe', stderr: 'pipe' });
  const enc = ff;
  const queue: Buffer[] = [];
  let t0 = -1, n = 0, recorded = 0, late = 0, prev: { data: Buffer; ts: number } | null = null, encErr: Error | null = null, wake: (() => void) | null = null;
  /** Emit output frames up to (excluding) time `until` with the previous recorded frame. */
  const emitUntil = (until: number) => {
    if (!prev) return;
    while (t0 + (n * 1000) / FPS < until) { queue.push(prev.data); n++; }
    if (queue.length > BACKLOG && !encErr) encErr = new Error(`the encoder fell more than ${BACKLOG / FPS} s behind the recording`);
    wake?.();
  };
  let stopped = false;
  const pump = (async () => {
    const sink = enc.stdin as import('bun').FileSink;
    for (;;) {
      while (queue.length) { sink.write(queue.shift()!); await sink.flush(); }
      if (stopped) break;
      await new Promise<void>((r) => { wake = r; });
      wake = null;
    }
    sink.end();
  })();
  await pg.screencast.start({
    size: vp, quality: QUALITY,
    onFrame: ({ data, timestamp }) => {
      recorded++;
      if (prev && timestamp < prev.ts) { late++; return; }
      if (t0 < 0) t0 = timestamp;
      emitUntil(timestamp);
      prev = { data, ts: timestamp };
    },
  });
  const skew0 = await clockSkew();
  await pg.waitForTimeout(300);
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    scenario.run(act),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`the scenario did not finish within --max-seconds ${MAX_SECONDS}`)), MAX_SECONDS * 1000); }),
  ]).finally(() => clearTimeout(timer));
  await pg.waitForTimeout(500);
  if (encErr) throw encErr;
  const skew1 = await clockSkew();
  if (Math.abs(skew1 - skew0) > CLOCK_TOLERANCE_MS)
    throw new Error(`the clocks drifted ${(skew1 - skew0).toFixed(0)} ms apart during the recording (system clock adjusted or the machine slept?); record again`);
  // the screencast sends a frame only when the page changes: the recording lasts until it is stopped, not until the
  // last frame (a still page repeats its last frame), on the frames' clock (wall-clock milliseconds)
  const tStop = Date.now();
  await pg.screencast.stop();
  await ctx.close();
  if (!prev) throw new Error('no screencast frame was recorded');
  emitUntil(Math.max(tStop, (prev as { ts: number }).ts) + 1e-6);
  if (n === 0) { queue.push((prev as { data: Buffer }).data); n = 1; }
  stopped = true;
  (wake as (() => void) | null)?.();
  await pump;
  if (encErr) throw encErr;
  if ((await enc.exited) !== 0) throw new Error(`ffmpeg (source video): ${(await new Response(enc.stderr as ReadableStream).text()).trim()}`);
  const events = raw.map((e) => ({ ...e, t: (e.t - t0) / 1000 })).filter((e) => e.t >= 0 && e.t < n / FPS).sort((a, b) => a.t - b.t);
  writeFileSync(tmpEvents, events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''));
  const skipped = dropped.popup + dropped.frame;
  console.log(`recorded ${recorded} screencast frames${late ? ` (${late} out of order, dropped)` : ''} -> ${n} frames at ${FPS} fps, ${events.length} events${skipped ? ` (${dropped.frame} in iframes and ${dropped.popup} in popups dropped)` : ''} -> ${video}`);

  // 3. the new source in place (the previous one aside), then the import pipeline
  for (const [tmp, f] of [[tmpVideo, video], [tmpEvents, evFile]] as const) {
    if (existsSync(f)) { const bak = `${f}.${tag}.bak`; renameSync(f, bak); backups.push([bak, f]); }
    renameSync(tmp, f);
  }
  const imp = Bun.spawnSync(['bun', path.join(import.meta.dir, 'import-capture.ts'), '--film', FILM, '--id', ID, video, '--fps', String(FPS),
    `--viewport`, `${vp.width}x${vp.height}`, '--dpr', '1', '--events', evFile, '--sync', '0=0'], { stdout: 'inherit', stderr: 'inherit' });
  if (imp.exitCode !== 0) {
    // the asset is unchanged (import-capture commits nothing on failure): put its source back
    for (const [bak, f] of backups) { rmSync(f, { force: true }); renameSync(bak, f); }
    backups.length = 0;
    throw new Error('import-capture failed; the previous source video and events are back in place');
  }
  for (const [bak] of backups) rmSync(bak, { force: true });
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  code = 1;
} finally {
  if (ff && ff.exitCode === null) ff.kill();
  await browser.close().catch(() => {});
  rmSync(tmpVideo, { force: true });
  rmSync(tmpEvents, { force: true });
  rmSync(lockDir, { recursive: true, force: true });
}
process.exit(code);
