/**
 * Phase 0b runner. Needs `bun spikes/0b-media/make-source.ts out/0b-media` first.
 *
 *   bun spikes/0b-media/run.ts check  [--media out/0b-media] [--fmt jpg|png]
 *       correctness on the diagnostic page, 1 worker:
 *       1. no blur (1 sample): barcode == output frame, over sequential, random and reverse orders
 *       2. blur + moving camera: every recorded sub-frame draw used source == output frame
 *       3. blur + static camera: accumulated patch == mean of the sub-frame levels (+-1), barcode still == frame
 *   bun spikes/0b-media/run.ts export [--page diag|film] [--workers 4] [--from s] [--to s] [--fmt jpg|png] [--passes 2]
 *       full export through ffmpeg (H.264, as scripts/export.ts) with frames handed out in 1 s chunks;
 *       wall time from launching browsers to ffmpeg exit, peak working set per worker's Chrome process tree;
 *       for --page diag also decodes the output and checks the barcode sequence is 0..N-1.
 *       --page film exports the real film (needs `just build infotheory`) as the throughput baseline.
 * All runs use the CPU 2D canvas (--disable-accelerated-2d-canvas), per phase 0a. Prints and writes JSON.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { BAR, readBarcode } from './barcode';

const ROOT = path.resolve(import.meta.dir, '../..');
const argv = Bun.argv.slice(2);
const CMD = argv[0];
const opt = (k: string, d: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const MEDIA = path.resolve(ROOT, opt('media', 'out/0b-media'));
const FMT = opt('fmt', 'jpg');
const PAGE = opt('page', 'diag');
const WORKERS = +opt('workers', '4');
const PASSES = +opt('passes', '2');
const FPS = 30;
const SITE = path.join(MEDIA, 'site');
const NSRC = FMT === 'png' ? 900 : 2700;
const CHROME = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
if (!CHROME) throw new Error('Chrome not found (set CHROME_PATH)');
const ARGS = [
  '--window-size=1920,1080', '--ignore-gpu-blocklist', '--mute-audio', '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--disable-accelerated-2d-canvas',
  ...(process.env.ANGLE ? [`--use-angle=${process.env.ANGLE}`] : process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
];

// ---- build the diagnostic page and serve it (or the film's dist/)
if (PAGE === 'diag') {
  if (!existsSync(path.join(MEDIA, FMT, '00000.' + FMT))) throw new Error(`no source frames in ${MEDIA}/${FMT}: run make-source.ts`);
  mkdirSync(SITE, { recursive: true });
  const b = await Bun.build({ entrypoints: [path.join(import.meta.dir, 'page.ts')], outdir: SITE, target: 'browser', naming: 'page.js' });
  if (!b.success) throw new Error(b.logs.join('\n'));
  writeFileSync(path.join(SITE, 'index.html'), '<!doctype html><meta charset="utf-8"><body style="margin:0"><canvas id="c" width="1920" height="1080"></canvas><script type="module" src="/page.js"></script>');
}
const DIST = PAGE === 'film' ? path.join(ROOT, 'dist', 'infotheory') : SITE;
if (!existsSync(path.join(DIST, 'index.html'))) throw new Error(`${DIST}/index.html missing (film: run \`just build infotheory\`)`);
const server = Bun.serve({
  hostname: '127.0.0.1', port: 0,
  async fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/favicon.ico') return new Response(null, { status: 204 });
    const f = Bun.file(p.startsWith('/media/') ? path.join(MEDIA, p.slice(7)) : path.join(DIST, p === '/' ? 'index.html' : p));
    return (await f.exists()) ? new Response(f) : new Response('not found', { status: 404 });
  },
});
const url = (extra = '') => PAGE === 'film' ? `http://127.0.0.1:${server.port}/?export=1` : `http://127.0.0.1:${server.port}/?media=${FMT}&n=${NSRC}${extra}`;

interface W { browser: Browser; page: Page; profile: string }
async function launch(extra = ''): Promise<W> {
  const profile = mkdtempSync(path.join(os.tmpdir(), 'spike0b-'));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }, args: ARGS });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e instanceof Error ? e.message : String(e)));
  page.on('console', (m) => m.type() === 'error' && console.error('console.error:', m.text()));
  await page.goto(url(extra), { waitUntil: 'load' });
  if (PAGE === 'film') await page.waitForFunction(() => typeof window.__frame === 'function' && window.__ready(), { timeout: 60_000 });
  return { browser, page, profile };
}
async function close(w: W): Promise<void> {
  await w.browser.close().catch(() => {});
  try { rmSync(w.profile, { recursive: true, force: true }); } catch {}
}
const save = (name: string, data: unknown) => {
  // RESULT_DIR lets another machine keep its results apart (e.g. spikes/0d-macos)
  const dir = process.env.RESULT_DIR ? path.resolve(ROOT, process.env.RESULT_DIR) : import.meta.dir;
  mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name);
  writeFileSync(f, JSON.stringify(data, null, 1));
  return f;
};
const env = async (w: W) => ({ platform: `${process.platform} ${process.arch}`, chrome: await w.browser.version(), gpu: await w.page.evaluate(() => window.__gpu()), args: ARGS });

// ---- memory: peak working set of each browser's process tree
type Sample = Map<number, { ppid: number; ws: number }>;
async function processTable(): Promise<Sample> {
  const m: Sample = new Map();
  if (process.platform === 'win32') {
    // spawn with an argv array: Bun's shell would expand `$_` itself
    const ps = Bun.spawn(['powershell', '-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | ForEach-Object { '{0} {1} {2}' -f $_.ProcessId,$_.ParentProcessId,$_.WorkingSetSize }"], { stdout: 'pipe', stderr: 'ignore' });
    const out = await new Response(ps.stdout).text();
    for (const l of out.trim().split(/\r?\n/)) { const [p, pp, ws] = l.split(' ').map(Number); if (p) m.set(p, { ppid: pp, ws }); }
  } else {
    const out = await Bun.$`ps -axo pid=,ppid=,rss=`.quiet().text();
    for (const l of out.trim().split('\n')) { const [p, pp, rss] = l.trim().split(/\s+/).map(Number); m.set(p, { ppid: pp, ws: rss * 1024 }); }
  }
  return m;
}
function treeBytes(t: Sample, root: number): number {
  let sum = 0;
  const stack = [root];
  const kids = new Map<number, number[]>();
  for (const [p, v] of t) kids.set(v.ppid, [...(kids.get(v.ppid) ?? []), p]);
  while (stack.length) { const p = stack.pop()!; sum += t.get(p)?.ws ?? 0; stack.push(...(kids.get(p) ?? [])); }
  return sum;
}
function memoryWatch(ws: W[]): { stop: () => Promise<number[]> } {
  const peak = ws.map(() => 0);
  let on = true;
  const loop = (async () => {
    while (on) {
      try {
        const t = await processTable();
        ws.forEach((w, i) => { const pid = w.browser.process()?.pid; if (pid) peak[i] = Math.max(peak[i], treeBytes(t, pid)); });
      } catch (e) { console.error('memory sample failed:', e instanceof Error ? e.message : e); }
      await Bun.sleep(1000);
    }
  })();
  return { stop: async () => { on = false; await loop; return peak; } };
}

// ---- render one frame and return what the checks need
async function renderJpeg(w: W, f: number): Promise<Buffer> {
  const durl: string = PAGE === 'film'
    ? await w.page.evaluate((t) => window.__frame(t, 30), f / FPS)
    : await w.page.evaluate(async (f) => { await window.__prepare(f); window.__render(f, 3); return window.__jpeg(); }, f);
  return Buffer.from(durl.slice(durl.indexOf(',') + 1), 'base64');
}

if (CMD === 'check') {
  const fails: string[] = [];
  const N = NSRC;
  const rnd = (() => { let s = 11; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
  const seq = Array.from({ length: N }, (_, i) => i);
  const random = Array.from({ length: 300 }, () => Math.floor(rnd() * N));
  const reverse = Array.from({ length: 300 }, (_, i) => N - 1 - i * 3);
  const boundary = [0, 1, 1349, 1350, 1351, N - 2, N - 1].filter((f) => f < N);
  const probe = (w: W, f: number, samples: number) => w.page.evaluate(async (f, s) => { await window.__prepare(f); window.__render(f, s); return window.__probe(); }, f, samples);

  // 1. no blur
  let w = await launch();
  const e = await env(w);
  const t1 = performance.now();
  for (const [name, order] of [['sequential', seq], ['random', random], ['reverse', reverse], ['boundary', boundary]] as const)
    for (const f of order) {
      const r = await probe(w, f, 1);
      if (r.code !== f) fails.push(`1 ${name} frame ${f}: barcode ${r.code}`);
      if (r.draws.some((d) => !d.have)) fails.push(`1 ${name} frame ${f}: source not loaded at draw`);
    }
  const check1s = (performance.now() - t1) / 1000;
  await close(w);

  // 2. blur + moving camera: assert recorded sources only (the image is legitimately moved and blurred)
  w = await launch('&cam=1');
  const sub = [...boundary, ...Array.from({ length: Math.floor(N / 7) }, (_, i) => i * 7)];
  let draws2 = 0;
  for (const f of sub) {
    const r = await probe(w, f, 3);
    draws2 += r.draws.length;
    if (r.draws.length !== 3) fails.push(`2 frame ${f}: ${r.draws.length} sub-frame draws`);
    for (const d of r.draws) if (d.src !== Math.min(f, N - 1) || !d.have) fails.push(`2 frame ${f}: sub-frame at ${d.tk.toFixed(5)} drew source ${d.src} (have ${d.have})`);
  }
  await close(w);

  // 3. blur + static camera: accumulation and barcode
  w = await launch();
  let maxErr = 0;
  for (const f of sub) {
    const r = await probe(w, f, 3);
    const err = Math.abs(r.patch - r.expectedPatch);
    maxErr = Math.max(maxErr, err);
    if (err > 1) fails.push(`3 frame ${f}: patch ${r.patch.toFixed(2)} expected ${r.expectedPatch.toFixed(2)}`);
    if (r.code !== f) fails.push(`3 frame ${f}: barcode ${r.code}`);
  }
  await close(w);

  const result = { check: 'correctness', fmt: FMT, frames: N, env: e, check1: { renders: seq.length + random.length + reverse.length + boundary.length, seconds: +check1s.toFixed(1) },
    check2: { frames: sub.length, subFrameDraws: draws2 }, check3: { frames: sub.length, maxPatchError: +maxErr.toFixed(3) }, pass: fails.length === 0, fails: fails.slice(0, 50), failCount: fails.length };
  console.log(`${result.pass ? 'PASS' : 'FAIL'} check (${FMT}): ${fails.length} failures, max patch error ${maxErr.toFixed(3)} -> ${save(`check-${FMT}.json`, result)}`);
  if (!result.pass) console.log(fails.slice(0, 10).join('\n'));
} else if (CMD === 'export') {
  const FROM = +opt('from', '0');
  const TO = +opt('to', String(NSRC / FPS));
  const F0 = Math.round(FROM * FPS), N = Math.round((TO - FROM) * FPS);
  const CHUNK = 30;
  const passes: unknown[] = [];
  const tLaunch = performance.now();
  const ws = await Promise.all(Array.from({ length: WORKERS }, () => launch()));
  const launchS = (performance.now() - tLaunch) / 1000;
  const e = await env(ws[0]);
  for (let pass = 0; pass < PASSES; pass++) {
    const out = path.join(MEDIA, `export-${PAGE}-${FMT}-w${WORKERS}-p${pass}.mp4`);
    const ff = Bun.spawn(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', 'pipe:0',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', out], { stdin: 'pipe' });
    const mem = memoryWatch(ws);
    const t0 = performance.now();
    let firstFrameS = -1;
    const ready = new Map<number, Buffer>();
    let nextChunk = 0, nextWrite = 0, failed: Error | null = null;
    const work = async (w: W) => {
      while (!failed) {
        const c = nextChunk++;
        if (c * CHUNK >= N) return;
        while (c * CHUNK > nextWrite + WORKERS * CHUNK * 2 && !failed) await Bun.sleep(5);
        for (let i = c * CHUNK; i < Math.min(N, (c + 1) * CHUNK); i++) {
          try { ready.set(i, await renderJpeg(w, F0 + i)); if (firstFrameS < 0) firstFrameS = (performance.now() - t0) / 1000; }
          catch (err) { failed = err instanceof Error ? err : new Error(String(err)); return; }
        }
      }
    };
    const write = async () => {
      while (nextWrite < N) {
        if (failed) throw failed;
        const b = ready.get(nextWrite);
        if (!b) { await Bun.sleep(2); continue; }
        ready.delete(nextWrite);
        ff.stdin.write(b);
        await ff.stdin.flush();
        nextWrite++;
      }
    };
    try { await Promise.all([write(), ...ws.map(work)]); } finally { ff.stdin.end(); }
    const code = await ff.exited;
    const wallS = (performance.now() - t0) / 1000 + (pass === 0 ? launchS : 0);
    const peak = await mem.stop();
    if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
    // decode the barcode strip of every output frame
    let seqOk: boolean | null = null, decoded = 0, bad: number[] = [];
    if (PAGE === 'diag') {
      const dec = Bun.spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', out, '-vf', `crop=1920:${BAR.h}:0:${BAR.y}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { stdout: 'pipe' });
      const raw = new Uint8Array(await new Response(dec.stdout).arrayBuffer());
      const sz = 1920 * BAR.h * 4;
      decoded = raw.length / sz;
      for (let i = 0; i < decoded; i++) { const r = readBarcode(raw.subarray(i * sz, (i + 1) * sz), 1920, 0); if (r.code !== F0 + i) bad.push(i); }
      seqOk = decoded === N && bad.length === 0;
    }
    const p = { pass, cold: pass === 0, frames: N, wallSeconds: +wallS.toFixed(1), fps: +(N / wallS).toFixed(2), firstFrameSeconds: +firstFrameS.toFixed(2) + (pass === 0 ? +launchS.toFixed(2) : 0),
      peakWorkingSetMiB: peak.map((b) => Math.round(b / 2 ** 20)), decodedFrames: decoded, barcodeSequenceOk: seqOk, badFrames: bad.slice(0, 20) };
    passes.push(p);
    console.log(JSON.stringify(p));
  }
  await Promise.all(ws.map(close));
  const result = { check: 'export', page: PAGE, fmt: FMT, workers: WORKERS, from: FROM, to: TO, env: e, launchSeconds: +launchS.toFixed(2), passes };
  console.log(`-> ${save(`export-${PAGE}-${FMT}-w${WORKERS}.json`, result)}`);
} else {
  console.error('usage: run.ts check|export [options]');
  process.exitCode = 2;
}
server.stop(true);
process.exit(process.exitCode ?? 0);
