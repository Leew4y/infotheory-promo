/**
 * Pixel regression: render a fixed frame set through the page's ?export=1 hooks and compare the canvas's raw RGBA
 * (SHA-256 per frame, no JPEG/PNG encoding) with a committed baseline.
 *
 *   bun run build && bun scripts/regress.ts [--film infotheory] [--update] [--dist dist] [--workers 4] [--gpu]
 *                                           [--no-cpu2d-flag] [--allow-new]
 *
 * Defaults are the deterministic path from phase 0a: SwiftShader WebGL and the CPU 2D canvas
 * (--disable-accelerated-2d-canvas). --gpu uses the platform GPU backend instead (not exact, see spikes/RESULTS.md);
 * --no-cpu2d-flag drops the launch flag to check that the page itself selects the CPU 2D canvas.
 * Frame set: first/last, one frame either side of every scene boundary, and one frame per second; comparison also
 * renders every frame the baseline has.
 * Verdicts:
 *   PASS        every baseline frame matches, and the film's duration and fps equal the baseline's
 *   FAIL        a frame differs, a baseline frame is gone, or duration / fps changed
 *   INCOMPLETE  all baseline frames match, but today's frame set has frames the baseline lacks (e.g. a moved scene
 *               boundary); those were not compared. Exit 1 unless --allow-new.
 * The baseline is only comparable on the platform that recorded it (system fonts and SwiftShader can differ across
 * OS / CPU) and for the film the page actually renders; otherwise the run stops with exit code 2.
 * To rebuild the baseline from another commit:
 *   git worktree add ../base <commit> && (cd ../base && bun install && bun run build)
 *   bun scripts/regress.ts --dist ../base/dist --update
 * Exit code: 0 PASS (or baseline written), 1 FAIL / INCOMPLETE, 2 setup error or not comparable.
 * Writes out/regress/<film>/report.json.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { chromeArgs, findChrome, serveDist } from './chrome';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const VALUED = ['film', 'dist', 'workers'], FLAGS = ['update', 'gpu', 'no-cpu2d-flag', 'allow-new'];
for (let i = 0; i < argv.length; i++) {
  const k = argv[i].replace(/^--/, '');
  if (!argv[i].startsWith('--') || ![...VALUED, ...FLAGS].includes(k)) { console.error(`unknown argument: ${argv[i]}`); process.exit(2); }
  if (VALUED.includes(k)) i++;
}
const opt = (k: string, d: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const flag = (k: string) => argv.includes(`--${k}`);
const FILM = opt('film', 'infotheory');
const DIST = path.resolve(ROOT, opt('dist', 'dist'));
const WORKERS = +opt('workers', '4');
const FPS = 30;
const BASELINE = path.join(ROOT, 'films', FILM, 'regress-baseline.json');
const REPORT = path.join(ROOT, 'out', 'regress', FILM, 'report.json');
const PLATFORM = `${process.platform} ${process.arch}`;

let CHROME = '';
try { CHROME = findChrome(); } catch (e) { console.error((e as Error).message); process.exit(2); }
if (!existsSync(path.join(DIST, 'index.html'))) { console.error(`${DIST}/index.html missing: run \`bun run build\``); process.exit(2); }
const base = flag('update') ? null : existsSync(BASELINE) ? await Bun.file(BASELINE).json() : null;
if (!flag('update') && !base) { console.error(`no baseline at ${BASELINE} (run with --update)`); process.exit(2); }
if (base && base.platform !== PLATFORM) {
  console.error(`baseline recorded on ${base.platform ?? 'an unknown platform'}; not comparable on ${PLATFORM}. Record a local baseline with --update (do not commit it).`);
  process.exit(2);
}

const ARGS = chromeArgs(flag('gpu') ? 'platform' : 'swiftshader', { cpu2d: !flag('no-cpu2d-flag') });

interface W { browser: Browser; page: Page }
const hashFrame = (w: W, f: number): Promise<string> =>
  w.page.evaluate(async (t, fps) => {
    window.__frame(t, fps);
    const c = document.getElementById('c') as HTMLCanvasElement;
    const px = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', px));
    return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
  }, f / FPS, FPS);

const server = serveDist(DIST);
const ws: W[] = [];
let code = 2;
try {
  const t0 = performance.now();
  const launch = async (): Promise<W> => {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }, args: ARGS });
    const w = { browser, page: await browser.newPage() };
    ws.push(w);
    w.page.on('pageerror', (e) => console.error('page error:', e instanceof Error ? e.message : String(e)));
    w.page.on('console', (m) => m.type() === 'error' && console.error('console.error:', m.text()));
    await w.page.goto(`${server.url}/?export=1`, { waitUntil: 'load' });
    await w.page.waitForFunction(() => typeof window.__frame === 'function' && window.__ready(), { timeout: 60_000 });
    return w;
  };
  await Promise.all(Array.from({ length: WORKERS }, launch));
  const page = ws[0].page;
  const pageFilm: string | undefined = await page.evaluate(() => window.__film);
  if (pageFilm !== FILM) throw new Error(`the built page renders film "${pageFilm}", not "${FILM}"`);
  // the baseline is the film's default style (the page is opened without ?style=)
  const pageStyle: string = await page.evaluate(() => window.__style);
  if (base?.style !== undefined && base.style !== pageStyle) throw new Error(`the baseline is style "${base.style}", the page renders "${pageStyle}"`);
  const scenes: { name: string; start: number; end: number }[] = await page.evaluate(() => window.__scenes());
  const duration: number = await page.evaluate(() => window.__duration);
  const gpu: string = await page.evaluate(() => window.__gpu());
  const chrome = await ws[0].browser.version();

  const last = Math.floor(duration * FPS) - 1;
  const current = new Set<number>([0, last]);
  for (const s of scenes) {
    const f0 = Math.ceil(s.start * FPS - 1e-9);
    for (const f of [f0 - 1, f0, f0 + 1]) if (f >= 0 && f <= last) current.add(f);
  }
  for (let f = 0; f <= last; f += FPS) current.add(f);
  const set = new Set(current);
  if (base) for (const k of Object.keys(base.hashes)) if (+k <= last) set.add(+k);
  const frames = [...set].sort((a, b) => a - b);

  const hashes: Record<number, string> = {};
  let next = 0;
  await Promise.all(ws.map(async (w) => { while (next < frames.length) { const f = frames[next++]; hashes[f] = await hashFrame(w, f); } }));
  const seconds = +((performance.now() - t0) / 1000).toFixed(1);
  const meta = { film: FILM, style: pageStyle, platform: PLATFORM, chrome, gpu, args: ARGS, fps: FPS, duration, frames: frames.length };

  if (flag('update')) {
    mkdirSync(path.dirname(BASELINE), { recursive: true });
    const commit = (await Bun.$`git -C ${path.dirname(DIST)} rev-parse HEAD`.nothrow().text()).trim();
    writeFileSync(BASELINE, JSON.stringify({ ...meta, commit, hashes }, null, 1));
    console.log(`baseline written: ${frames.length} frames, ${seconds}s -> ${BASELINE}`);
    code = 0;
  } else {
    const failures: string[] = [], warnings: string[] = [];
    if (base.chrome !== chrome) warnings.push(`Chrome differs from baseline: ${base.chrome} vs ${chrome}`);
    if (base.duration !== duration) failures.push(`duration changed: ${base.duration}s -> ${duration}s`);
    if (base.fps !== FPS) failures.push(`fps changed: ${base.fps} -> ${FPS}`);
    const baseFrames = Object.keys(base.hashes).map(Number);
    const mismatched = baseFrames.filter((f) => hashes[f] !== undefined && base.hashes[f] !== hashes[f]);
    const missing = baseFrames.filter((f) => hashes[f] === undefined);
    const uncompared = frames.filter((f) => base.hashes[f] === undefined);
    if (mismatched.length) failures.push(`${mismatched.length} frame(s) differ`);
    if (missing.length) failures.push(`${missing.length} baseline frame(s) no longer exist`);
    const verdict = failures.length ? 'FAIL' : uncompared.length ? 'INCOMPLETE' : 'PASS';
    const report = { ...meta, baselineCommit: base.commit, verdict, pass: verdict === 'PASS', seconds, compared: baseFrames.length - missing.length, mismatched, missing, uncompared, failures, warnings };
    mkdirSync(path.dirname(REPORT), { recursive: true });
    writeFileSync(REPORT, JSON.stringify(report, null, 1));
    for (const w of warnings) console.warn('warning:', w);
    for (const f of failures) console.log('failure:', f);
    if (uncompared.length) console.log(`not in the baseline, not compared: ${uncompared.slice(0, 12).join(' ')}${uncompared.length > 12 ? ' ...' : ''}`);
    console.log(`${verdict} regress ${FILM}: ${report.compared} frames compared, ${mismatched.length} mismatched, ${missing.length} missing, ${uncompared.length} uncompared, ${seconds}s -> ${REPORT}`);
    if (mismatched.length) console.log('first mismatches (frame/seconds):', mismatched.slice(0, 12).map((f) => `${f}/${(f / FPS).toFixed(2)}`).join(' '));
    code = verdict === 'PASS' || (verdict === 'INCOMPLETE' && flag('allow-new')) ? 0 : 1;
  }
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`regress could not run: ${message}`);
  mkdirSync(path.dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, JSON.stringify({ film: FILM, verdict: 'ERROR', pass: false, error: message }, null, 1));
  code = 2;
} finally {
  await Promise.all(ws.map((w) => w.browser.close().catch(() => {})));
  server.stop();
}
process.exit(code);
