/**
 * Failure-mode tests for scripts/export.ts (the output contract in its header).
 *
 *   bun run build && bun scripts/test-export.ts
 *
 * Each case runs a short export into out/test-export/ against an existing target file holding a sentinel, and checks:
 * the exit code, that it ended within a time bound, that no Chrome / ffmpeg started by it is still running, that the
 * old target is untouched (failures) or replaced by a valid video (success), and that no temporary or lock file is left.
 * Ctrl+C is exercised through export.ts's --abort-after hook, which takes the same path as the SIGINT handler; real
 * signal delivery is not tested here (on Windows a child cannot be sent SIGINT).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const DIR = path.join(ROOT, 'out', 'test-export');
const TARGET = path.join(DIR, 'target.mp4');
const SENTINEL = 'SENTINEL: the previous export';
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

/** Command lines of running chrome / ffmpeg processes that belong to these tests. */
async function ours(): Promise<string[]> {
  let lines: string[];
  if (process.platform === 'win32') {
    const p = Bun.spawn(['powershell', '-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' or Name='ffmpeg.exe' or Name='msedge.exe'\" | ForEach-Object { $_.CommandLine }"], { stdout: 'pipe', stderr: 'ignore' });
    lines = (await new Response(p.stdout).text()).split(/\r?\n/);
  } else {
    const p = Bun.spawn(['ps', '-axo', 'command'], { stdout: 'pipe' });
    lines = (await new Response(p.stdout).text()).split('\n').filter((l) => /chrome|chromium|ffmpeg|Edge/i.test(l));
  }
  return lines.filter((l) => /puppeteer_dev_chrome_profile|test-export/.test(l));
}

interface Case { name: string; args: string[]; env?: Record<string, string>; expect: number | 'nonzero'; within: number; success?: boolean; prepare?: () => Promise<void> | void }
const shortWav = path.join(DIR, 'short.wav');
const cases: Case[] = [
  { name: 'success (2 s, with audio)', args: ['--from', '30', '--to', '32', '--workers', '2'], expect: 0, within: 120, success: true },
  { name: 'missing audio without --noaudio', args: ['--from', '30', '--to', '31', '--audio', path.join(DIR, 'nope.wav')], expect: 2, within: 60 },
  { name: 'audio shorter than the video', args: ['--from', '0', '--to', '1', '--audio', shortWav], expect: 1, within: 60,
    prepare: async () => { await Bun.spawn(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=d=0.5', shortWav]).exited; } },
  { name: 'worker launch failure', args: ['--from', '30', '--to', '31'], env: { CHROME_PATH: Bun.which('ffmpeg') ?? 'ffmpeg' }, expect: 'nonzero', within: 90 },
  { name: 'encoder failure', args: ['--from', '30', '--to', '33', '--crf', 'not-a-number'], expect: 1, within: 90 },
  { name: 'interrupt (Ctrl+C path)', args: ['--from', '30', '--to', '40', '--abort-after', '10'], expect: 130, within: 90 },
  { name: 'deadline exceeded', args: ['--from', '30', '--to', '60', '--deadline', '4'], expect: 1, within: 90 },
];

const results: { name: string; ok: boolean; notes: string[] }[] = [];
const run = (c: Case) => Bun.spawn(['bun', path.join(ROOT, 'scripts', 'export.ts'), '--out', TARGET, ...c.args], { env: { ...process.env, ...(c.env ?? {}) }, stdout: 'pipe', stderr: 'pipe' });
async function check(c: Case, proc: ReturnType<typeof run>, t0: number): Promise<{ ok: boolean; notes: string[] }> {
  const timer = setTimeout(() => proc.kill(), c.within * 1000 + 30_000);
  const code = await proc.exited;
  clearTimeout(timer);
  const secs = (performance.now() - t0) / 1000;
  const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
  await Bun.sleep(1500); // let the OS reap killed children
  const notes: string[] = [];
  if (c.expect === 'nonzero' ? code === 0 : code !== c.expect) notes.push(`exit ${code}, expected ${c.expect}`);
  if (secs > c.within) notes.push(`took ${secs.toFixed(1)}s, bound ${c.within}s`);
  const left = await ours();
  if (left.length) notes.push(`${left.length} process(es) left running`);
  const stray = readdirSync(DIR).filter((f) => /partial|\.lock$/.test(f));
  if (stray.length) notes.push(`left behind: ${stray.join(', ')}`);
  const content = existsSync(TARGET) ? readFileSync(TARGET) : null;
  if (c.success) {
    if (!content || content.subarray(0, 64).toString().includes('SENTINEL')) notes.push('target was not replaced');
  } else if (!content || content.toString() !== SENTINEL) notes.push('old target was not preserved');
  const last = out.trim().split('\n').filter(Boolean).slice(-1)[0] ?? '';
  return { ok: notes.length === 0, notes: [`exit ${code}, ${secs.toFixed(1)}s: ${last.slice(0, 140)}`, ...notes] };
}

for (const c of cases) {
  writeFileSync(TARGET, SENTINEL);
  await c.prepare?.();
  const t0 = performance.now();
  const r = await check(c, run(c), t0);
  results.push({ name: c.name, ...r });
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${c.name}\n       ${r.notes.join('\n       ')}`);
}

// concurrency: a second export to the same target fails at once; the first one completes
{
  writeFileSync(TARGET, SENTINEL);
  const first = run({ name: 'first', args: ['--from', '30', '--to', '34', '--workers', '2'], expect: 0, within: 120 });
  const t0 = performance.now();
  while (!existsSync(`${TARGET}.lock`) && performance.now() - t0 < 60_000) await Bun.sleep(100);
  const c2: Case = { name: 'concurrent export to the same --out', args: ['--from', '30', '--to', '31'], expect: 1, within: 60 };
  const t1 = performance.now();
  const second = run(c2);
  const code2 = await second.exited;
  const out2 = (await new Response(second.stderr).text()).trim().split('\n').slice(-1)[0];
  const notes = [`second: exit ${code2}, ${((performance.now() - t1) / 1000).toFixed(1)}s: ${out2}`];
  if (code2 !== 1) notes.push(`second export exit ${code2}, expected 1`);
  const r1 = await check({ name: 'first', args: [], expect: 0, within: 180, success: true }, first, t0);
  notes.push(`first: ${r1.notes.join('; ')}`);
  const ok = code2 === 1 && r1.ok;
  results.push({ name: c2.name, ok, notes });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${c2.name}\n       ${notes.join('\n       ')}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`${failed ? 'FAIL' : 'PASS'} test-export: ${results.length - failed}/${results.length} cases`);
process.exit(failed ? 1 : 0);
