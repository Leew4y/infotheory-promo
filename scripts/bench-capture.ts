/**
 * Throughput and memory of capture scenes against the 0b budgets:
 *
 *   bun scripts/bench-capture.ts [--seconds 60] [--workers 4]        (just bench-capture)
 *
 * Exports (no audio) a throwaway film whose single demo scene shows a numbered 1080p30 capture of --seconds (window on
 * the page, a camera move), and, as the baseline, the reference film's page scene "surprise" (24–42 s), each with the
 * same number of workers. While each runs, the process tree of the export is sampled once a second (Windows: working
 * set; elsewhere RSS from ps): each worker is one browser, a child of the export process, and its memory is the sum
 * over the browser's process tree. The peak per worker is the largest such sum seen.
 * Budgets (spikes/RESULTS.md 0b): capture throughput >= 50 % of the baseline's; peak memory <= 2 GiB per worker.
 * Writes out/bench-capture.json. Exit code 1 if a budget is missed. Needs ffmpeg, uv (fonts). Every fixture path is
 * created exclusively before anything is written (an existing one aborts the run).
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mediaDir } from './film-arg';
import { makeNumberedVideo } from './lib/barcode';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const opt = (k: string, d: number) => (argv.includes(`--${k}`) ? +argv[argv.indexOf(`--${k}`) + 1] : d);
const SECONDS = opt('seconds', 60), WORKERS = opt('workers', 4);
const ID = `bench-fixture-${process.pid}`;
const FILM = path.join(ROOT, 'films', ID), WORK = path.join(ROOT, 'out', ID);
const owned: string[] = [];
const sh = (cmd: string[], env: Record<string, string> = {}) => {
  const p = Bun.spawnSync(cmd, { cwd: ROOT, env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'pipe' });
  if (p.exitCode !== 0) throw new Error(`${cmd.slice(0, 3).join(' ')} failed: ${(p.stderr.toString() || p.stdout.toString()).trim().split('\n').slice(-3).join(' ')}`);
  return p.stdout.toString();
};

/**
 * Every process: pid, parent pid, start time (a number that orders starts), memory in bytes (Windows: working set;
 * elsewhere RSS), executable name.
 */
async function processes(): Promise<{ pid: number; ppid: number; start: number; mem: number; name: string }[]> {
  const win = process.platform === 'win32';
  const cmd = win
    ? ['powershell', '-NoProfile', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $(if ($_.CreationDate) { $_.CreationDate.ToFileTimeUtc() } else { 0 }) $($_.WorkingSetSize) $($_.Name)" }']
    : ['ps', '-axo', 'pid=,ppid=,etimes=,rss=,comm='];
  const p = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'ignore' });
  return (await new Response(p.stdout).text()).split('\n').map((l) => l.trim().split(/\s+/))
    .filter((v) => v.length >= 5 && v.slice(0, 4).every((x) => Number.isFinite(+x)))
    .map(([pid, ppid, st, m, ...name]) => ({
      pid: +pid, ppid: +ppid, start: win ? +st : -+st, mem: +m * (win ? 1 : 1024), name: path.basename(name.join(' ')).toLowerCase(),
    }));
}

/**
 * The memory of each worker's browser under `root` (the export; its own launcher may sit in between): a browser is
 * a Chrome process in root's tree whose parent is not one, and its memory is the sum over its process tree. A parent
 * id counts only if that process started no later than the child (ids are reused), and no process is visited twice.
 */
async function workerMemory(root: number): Promise<number[]> {
  const ps = await processes();
  const by = new Map(ps.map((p) => [p.pid, p]));
  const kids = new Map<number, number[]>();
  for (const p of ps) {
    const parent = by.get(p.ppid);
    if (p.pid !== p.ppid && parent && parent.start <= p.start) kids.set(p.ppid, [...(kids.get(p.ppid) ?? []), p.pid]);
  }
  const isChrome = (pid: number) => /^(chrome|msedge|chromium|google chrome)/.test(by.get(pid)?.name ?? '');
  const seen = new Set<number>();
  const tree = (pid: number): number => {
    if (seen.has(pid)) return 0;
    seen.add(pid);
    return (by.get(pid)?.mem ?? 0) + (kids.get(pid) ?? []).reduce((s, c) => s + tree(c), 0);
  };
  const roots: number[] = [];
  const walk = (pid: number) => {
    if (seen.has(pid)) return;
    seen.add(pid);
    for (const c of kids.get(pid) ?? []) (isChrome(c) && !isChrome(pid) ? roots.push(c) : walk(c));
  };
  walk(root);
  return roots.map(tree);
}

