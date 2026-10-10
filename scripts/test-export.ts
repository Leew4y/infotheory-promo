/**
 * Failure-mode tests for scripts/export.ts (the output contract in its header).
 *
 *   just build <id> && just music <id> && bun scripts/test-export.ts --film <id>
 *
 * The film is only the test subject: any film with a score works (its ranges 30–60 s must exist).
 *
 * Each case runs an export into out/<id>/.test-export/ against an existing target file holding a sentinel. Every job has
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
import { requireFilm } from './film-arg';

const ROOT = path.resolve(import.meta.dir, '..');
const FILM = requireFilm(Bun.argv.slice(2));
// the run's own directory under the film's outputs (a dot name, so no film output can collide with it)
const DIR = path.join(ROOT, 'out', FILM, '.test-export');
const TARGET = path.join(DIR, 'target.mp4');
const FIX = path.join(ROOT, 'scripts', 'test-fixtures');
const SENTINEL = 'SENTINEL: the previous export';
const stub = (f: string) => JSON.stringify(['bun', path.join(FIX, f)]);
if (!existsSync(path.join(ROOT, 'out', FILM, 'music.wav'))) { console.error(`out/${FILM}/music.wav missing: run \`just music ${FILM}\` first`); process.exit(2); }
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

type Proc = { pid: number; ppid: number; start: number; cmd: string };
/** Every process: id, parent id, start (orders starts) and command line. */
async function processes(): Promise<Proc[]> {
  let rows: { pid: number; ppid: number; start: number; cmd: string }[];
  if (process.platform === 'win32') {
    const p = Bun.spawn(['powershell', '-NoProfile', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId)`t$($_.ParentProcessId)`t$(if ($_.CreationDate) { $_.CreationDate.ToFileTimeUtc() } else { 0 })`t$($_.CommandLine)" }'], { stdout: 'pipe', stderr: 'ignore' });
    rows = (await new Response(p.stdout).text()).split(/\r?\n/).map((l) => l.split('\t')).filter((v) => v.length >= 4).map(([a, b, c, ...d]) => ({ pid: +a, ppid: +b, start: +c, cmd: d.join('\t') }));
  } else {
    // lstart: the start time as a fixed-format date (stable, unlike etimes, which grows)
    const p = Bun.spawn(['ps', '-axo', 'pid=,ppid=,lstart=,command='], { stdout: 'pipe', env: { ...process.env, LC_ALL: 'C' } });
    rows = (await new Response(p.stdout).text()).split('\n').map((l) => l.trim().split(/\s+/)).filter((v) => v.length >= 8)
      .map(([a, b, ...r]) => ({ pid: +a, ppid: +b, start: Date.parse(r.slice(0, 5).join(' ')), cmd: r.slice(5).join(' ') }));
  }
  if (!rows.length || rows.some((r) => !Number.isFinite(r.start))) throw new Error('could not list processes (start times)');
  return rows;
}
/**
 * The processes the export job `root` started, directly or not (its launcher, Chrome, ffmpeg, ffprobe, stubs), followed
 * while it runs: every sample adds the descendants of what is already known, through parent ids (a parent counts only
 * if it started no later than the child: ids are reused). Another export on the machine is not counted, and a leaked
 * process is still recognised after its parents exited.
 */
function family(root: number) {
  const known = new Map<number, number>([[root, -Infinity]]); // pid -> start
  const add = (rows: Proc[]) => {
    for (let grew = true; grew;) {
      grew = false;
      for (const r of rows) if (!known.has(r.pid) && known.has(r.ppid) && known.get(r.ppid)! <= r.start) { known.set(r.pid, r.start); grew = true; }
    }
  };
  let on = true;
  const loop = (async () => { while (on) { add(await processes()); await Bun.sleep(500); } })();
  return {
    /** Command lines of the job's processes still running. */
    async left(): Promise<string[]> {
      on = false;
      await loop;
      const rows = await processes();
      add(rows);
      return rows.filter((r) => r.pid !== root && known.get(r.pid) === r.start).map((r) => r.cmd);
    },
  };
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
}
type Job = ReturnType<typeof Bun.spawn>;
const start = (c: Case): Job => Bun.spawn(['bun', path.join(ROOT, 'scripts', 'export.ts'), '--film', FILM, '--out', TARGET, ...c.args], { env: { ...process.env, ...(c.env ?? {}) }, stdout: 'pipe', stderr: 'pipe' });
async function finish(c: Case, job: Job, t0: number): Promise<{ ok: boolean; notes: string[] }> {
  const fam = family(job.pid!);
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
  const left = await fam.left();
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
if (process.platform !== 'win32')
  cases.push({ name: 'real SIGINT during rendering', args: ['--from', '30', '--to', '50'], expect: 130, within: 60, signal: { after: 12, sig: 'SIGINT' } });

const results: { name: string; ok: boolean; notes: string[] }[] = [];
for (const c of cases) {
  writeFileSync(TARGET, SENTINEL);
  rmSync(`${TARGET}.lock`, { force: true });
  await c.prepare?.();
  const t0 = performance.now();
  const r = await finish(c, start(c), t0);
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
