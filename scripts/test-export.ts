/**
 * Failure-mode tests for scripts/export.ts (the output contract in its header).
 *
 *   bun run build && just music && bun scripts/test-export.ts
 *
 * Each case runs an export into out/test-export/ against an existing target file holding a sentinel. Every job has
 * its own hard watchdog (kills the whole process tree), and each case checks: the exit code, that it ended within
 * its bound, that no Chrome / ffmpeg / stand-in process started by it is still running, that the old target is
 * untouched (failures) or replaced by a video whose frame count and audio length ffprobe confirms (successes), and
 * that no temporary or lock file is left. Stand-ins in scripts/test-fixtures replace ffmpeg / ffprobe to stall the
 * encoder or the final probe, or to report unusable probe results.
 * A real SIGINT is sent only on macOS / Linux: on Windows a child cannot be sent SIGINT (Bun's kill() terminates it
 * outright), so there the interrupt is exercised through --abort-after, which takes the same cancel path.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';
import { killTree } from './chrome';

const ROOT = path.resolve(import.meta.dir, '..');
const DIR = path.join(ROOT, 'out', 'test-export');
const TARGET = path.join(DIR, 'target.mp4');
const FIX = path.join(ROOT, 'scripts', 'test-fixtures');
const SENTINEL = 'SENTINEL: the previous export';
const stub = (f: string) => JSON.stringify(['bun', path.join(FIX, f)]);
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
if (!existsSync(path.join(ROOT, 'audio', 'music.wav'))) { console.error('audio/music.wav missing: run `just music` first'); process.exit(2); }

/** Command lines of running processes that belong to these tests. */
async function ours(): Promise<string[]> {
  let lines: string[];
  if (process.platform === 'win32') {
    const p = Bun.spawn(['powershell', '-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' or Name='ffmpeg.exe' or Name='ffprobe.exe' or Name='msedge.exe' or Name='bun.exe'\" | ForEach-Object { $_.CommandLine }"], { stdout: 'pipe', stderr: 'ignore' });
    lines = (await new Response(p.stdout).text()).split(/\r?\n/);
  } else {
    const p = Bun.spawn(['ps', '-axo', 'command'], { stdout: 'pipe' });
    lines = (await new Response(p.stdout).text()).split('\n');
  }
  return lines.filter((l) => /puppeteer_dev_chrome_profile|test-export[\\/]|test-fixtures/.test(l) && !/test-export\.ts/.test(l));
}
async function probeTarget(): Promise<{ frames: number; audio: number } | null> {
  const p = Bun.spawn(['ffprobe', '-v', 'error', '-count_packets', '-show_entries', 'stream=codec_type,nb_read_packets,duration', '-of', 'json', TARGET], { stdout: 'pipe', stderr: 'ignore' });
  const [out, code] = [await new Response(p.stdout).text(), await p.exited];
  if (code !== 0) return null;
  const s = JSON.parse(out).streams as { codec_type: string; nb_read_packets: string; duration: string }[];
  const v = s.find((x) => x.codec_type === 'video'), a = s.find((x) => x.codec_type === 'audio');
  return v && a ? { frames: +v.nb_read_packets, audio: +a.duration } : null;
}