interface Measured { seconds: number; fps: number; peakPerWorker: number; workersSeen: number }
/** Run an export, sampling its workers' memory every second; returns wall seconds, frames per second and peak bytes. */
async function measure(args: string[], frames: number): Promise<Measured> {
  let peak = 0, seen = 0, done = false;
  const t0 = performance.now();
  const p = Bun.spawn(['bun', 'scripts/export.ts', ...args, '--noaudio', '--workers', String(WORKERS)], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  const sampler = (async () => {
    while (!done) {
      const w = await workerMemory(p.pid);
      seen = Math.max(seen, w.length);
      peak = Math.max(peak, ...w, 0);
      await Bun.sleep(1000);
    }
  })().catch((e) => { p.kill(); throw e; }); // a failed sample stops this export
  sampler.catch(() => {});
  const [code, err] = await Promise.all([p.exited, new Response(p.stderr).text()]);
  done = true;
  await sampler;
  if (code !== 0) throw new Error(`export ${args.join(' ')} failed: ${err.trim().split('\n').slice(-3).join(' ')}`);
  const seconds = (performance.now() - t0) / 1000;
  return { seconds, fps: frames / seconds, peakPerWorker: peak, workersSeen: seen };
}

let code = 0;
try {
  if (existsSync(FILM)) throw new Error(`films/${ID} exists already`);
  for (const p of [path.join(ROOT, 'dist', ID), WORK, mediaDir(ID)]) {
    mkdirSync(path.dirname(p), { recursive: true });
    try { mkdirSync(p); } catch { throw new Error(`${p} exists already; not touching it`); }
    owned.push(p);
  }
  sh(['bun', 'scripts/new-film.ts', ID, '--style', 'nebula']);
  owned.push(FILM);
  const video = path.join(WORK, 'numbered.mp4');
  await makeNumberedVideo(video, SECONDS, 30);
  sh(['bun', 'scripts/import-capture.ts', '--film', ID, '--id', 'num', video]);
  writeFileSync(path.join(FILM, 'scenes', 'index.ts'), "import './cap';\n");
  writeFileSync(path.join(FILM, 'scenes', 'cap.ts'), `import { demoScene } from '../../../engine';
import num from '../captures/num.json';
demoScene({ name: 'cap', asset: num as never, title: 'benchmark', camera: [{ t: 0, zoom: 1 }, { t: ${SECONDS / 2}, x: 1400, y: 300, zoom: 2.2 }, { t: ${SECONDS}, zoom: 1 }] });
`);
  for (const f of ['title.ts', 'idea.ts', 'end.ts']) rmSync(path.join(FILM, 'scenes', f), { force: true });
  sh(['bun', 'scripts/fonts.ts', '--film', ID]);
  sh(['bunx', 'vite', 'build'], { FILM: ID });
  if (!existsSync(path.join(ROOT, 'dist', 'infotheory', 'index.html'))) sh(['bunx', 'vite', 'build'], { FILM: 'infotheory' });

  const capture = await measure(['--film', ID, '--out', path.join(WORK, 'capture.mp4')], SECONDS * 30);
  const baseline = await measure(['--film', 'infotheory', '--from', '24', '--to', '42', '--out', path.join(WORK, 'baseline.mp4')], 18 * 30);
  const ratio = capture.fps / baseline.fps, mem = Math.max(capture.peakPerWorker, baseline.peakPerWorker);
  for (const m of [capture, baseline]) if (m.workersSeen !== WORKERS) throw new Error(`saw ${m.workersSeen} worker browser(s) under an export, expected ${WORKERS}: memory not measured`);
  const round = (m: Measured) => ({ ...m, seconds: +m.seconds.toFixed(1), fps: +m.fps.toFixed(2) });
  const result = {
    workers: WORKERS, seconds: SECONDS, platform: `${process.platform} ${process.arch}`,
    capture: round(capture), baseline: round(baseline), throughputRatio: +ratio.toFixed(3),
    budgets: { throughputRatio: '>= 0.5', peakPerWorker: '<= 2 GiB (the largest worker process tree)' },
    pass: ratio >= 0.5 && capture.peakPerWorker <= 2 * 1024 ** 3,
  };
  writeFileSync(path.join(ROOT, 'out', 'bench-capture.json'), JSON.stringify(result, null, 1));
  const mib = (b: number) => `${(b / 1024 ** 2).toFixed(0)} MiB`;
  console.log(`capture ${SECONDS}s:   ${capture.seconds.toFixed(1)}s, ${capture.fps.toFixed(2)} fps, peak ${mib(capture.peakPerWorker)} / worker`);
  console.log(`baseline (surprise): ${baseline.seconds.toFixed(1)}s, ${baseline.fps.toFixed(2)} fps, peak ${mib(baseline.peakPerWorker)} / worker`);
  console.log(`${result.pass ? 'PASS' : 'FAIL'} bench-capture: throughput ${(ratio * 100).toFixed(0)} % of baseline (>= 50 %), peak ${mib(mem)} / worker (<= 2048 MiB)`);
  code = result.pass ? 0 : 1;
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  code = 1;
} finally {
  for (const p of owned) rmSync(p, { recursive: true, force: true });
}
process.exit(code);
