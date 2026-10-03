/**
 * Pixel regression: render a fixed frame set through the page's ?export=1 hooks and compare the canvas's raw RGBA
 * (SHA-256 per frame, no JPEG/PNG encoding) with a committed baseline.
 *
 *   bun run build && bun scripts/regress.ts [--film infotheory] [--update] [--dist dist] [--workers 4] [--gpu] [--no-cpu2d-flag]
 *
 * Defaults are the deterministic path from phase 0a: SwiftShader WebGL and the CPU 2D canvas
 * (--disable-accelerated-2d-canvas). --gpu uses the platform GPU backend instead (not exact, see spikes/RESULTS.md);
 * --no-cpu2d-flag drops the launch flag to check that the page itself selects the CPU 2D canvas.
 * Frame set: first/last, one frame either side of every scene boundary, and one frame per second.
 * Baseline: films/<film>/regress-baseline.json. To rebuild it from another commit:
 *   git worktree add ../base <commit> && (cd ../base && bun install && bun run build)
 *   bun scripts/regress.ts --dist ../base/dist --update
 * The baseline is only comparable on the platform that recorded it (system fonts and SwiftShader can differ across
 * OS / CPU); on another platform the run stops with exit code 2. Comparison uses the baseline's own frame list, so a
 * moved scene boundary is reported as new frames instead of failing.
 * Exit code: 0 match (or baseline written), 1 mismatch, 2 setup error or not comparable. Writes out/regress/<film>/report.json.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const opt = (k: string, d: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const flag = (k: string) => argv.includes(`--${k}`);
const FILM = opt('film', 'infotheory');
const DIST = path.resolve(ROOT, opt('dist', 'dist'));
const WORKERS = +opt('workers', '4');
const FPS = 30;
const BASELINE = path.join(ROOT, 'films', FILM, 'regress-baseline.json');
const REPORT = path.join(ROOT, 'out', 'regress', FILM, 'report.json');

const CHROME = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
if (!CHROME) { console.error('Chrome not found (set CHROME_PATH)'); process.exit(2); }
if (!existsSync(path.join(DIST, 'index.html'))) { console.error(`${DIST}/index.html missing: run \`bun run build\``); process.exit(2); }

const ARGS = [
  '--window-size=1920,1080', '--ignore-gpu-blocklist', '--mute-audio', '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ...(flag('no-cpu2d-flag') ? [] : ['--disable-accelerated-2d-canvas']),
  ...(flag('gpu') ? (process.platform === 'win32' ? ['--use-angle=d3d11'] : []) : ['--use-angle=swiftshader']),
];

const server = Bun.serve({
  hostname: '127.0.0.1', port: 0,
  async fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/favicon.ico') return new Response(null, { status: 204 });
    const f = Bun.file(path.join(DIST, p === '/' ? 'index.html' : p));
    return (await f.exists()) ? new Response(f) : new Response('not found', { status: 404 });
  },
});
const URL_ = `http://127.0.0.1:${server.port}/?export=1`;

interface W { browser: Browser; page: Page }
async function launch(): Promise<W> {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }, args: ARGS });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e instanceof Error ? e.message : String(e)));
  page.on('console', (m) => m.type() === 'error' && console.error('console.error:', m.text()));
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__frame === 'function' && window.__ready(), { timeout: 60_000 });
  return { browser, page };
}
const hashFrame = (w: W, f: number): Promise<string> =>
  w.page.evaluate(async (t, fps) => {
    window.__frame(t, fps);
    const c = document.getElementById('c') as HTMLCanvasElement;
    const px = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', px));
    return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
  }, f / FPS, FPS);

const PLATFORM = `${process.platform} ${process.arch}`;
const base = flag('update') ? null : existsSync(BASELINE) ? await Bun.file(BASELINE).json() : null;
if (!flag('update') && !base) { console.error(`no baseline at ${BASELINE} (run with --update)`); process.exit(2); }
if (base && base.platform !== PLATFORM) {
  console.error(`baseline recorded on ${base.platform ?? 'an unknown platform'}; not comparable on ${PLATFORM}. Record a local baseline with --update (do not commit it).`);
  process.exit(2);
}

const t0 = performance.now();
const ws = await Promise.all(Array.from({ length: WORKERS }, launch));
const scenes: { name: string; start: number; end: number }[] = await ws[0].page.evaluate(() => window.__scenes());
const duration: number = await ws[0].page.evaluate(() => window.__duration);
const gpu: string = await ws[0].page.evaluate(() => window.__gpu());
const chrome = await ws[0].browser.version();

const last = Math.floor(duration * FPS) - 1;
const set = new Set<number>([0, last]);
for (const s of scenes) {
  const f0 = Math.ceil(s.start * FPS - 1e-9);
  for (const f of [f0 - 1, f0, f0 + 1]) if (f >= 0 && f <= last) set.add(f);
}
for (let f = 0; f <= last; f += FPS) set.add(f);
const current = new Set(set);
if (base) for (const k of Object.keys(base.hashes)) set.add(+k);
const frames = [...set].sort((a, b) => a - b);

const hashes: Record<number, string> = {};
let next = 0;
await Promise.all(ws.map(async (w) => { while (next < frames.length) { const f = frames[next++]; hashes[f] = await hashFrame(w, f); } }));
await Promise.all(ws.map((w) => w.browser.close()));
server.stop(true);
const seconds = +((performance.now() - t0) / 1000).toFixed(1);
const meta = { film: FILM, platform: PLATFORM, chrome, gpu, args: ARGS, fps: FPS, duration, frames: frames.length };

if (flag('update')) {
  mkdirSync(path.dirname(BASELINE), { recursive: true });
  const commit = (await Bun.$`git -C ${path.dirname(DIST)} rev-parse HEAD`.nothrow().text()).trim();
  writeFileSync(BASELINE, JSON.stringify({ ...meta, commit, hashes }, null, 1));
  console.log(`baseline written: ${frames.length} frames, ${seconds}s -> ${BASELINE}`);
  process.exit(0);
}
const warnings: string[] = [];
if (base.chrome !== chrome) warnings.push(`Chrome differs from baseline: ${base.chrome} vs ${chrome}`);
if (base.duration !== duration) warnings.push(`duration differs: ${base.duration} vs ${duration}`);
const mismatched = frames.filter((f) => base.hashes[f] !== undefined && base.hashes[f] !== hashes[f]);
const missing = Object.keys(base.hashes).map(Number).filter((f) => hashes[f] === undefined || f > last);
// frames in today's set but not in the baseline (e.g. a moved scene boundary): reported, not failed
const extra = frames.filter((f) => base.hashes[f] === undefined && current.has(f));
if (extra.length) warnings.push(`${extra.length} frame(s) not in the baseline (scene boundaries moved?): ${extra.slice(0, 12).join(' ')}`);
const pass = mismatched.length === 0 && missing.length === 0;
const report = { ...meta, baselineCommit: base.commit, pass, seconds, mismatched, missing, extra, warnings };
mkdirSync(path.dirname(REPORT), { recursive: true });
writeFileSync(REPORT, JSON.stringify(report, null, 1));
for (const w of warnings) console.warn('warning:', w);
console.log(`${pass ? 'PASS' : 'FAIL'} regress ${FILM}: ${frames.length} frames, ${mismatched.length} mismatched, ${missing.length} missing, ${extra.length} new, ${seconds}s -> ${REPORT}`);
if (!pass && mismatched.length) console.log('first mismatches (frame/seconds):', mismatched.slice(0, 12).map((f) => `${f}/${(f / FPS).toFixed(2)}`).join(' '));
process.exit(pass ? 0 : 1);
