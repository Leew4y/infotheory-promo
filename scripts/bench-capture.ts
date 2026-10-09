/**
 * Throughput and memory of capture scenes against the 0b budgets:
 *
 *   bun scripts/bench-capture.ts [--seconds 60] [--workers 4]        (just bench-capture)
 *
 * Exports (no audio) a throwaway film whose single demo scene shows a numbered 1080p30 capture of --seconds (window on
 * the page, a camera move), and, as the baseline, the reference film's page scene "surprise" (24–42 s), each with the
 * same number of workers. While each runs, the working set of every Chrome process this run started is sampled once a
 * second; the peak per worker is the peak total divided by the workers (Windows; elsewhere RSS from ps).
 * Budgets (spikes/RESULTS.md 0b): capture throughput >= 50 % of the baseline's; peak memory <= 2 GiB per worker.
 * Writes out/bench-capture.json. Exit code 1 if a budget is missed. Needs ffmpeg, uv (fonts).
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

/** Total working set (bytes) of the Chrome processes started by puppeteer. */
async function chromeMemory(): Promise<number> {
  if (process.platform === 'win32') {
    const p = Bun.spawn(['powershell', '-NoProfile', '-Command', "(Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' or Name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*puppeteer_dev_chrome_profile*' } | Measure-Object -Property WorkingSetSize -Sum).Sum"], { stdout: 'pipe', stderr: 'ignore' });
    return +(await new Response(p.stdout).text()).trim() || 0;
  }
  const p = Bun.spawn(['ps', '-axo', 'rss=,command='], { stdout: 'pipe' });
  return (await new Response(p.stdout).text()).split('\n').filter((l) => l.includes('puppeteer_dev_chrome_profile')).reduce((s, l) => s + +l.trim().split(/\s+/)[0] * 1024, 0);
}

/** Run an export, sampling Chrome memory every second; returns wall seconds, frames per second and peak bytes. */
async function measure(args: string[], frames: number): Promise<{ seconds: number; fps: number; peakPerWorker: number }> {
  let peak = 0, done = false;
  const sampler = (async () => { while (!done) { peak = Math.max(peak, await chromeMemory()); await Bun.sleep(1000); } })();
  const t0 = performance.now();
  const p = Bun.spawn(['bun', 'scripts/export.ts', ...args, '--noaudio', '--workers', String(WORKERS)], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  const [code, err] = await Promise.all([p.exited, new Response(p.stderr).text()]);
  done = true;
  await sampler;
  if (code !== 0) throw new Error(`export ${args.join(' ')} failed: ${err.trim().split('\n').slice(-3).join(' ')}`);
  const seconds = (performance.now() - t0) / 1000;
  return { seconds: +seconds.toFixed(1), fps: +(frames / seconds).toFixed(1), peakPerWorker: Math.round(peak / WORKERS) };
}

let code = 0;
try {
  if (existsSync(FILM)) throw new Error(`films/${ID} exists already`);
  for (const p of [path.join(ROOT, 'dist', ID), WORK, mediaDir(ID)]) if (!existsSync(p)) owned.push(p);
  sh(['bun', 'scripts/new-film.ts', ID, '--style', 'nebula']);
  owned.push(FILM);
  mkdirSync(WORK, { recursive: true });
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
  const result = {
    workers: WORKERS, seconds: SECONDS, platform: `${process.platform} ${process.arch}`,
    capture, baseline, throughputRatio: +ratio.toFixed(2),
    budgets: { throughputRatio: '>= 0.5', peakPerWorker: '<= 2 GiB' },
    pass: ratio >= 0.5 && capture.peakPerWorker <= 2 * 1024 ** 3,
  };
  writeFileSync(path.join(ROOT, 'out', 'bench-capture.json'), JSON.stringify(result, null, 1));
  const mib = (b: number) => `${(b / 1024 ** 2).toFixed(0)} MiB`;
  console.log(`capture ${SECONDS}s:   ${capture.seconds}s, ${capture.fps} fps, peak ${mib(capture.peakPerWorker)} / worker`);
  console.log(`baseline (surprise): ${baseline.seconds}s, ${baseline.fps} fps, peak ${mib(baseline.peakPerWorker)} / worker`);
  console.log(`${result.pass ? 'PASS' : 'FAIL'} bench-capture: throughput ${(ratio * 100).toFixed(0)} % of baseline (>= 50 %), peak ${mib(mem)} / worker (<= 2048 MiB)`);
  code = result.pass ? 0 : 1;
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  code = 1;
} finally {
  for (const p of owned) rmSync(p, { recursive: true, force: true });
}
process.exit(code);