interface Case {
  name: string; args: string[]; env?: Record<string, string>; expect: number | 'nonzero'; within: number;
  success?: { frames: number; audio: number }; prepare?: () => Promise<void> | void; signal?: { after: number; sig: NodeJS.Signals };
  keepLock?: boolean;
  /** Windows: hold the old target open in another process with this share mode while the job runs (a video player). */
  hold?: 'Read' | 'ReadWrite';
  /** The job must keep its verified video as target.verified-<pid>.mp4 with this many frames. */
  kept?: number;
}
type Job = ReturnType<typeof Bun.spawn>;
const start = (c: Case): Job => Bun.spawn(['bun', path.join(ROOT, 'scripts', 'export.ts'), '--out', TARGET, ...c.args], { env: { ...process.env, ...(c.env ?? {}) }, stdout: 'pipe', stderr: 'pipe' });
async function finish(c: Case, job: Job, t0: number): Promise<{ ok: boolean; notes: string[] }> {
  let killed = false;
  const watchdog = setTimeout(async () => { killed = true; await killTree(job.pid); }, (c.within + 30) * 1000);
  if (c.signal) setTimeout(() => { try { process.kill(job.pid, c.signal!.sig); } catch {} }, c.signal.after * 1000);
  const [out, err, code] = await Promise.all([new Response(job.stdout as ReadableStream).text(), new Response(job.stderr as ReadableStream).text(), job.exited]);
  clearTimeout(watchdog);
  const secs = (performance.now() - t0) / 1000;
  await Bun.sleep(1500); // let the OS reap killed children
  const notes: string[] = [];
  if (killed) notes.push('watchdog had to kill the job');
  if (c.expect === 'nonzero' ? code === 0 : code !== c.expect) notes.push(`exit ${code}, expected ${c.expect}`);
  if (secs > c.within) notes.push(`took ${secs.toFixed(1)}s, bound ${c.within}s`);
  const left = await ours();
  if (left.length) notes.push(`${left.length} process(es) left running: ${left[0].slice(0, 100)}`);
  const stray = readdirSync(DIR).filter((f) => /partial|\.lock/.test(f) && !(c.keepLock && f.endsWith('.lock')));
  if (stray.length) notes.push(`left behind: ${stray.join(', ')}`);
  const content = existsSync(TARGET) ? readFileSync(TARGET) : null;
  if (c.success) {
    const p = content && !content.subarray(0, 64).toString().includes('SENTINEL') ? await probeTarget() : null;
    if (!p) notes.push('target was not replaced by a valid video');
    else {
      if (p.frames !== c.success.frames) notes.push(`target has ${p.frames} frames, expected ${c.success.frames}`);
      if (Math.abs(p.audio - c.success.audio) > 0.03) notes.push(`target audio ${p.audio.toFixed(3)}s, expected ~${c.success.audio.toFixed(3)}s`);
    }
  } else if (!content || content.toString() !== SENTINEL) notes.push('old target was not preserved');
  const keptFiles = readdirSync(DIR).filter((f) => /^target\.verified-\d+\.mp4$/.test(f));
  if (c.kept !== undefined) {
    if (keptFiles.length !== 1) notes.push(`expected one kept target.verified-<pid>.mp4, found ${keptFiles.length}`);
    else {
      const p = Bun.spawn(['ffprobe', '-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', path.join(DIR, keptFiles[0])], { stdout: 'pipe', stderr: 'ignore' });
      const frames = +(await new Response(p.stdout).text()).trim();
      if (frames !== c.kept) notes.push(`kept video has ${frames} frames, expected ${c.kept}`);
    }
  } else if (keptFiles.length) notes.push(`unexpected kept video: ${keptFiles.join(', ')}`);
  for (const f of keptFiles) rmSync(path.join(DIR, f), { force: true });
  const last = (out + err).trim().split('\n').filter(Boolean).slice(-1)[0] ?? '';
  return { ok: notes.length === 0, notes: [`exit ${code}, ${secs.toFixed(1)}s: ${last.slice(0, 140)}`, ...notes] };
}

