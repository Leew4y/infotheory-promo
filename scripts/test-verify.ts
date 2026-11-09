/**
 * Cases for scripts/verify.ts on a real export:
 *
 *   bun scripts/test-verify.ts        (just test-verify)
 *
 * Builds a throwaway film from templates/film/ (films/verify-fixture-<pid>/, style nebula) with a test tone as its
 * audio, exports it, and verifies:
 *   1. the export as it is: no error, and the record, frames and sheets are there;
 *   2. damaged copies, each of which must report exactly its own code:
 *      - a small patch over one spot of the picture (verify-picture: a whole-frame average would miss it);
 *      - the last second cut off (verify-frames);
 *      - 6 dB louder (verify-loudness, verify-audio-stale);
 *      - another tone of the same loudness (verify-audio-stale);
 *      - no audio (verify-audio; passes with --noaudio);
 *      - a file cut in half (verify-decode);
 *   3. a wrong --res (verify-size), and a missing file (exit 2).
 * Only the directories this run created are removed afterwards (also on failure). Needs uv (fonts), ffmpeg, Chrome.
 * Exit code 0 when every case behaves as expected, 1 otherwise.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const ID = `verify-fixture-${process.pid}`;
const FILM = path.join(ROOT, 'films', ID), OUT = path.join(ROOT, 'out', ID);
const VIDEO = path.join(OUT, `${ID}.mp4`), TONE = path.join(OUT, 'tone.wav');
const owned: string[] = [];
const run = (cmd: string[]) => {
  const p = Bun.spawnSync(cmd, { cwd: ROOT, env: { ...process.env, FILM: ID }, stdout: 'pipe', stderr: 'pipe' });
  return { code: p.exitCode ?? 1, out: p.stdout.toString(), err: p.stderr.toString() };
};
const step = (what: string, r: { code: number; out: string; err: string }) => {
  if (r.code !== 0) throw new Error(`${what} failed (${r.code}): ${(r.err || r.out).trim().split('\n').slice(-3).join(' ')}`);
};
const ffmpeg = (...args: string[]) => step(`ffmpeg ${args.slice(-1)}`, run(['ffmpeg', '-v', 'error', '-y', ...args]));
/** A tone at the masters' loudness, for the export's --audio. */
const tone = (file: string, hz: number, seconds: number) =>
  ffmpeg('-f', 'lavfi', '-i', `sine=frequency=${hz}:sample_rate=44100:duration=${seconds}`, '-af', 'loudnorm=I=-16:TP=-2:LRA=7,aresample=44100', '-c:a', 'pcm_s16le', file);
interface Diag { level: string; code: string; path: string; message: string }
/** verify against `audio` (null: let it pick the final mix or the music, as the export does). */
const verifyWith = (audio: string | null, ...args: string[]): { code: number; diags: Diag[]; err: string } => {
  const r = run(['bun', 'scripts/verify.ts', '--film', ID, ...(audio === null ? [] : ['--audio', audio]), '--json', ...args]);
  let diags: Diag[] = [];
  try { diags = JSON.parse(r.out); } catch {}
  return { code: r.code, diags, err: r.err };
};
const verify = (...args: string[]) => verifyWith(path.relative(ROOT, TONE), ...args);

const failures: string[] = [];
/** `want` must be reported and nothing else, but for `also`: what the damage may bring with it. */
const expectCodes = (what: string, r: ReturnType<typeof verify>, want: string[], { exit = want.length ? 1 : 0, also = [] as string[] } = {}) => {
  const got = [...new Set(r.diags.filter((d) => d.level === 'error').map((d) => d.code))].sort();
  const bad = r.code !== exit || got.filter((c) => !also.includes(c)).join() !== [...want].sort().join();
  if (bad) failures.push(`${what}: expected exit ${exit} [${want}], got ${r.code} [${got}] ${r.err.trim().split('\n').slice(-2).join(' ')}`);
  else console.log(`ok    ${what}: ${want.length ? want.join(', ') : 'no error'}`);
};

