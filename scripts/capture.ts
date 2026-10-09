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
 *    (H.264 CRF 12), so memory stays bounded: at most 300 recorded frames wait for the encoder (a repeated frame is one
 *    entry with a count); more fails the recording at once, as does the encoder exiting, and its drain has a deadline.
 *    The source video <sources>/<id>.mp4 (default out/<film>/sources/, outside the repository like every capture
 *    source) gets <id>.events.jsonl beside it (seconds from the first output frame, full precision). The page's clock
 *    and this process's are compared every second; a jump of more than 50 ms (clock adjusted, machine slept) fails the
 *    recording.
 * 3. Runs scripts/import-capture.ts on that video with the events, the viewport and DPR 1: the asset's frames and
 *    manifest come from the same pipeline as any other recording, and --rebuild works from the saved video.
 * The new video and events are written under temporary names; the previous ones are kept aside until the import
 * committed (exit 0) and put back on any failure before that. Exit code 1 on failure, 2 on bad arguments.
 */
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium, type Browser, type Page } from 'playwright-core';
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
/** How many recorded frames may wait for the encoder before the recording fails (memory bound). */
const BACKLOG = 300;
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

/** Remove a leftover; a failure is only a warning. */
const tidy = (p: string) => { try { rmSync(p, { recursive: true, force: true }); } catch (e) { console.warn(`warning: could not remove ${p}: ${e instanceof Error ? e.message : e}`); } };
let browser: Browser | null = null;
let ff: ReturnType<typeof Bun.spawn> | null = null;
let skewTimer: ReturnType<typeof setInterval> | undefined;
let code = 0;
try {
  browser = await chromium.launch({ executablePath: findChrome(), headless: true });
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
  // the queue holds runs: one recorded frame and how many output frames repeat it
  const queue: { data: Buffer; count: number }[] = [];
  let t0 = -1, n = 0, recorded = 0, late = 0, prev: { data: Buffer; ts: number } | null = null, stopped = false;
  let wake: (() => void) | null = null;
  const st: { err: Error | null } = { err: null };
  let failed: (e: Error) => void = () => {};
  const failure = new Promise<never>((_, reject) => { failed = reject; });
  failure.catch(() => {});
  /** Fail the recording (the first reason wins): the scenario race, the drain and the pump all see it. */
  const abort = (e: Error) => { if (!st.err) { st.err = e; failed(e); } wake?.(); };
  /** Emit output frames up to (excluding) time `until` with the previous recorded frame. */
  const emitUntil = (until: number, final = false) => {
    if (!prev || st.err) return;
    let k = 0;
    while (t0 + (n * 1000) / FPS < until) { k++; n++; }
    if (!k) return;
    if (!final && queue.length >= BACKLOG) return abort(new Error(`the encoder fell behind: ${BACKLOG} recorded frames are waiting for it`));
    queue.push({ data: prev.data, count: k });
    wake?.();
  };
  const pump = (async () => {
    const sink = enc.stdin as import('bun').FileSink;
    try {
      for (;;) {
        while (queue.length && !st.err) {
          const q = queue[0];
          for (let i = 0; i < q.count && !st.err; i++) { sink.write(q.data); await sink.flush(); }
          queue.shift();
        }
        if (stopped || st.err) break;
        await new Promise<void>((r) => { wake = r; });
        wake = null;
      }
    } catch (e) {
      abort(e instanceof Error ? e : new Error(String(e)));
    } finally {
      try { sink.end(); } catch {}
    }
  })();
  enc.exited.then((c) => { if (!stopped || c !== 0) abort(new Error(`ffmpeg (source video) exited with ${c} while recording`)); });
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
  skewTimer = setInterval(() => {
    clockSkew().then((s) => {
      if (Math.abs(s - skew0) > CLOCK_TOLERANCE_MS) abort(new Error(`the clocks drifted ${(s - skew0).toFixed(0)} ms apart during the recording (system clock adjusted or the machine slept?); record again`));
    }, () => {});
  }, 1000);
  const deadline = (s: number, what: string) => new Promise<never>((_, reject) => { const t = setTimeout(() => reject(new Error(`${what} did not finish within ${s.toFixed(0)} s`)), s * 1000); t.unref?.(); });
  await pg.waitForTimeout(300);
  await Promise.race([scenario.run(act), failure, deadline(MAX_SECONDS, 'the scenario (--max-seconds)')]);
  await Promise.race([pg.waitForTimeout(500), failure]);
  clearInterval(skewTimer);
  const skew1 = await clockSkew();
  if (Math.abs(skew1 - skew0) > CLOCK_TOLERANCE_MS) abort(new Error(`the clocks drifted ${(skew1 - skew0).toFixed(0)} ms apart during the recording (system clock adjusted or the machine slept?); record again`));
  if (st.err) throw st.err;
  // the screencast sends a frame only when the page changes: the recording lasts until it is stopped, not until the
  // last frame (a still page repeats its last frame), on the frames' clock (wall-clock milliseconds)
  const tStop = Date.now();
  await pg.screencast.stop();
  await ctx.close();
  if (!prev) throw new Error('no screencast frame was recorded');
  emitUntil(Math.max(tStop, (prev as { ts: number }).ts) + 1e-6, true);
  if (n === 0) { queue.push({ data: (prev as { data: Buffer }).data, count: 1 }); n = 1; }
  stopped = true;
  (wake as (() => void) | null)?.();
  // the drain: whatever is queued at >= 10 output frames a second, plus a minute
  await Promise.race([pump, failure, deadline(60 + queue.reduce((k, q) => k + q.count, 0) / 10, 'encoding the source video')]);
  if (st.err) throw st.err;
  const exit = await Promise.race([enc.exited, deadline(60, 'the encoder')]);
  if (exit !== 0) throw new Error(`ffmpeg (source video): ${(await new Response(enc.stderr as ReadableStream).text()).trim()}`);
  const events = raw.map((e) => ({ ...e, t: (e.t - t0) / 1000 })).filter((e) => e.t >= 0 && e.t < n / FPS).sort((a, b) => a.t - b.t);
  writeFileSync(tmpEvents, events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''));
  const skipped = dropped.popup + dropped.frame;
  console.log(`recorded ${recorded} screencast frames${late ? ` (${late} out of order, dropped)` : ''} -> ${n} frames at ${FPS} fps, ${events.length} events${skipped ? ` (${dropped.frame} in iframes and ${dropped.popup} in popups dropped)` : ''} -> ${video}`);

  // 3. the new source in place (the previous one aside), then the import pipeline; its exit 0 is the commit point.
  // Any failure before it puts back exactly what was there (and removes what was not).
  const swapped: { f: string; bak: string | null }[] = [];
  let committed = false;
  try {
    for (const [tmp, f] of [[tmpVideo, video], [tmpEvents, evFile]] as const) {
      const bak = existsSync(f) ? `${f}.${tag}.bak` : null;
      if (bak) renameSync(f, bak);
      swapped.push({ f, bak });
      renameSync(tmp, f);
    }
    const imp = Bun.spawnSync(['bun', path.join(import.meta.dir, 'import-capture.ts'), '--film', FILM, '--id', ID, video, '--fps', String(FPS),
      `--viewport`, `${vp.width}x${vp.height}`, '--dpr', '1', '--events', evFile, '--sync', '0=0'], { stdout: 'inherit', stderr: 'inherit' });
    if (imp.exitCode !== 0) throw new Error('import-capture failed; the previous source video and events are put back');
    committed = true;
  } catch (e) {
    if (!committed)
      for (const s of swapped.reverse()) {
        try { rmSync(s.f, { force: true }); if (s.bak) renameSync(s.bak, s.f); } catch (r) { console.error(`could not restore ${s.f}${s.bak ? ` from ${s.bak}` : ''}: ${r instanceof Error ? r.message : r}`); }
      }
    throw e;
  }
  for (const s of swapped) if (s.bak) tidy(s.bak);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  code = 1;
} finally {
  clearInterval(skewTimer);
  if (ff && ff.exitCode === null) { ff.kill(); await Promise.race([ff.exited, Bun.sleep(5000)]); }
  await browser?.close().catch(() => {});
  tidy(tmpVideo);
  tidy(tmpEvents);
  tidy(lockDir);
}
process.exit(code);