const shortWav = path.join(DIR, 'short.wav');
const deadPid = 999_999;
const cases: Case[] = [
  { name: 'success (2 s, with audio)', args: ['--from', '30', '--to', '32', '--workers', '2'], expect: 0, within: 120, success: { frames: 60, audio: 2 } },
  { name: 'tiny range snaps to frames (0..0.05 s -> 2 frames)', args: ['--from', '0', '--to', '0.05', '--workers', '1'], expect: 0, within: 90, success: { frames: 2, audio: 2 / 30 } },
  { name: 'negative --from is rejected', args: ['--from', '-1', '--to', '1', '--noaudio'], expect: 2, within: 60 },
  { name: 'missing audio without --noaudio', args: ['--from', '30', '--to', '31', '--audio', path.join(DIR, 'nope.wav')], expect: 2, within: 30 },
  { name: 'audio shorter than the range', args: ['--from', '0', '--to', '1', '--audio', shortWav], expect: 1, within: 60,
    prepare: async () => { await Bun.spawn(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=d=0.5', shortWav]).exited; } },
  { name: 'worker launch failure', args: ['--from', '30', '--to', '31'], env: { CHROME_PATH: Bun.which('ffmpeg') ?? 'ffmpeg' }, expect: 'nonzero', within: 90 },
  { name: 'encoder failure', args: ['--from', '30', '--to', '33', '--crf', 'not-a-number'], expect: 1, within: 90 },
  { name: 'interrupt (cancel path via --abort-after)', args: ['--from', '30', '--to', '40', '--abort-after', '10'], expect: 130, within: 90 },
  { name: 'interrupt at the last frame cannot publish', args: ['--from', '30', '--to', '31', '--abort-after', '30'], expect: 130, within: 90 },
  { name: 'deadline exceeded while rendering', args: ['--from', '30', '--to', '60', '--deadline', '6'], expect: 1, within: 60 },
  { name: 'deadline exceeded with the encoder stalled (blocked write)', args: ['--from', '30', '--to', '33', '--deadline', '12'], env: { EXPORT_FFMPEG: stub('stall.ts') }, expect: 1, within: 60 },
  { name: 'deadline exceeded with the final probe stalled', args: ['--from', '30', '--to', '31', '--deadline', '25'], env: { EXPORT_FFPROBE: stub('probe-stall-streams.ts') }, expect: 1, within: 70 },
  { name: 'probe reports unknown durations (N/A)', args: ['--from', '30', '--to', '31'], env: { EXPORT_FFPROBE: stub('probe-na.ts') }, expect: 1, within: 90 },
  { name: 'probe exits non-zero with plausible JSON', args: ['--from', '30', '--to', '31'], env: { EXPORT_FFPROBE: stub('probe-fail.ts') }, expect: 1, within: 90 },
  { name: 'stale lock of a dead process is taken over', args: ['--from', '30', '--to', '31', '--workers', '1'], expect: 0, within: 90, success: { frames: 30, audio: 1 },
    prepare: () => writeFileSync(`${TARGET}.lock`, `${deadPid}\n${hostname()}\n2026-01-01T00:00:00Z\n`) },
  { name: 'lock of a live process blocks at once', args: ['--from', '30', '--to', '31'], expect: 1, within: 15, keepLock: true,
    prepare: () => writeFileSync(`${TARGET}.lock`, `${process.pid}\n${hostname()}\n2026-01-01T00:00:00Z\n`) },
];
if (process.platform === 'win32')
  cases.push(
    { name: 'target open in a player (no write sharing) fails before rendering', args: ['--from', '30', '--to', '31'], expect: 1, within: 20, hold: 'Read' },
    { name: 'target held without delete sharing: rename retried, verified video kept', args: ['--from', '30', '--to', '31', '--workers', '1'], expect: 1, within: 120, hold: 'ReadWrite', kept: 30 },
  );
if (process.platform !== 'win32')
  cases.push({ name: 'real SIGINT during rendering', args: ['--from', '30', '--to', '50'], expect: 130, within: 60, signal: { after: 12, sig: 'SIGINT' } });

const results: { name: string; ok: boolean; notes: string[] }[] = [];
for (const c of cases) {
  writeFileSync(TARGET, SENTINEL);
  rmSync(`${TARGET}.lock`, { force: true });
  await c.prepare?.();
  let holder: Job | null = null;
  if (c.hold) {
    const ps = `$f = [IO.File]::Open('${TARGET.replace(/'/g, "''")}', 'Open', 'Read', '${c.hold}'); [Console]::Out.WriteLine('ready'); [Console]::Out.Flush(); Start-Sleep -Seconds 600; $f.Close()`;
    holder = Bun.spawn(['powershell', '-NoProfile', '-Command', ps], { stdout: 'pipe', stderr: 'ignore' });
    const reader = (holder.stdout as ReadableStream<Uint8Array>).getReader();
    const first = await Promise.race([reader.read(), Bun.sleep(20_000).then(() => null)]);
    reader.releaseLock();
    if (!first || first.done || !new TextDecoder().decode(first.value).includes('ready')) console.log('       (holder did not start)');
  }
  const t0 = performance.now();
  const r = await finish(c, start(c), t0);
  if (holder) await killTree(holder.pid);
  rmSync(`${TARGET}.lock`, { force: true });
  results.push({ name: c.name, ...r });
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${c.name}\n       ${r.notes.join('\n       ')}`);
}

// concurrency: a second export to the same target fails at once; the first one completes
{
  writeFileSync(TARGET, SENTINEL);
  const c1: Case = { name: 'first', args: ['--from', '30', '--to', '34', '--workers', '2'], expect: 0, within: 150, success: { frames: 120, audio: 4 } };
  const c2: Case = { name: 'concurrent export to the same --out', args: ['--from', '30', '--to', '31'], expect: 1, within: 10, keepLock: true };
  const t0 = performance.now();
  const first = start(c1);
  while (!existsSync(`${TARGET}.lock`) && performance.now() - t0 < 30_000) await Bun.sleep(50);
  const t1 = performance.now();
  const second = start(c2);
  const code2 = await Promise.race([second.exited, Bun.sleep(40_000).then(async () => { await killTree(second.pid); return -1; })]);
  const secs2 = (performance.now() - t1) / 1000;
  const out2 = (await new Response(second.stderr as ReadableStream).text()).trim().split('\n').slice(-1)[0];
  const notes = [`second: exit ${code2}, ${secs2.toFixed(1)}s: ${out2}`];
  if (code2 !== 1) notes.push(`second export exit ${code2}, expected 1`);
  if (secs2 > c2.within) notes.push(`second export took ${secs2.toFixed(1)}s, bound ${c2.within}s`);
  const r1 = await finish(c1, first, t0);
  notes.push(`first: ${r1.notes.join('; ')}`);
  const ok = code2 === 1 && secs2 <= c2.within && r1.ok;
  results.push({ name: c2.name, ok, notes });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${c2.name}\n       ${notes.join('\n       ')}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`${failed ? 'FAIL' : 'PASS'} test-export: ${results.length - failed}/${results.length} cases${process.platform === 'win32' ? ' (real SIGINT not tested on Windows)' : ''}`);
process.exit(failed ? 1 : 0);