try {
  if (existsSync(FILM)) throw new Error(`films/${ID} exists already; not touching it`);
  for (const p of [path.join(ROOT, 'dist', ID), OUT]) if (!existsSync(p)) owned.push(p);
  const made = run(['bun', 'scripts/new-film.ts', ID, '--style', 'nebula']);
  if (made.code === 0) owned.push(FILM);
  step('new-film', made);
  step('fonts', run(['bun', 'scripts/fonts.ts', '--film', ID]));
  step('build', run(['bunx', 'vite', 'build']));
  mkdirSync(OUT, { recursive: true });
  const { frames, fps } = (() => {
    const r = run(['bun', 'scripts/export.ts', '--film', ID, '--timeline']);
    step('timeline', r);
    return JSON.parse(readFileSync(path.join(FILM, 'timeline.json'), 'utf8')) as { frames: number; fps: number };
  })();
  const seconds = Math.ceil(frames / fps) + 1;
  tone(TONE, 440, seconds);
  step('export', run(['bun', 'scripts/export.ts', '--film', ID, '--workers', '2', '--audio', TONE]));

  expectCodes('the export as it is', verify(), []);
  const report = path.join(OUT, 'verify');
  for (const f of ['verify.json', 'sheet.jpg', 'phone.jpg', 'frames/0001.jpg'])
    if (!existsSync(path.join(report, f))) failures.push(`clean: ${f} missing from out/<film>/verify`);
  const rec = JSON.parse(readFileSync(path.join(report, 'verify.json'), 'utf8'));
  if (!/^[0-9a-f]{64}$/.test(rec.sha256) || rec.picture.some((p: { difference: unknown }) => typeof p.difference !== 'number'))
    failures.push('clean: verify.json lacks the sha256 or a picture measurement');

  const copy = (name: string, ...args: string[]) => {
    const f = path.join(OUT, name);
    ffmpeg('-i', VIDEO, ...args, f);
    return path.relative(ROOT, f);
  };
  const same = ['-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p'];
  expectCodes('a small patch on the picture', verify('--file', copy('patch.mp4', '-vf', 'drawbox=x=300:y=300:w=64:h=64:color=white:t=fill', ...same, '-c:a', 'copy')), ['verify-picture']);
  expectCodes('colour only (the hue turned, luma unchanged)', verify('--file', copy('hue.mp4', '-vf', 'hue=h=120:s=2', ...same, '-c:a', 'copy')), ['verify-picture']);
  const end = frames / fps;
  expectCodes('the last 0.6 s of sound removed', verify('--file', copy('tail.mp4', '-c:v', 'copy', '-af', `volume=enable='gte(t,${end - 0.6})':volume=0`, '-c:a', 'aac', '-b:a', '256k')), ['verify-audio-stale'], { also: ['verify-loudness'] });
  const hole = path.join(OUT, 'hole.wav');
  ffmpeg('-i', TONE, '-af', "volume=enable='between(t,0,2.5)':volume=0", '-c:a', 'pcm_s16le', hole);
  expectCodes('sound where the source is silent', verifyWith(path.relative(ROOT, hole), '--file', path.relative(ROOT, VIDEO)), ['verify-audio-stale'], { also: ['verify-loudness'] });
  expectCodes('--audio names no file', verifyWith('out/none.wav'), ['verify-file'], { exit: 2 });
  const master = path.join(OUT, 'master.wav');
  copyFileSync(TONE, master);
  expectCodes('a final mix the export would refuse', verifyWith(null), ['verify-audio-stale']);
  rmSync(master);
  expectCodes('the last second cut', verify('--file', copy('short.mp4', '-t', String(frames / fps - 1), '-c', 'copy')), ['verify-frames'], { also: ['verify-audio'] });
  expectCodes('6 dB louder', verify('--file', copy('loud.mp4', '-c:v', 'copy', '-af', 'volume=6dB', '-c:a', 'aac', '-b:a', '256k')), ['verify-loudness', 'verify-audio-stale']);
  const other = path.join(OUT, 'other.wav');
  tone(other, 620, seconds);
  ffmpeg('-i', VIDEO, '-i', other, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-t', String(frames / fps), path.join(OUT, 'other.mp4'));
  expectCodes('another sound of the same loudness', verify('--file', path.relative(ROOT, path.join(OUT, 'other.mp4'))), ['verify-audio-stale']);
  const silent = copy('silent.mp4', '-c:v', 'copy', '-an');
  expectCodes('no audio', verify('--file', silent), ['verify-audio']);
  expectCodes('no audio, --noaudio', verify('--file', silent, '--noaudio'), []);
  const cut = path.join(OUT, 'cut.mp4'), bytes = readFileSync(VIDEO);
  writeFileSync(cut, bytes.subarray(0, bytes.length >> 1));
  expectCodes('a file cut in half', verify('--file', path.relative(ROOT, cut)), ['verify-decode'], { also: ['verify-frames', 'verify-audio'] });
  expectCodes('the wrong --res', verify('--file', path.relative(ROOT, VIDEO), '--res', '720'), ['verify-size']);
  expectCodes('no such file', verify('--file', 'out/none.mp4'), ['verify-file'], { exit: 2 });
} catch (e) {
  failures.push(e instanceof Error ? e.message : String(e));
} finally {
  for (const p of owned) rmSync(p, { recursive: true, force: true });
}
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`${failures.length ? 'FAIL' : 'PASS'} test-verify${owned.some((p) => existsSync(p)) ? ' (fixture left behind)' : ''}`);
process.exit(failures.length ? 1 : 0);
