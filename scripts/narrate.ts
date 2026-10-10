/**
 * Synthesize a film's narration and write its lock:
 *
 *   bun scripts/narrate.ts --film <film> [--backend cosyvoice3|fake] [--resynth <id,id,...>|all]     (just narrate)
 *
 * Reads film-plan.json's lines/voice when present, otherwise films/<film>/narration.json (NarrationScript), and voices/<voice>/voice.json
 * (prompt transcript, prompt file, source, licence). Each line is identified by a key: the hash of the adapter version,
 * backend, model (with its pinned revision), the voice prompt's sha256 and transcript, the reading, speed and seed
 * (from the line id). The caption text is not in the key: changing only the text updates the lock, not the audio.
 *
 * Per line:
 *   - lock entry with the same key, audio file present with the lock's sha256: kept (text updated if it changed);
 *   - lock entry with the same key, audio missing or changed: an error (the audio cannot be made again identically:
 *     synthesis samples), unless --resynth names the line;
 *   - no lock entry, or a different key (reading, voice, backend or model changed), or --resynth: synthesized; the old
 *     and new durations are printed (they move the film's timeline).
 * The audio goes to films/<film>/narration/<id>.flac (committed; Develata's decision, 2026-10-09), the lock to
 * films/<film>/narration.lock.json: per line text, reading, duration (seconds, from the sample count), sha256, key.
 * Lines no longer in the script leave the lock and their audio is removed.
 *
 * The adapter, audio/tts.py, runs in the TTS environment for cosyvoice3 (.cache/tts/venv, made by just tts-setup;
 * TTS_PYTHON overrides) and in the audio project for fake (uv run --project audio). Exit code 1 on failure, 2 on
 * bad arguments.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { LINE_ID, type LockLine, type NarrationLock, type NarrationScript } from '../engine/narration';
import { FILM_ID, requireFilm } from './film-arg';
import { readPlan } from './plan-check';
import { planNarration } from '../engine/plan';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const usage = (m: string): never => { console.error(m); process.exit(2); };
const fail = (m: string): never => { throw new Error(m); };
const FILM = requireFilm(argv);
let o: { backend?: string; resynth?: string } = {};
try {
  o = parseArgs({ args: argv, strict: true, options: { film: { type: 'string' }, backend: { type: 'string' }, resynth: { type: 'string' } } }).values;
} catch (e) { usage(e instanceof Error ? e.message : String(e)); }

/** Where a film's narration lives (the one place these paths are made). */
export const narrationPaths = (film: string) => ({
  script: path.join(ROOT, 'films', film, 'narration.json'),
  lock: path.join(ROOT, 'films', film, 'narration.lock.json'),
  audio: (id: string) => path.join(ROOT, 'films', film, 'narration', `${id}.flac`),
});

/** The adapter's version (audio/tts.py ADAPTER_VERSION) and the models: id, pinned revision, files, where they go. */
const ADAPTER_VERSION = 3;
const MODELS: Record<string, { model: string; dir?: string }> = {
  fake: { model: 'fake-v1' },
  cosyvoice3: {
    model: 'FunAudioLLM/Fun-CosyVoice3-0.5B-2512@29e01c4e8d000f4bcd70751be16fa94bf3d85a18',
    dir: path.join(ROOT, '.cache', 'tts', 'models', 'Fun-CosyVoice3-0.5B'),
  },
};
const COSYVOICE_SRC = path.join(ROOT, '.cache', 'tts', 'cosyvoice-src');

const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const readJson = <T>(f: string, what: string): T => {
  if (!existsSync(f)) fail(`${what}: ${path.relative(ROOT, f)} not found`);
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { return fail(`${path.relative(ROOT, f)}: not JSON (${e instanceof Error ? e.message : e})`); }
};
/** Remove a leftover; a failure is only a warning. */
const tidy = (p: string) => { try { rmSync(p, { recursive: true, force: true }); } catch (e) { console.warn(`warning: could not remove ${p}: ${e instanceof Error ? e.message : e}`); } };
const writeAtomic = (f: string, data: string | Uint8Array) => {
  mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, f);
};

/** Samples and rate of a 16-bit PCM WAV (the adapter's output). */
function wavInfo(f: string): { samples: number; rate: number } {
  const b = readFileSync(f);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') fail(`${f}: not a WAV file`);
  let p = 12, rate = 0, bytesPerFrame = 0;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') { rate = b.readUInt32LE(p + 12); bytesPerFrame = b.readUInt16LE(p + 20); }
    if (id === 'data') return { samples: size / bytesPerFrame, rate };
    p += 8 + size + (size & 1);
  }
  return fail(`${f}: no data chunk`);
}

function python(backend: string): string[] {
  if (backend === 'fake') return ['uv', 'run', '--project', path.join(ROOT, 'audio'), 'python'];
  const venv = path.join(ROOT, '.cache', 'tts', 'venv');
  const py = process.env.TTS_PYTHON ?? (process.platform === 'win32' ? path.join(venv, 'Scripts', 'python.exe') : path.join(venv, 'bin', 'python'));
  if (!existsSync(py)) fail(`no TTS environment (${py}): run just tts-setup`);
  return [py];
}

// one narrate per film at a time, from before anything is read until the lock is committed (a run that read an old
// state must not commit after another run)
const workRoot = path.join(ROOT, '.cache', 'tts', 'work');
mkdirSync(workRoot, { recursive: true });
const filmLock = path.join(workRoot, `.${FILM}.lock`);
try { mkdirSync(filmLock); } catch { console.error(`another narrate of ${FILM} is running (or one crashed: remove ${filmLock})`); process.exit(1); }
// released on every way out (usage errors exit from inside)
process.on('exit', () => { try { rmSync(filmLock, { recursive: true, force: true }); } catch {} });
try {
  const P = narrationPaths(FILM);
  const planDir = path.join(ROOT, 'films', FILM);
  const fromPlan = existsSync(path.join(planDir, 'film-plan.json')) ? readPlan(planDir, FILM) : null;
  if (fromPlan && !fromPlan.plan) fail(fromPlan.diagnostics.map((d) => `${d.path}: ${d.message}`).join('\n'));
  const script = fromPlan ? planNarration(fromPlan.plan!) : readJson<NarrationScript>(P.script, 'narration script');
  if (!script || typeof script.voice !== 'string' || !FILM_ID.test(script.voice) || !Array.isArray(script.lines)) fail(`${path.relative(ROOT, P.script)}: needs { voice: <voice id>, lines: [...] }`);
  const seen = new Set<string>();
  for (const l of script.lines) {
    if (typeof l.id !== 'string' || !LINE_ID.test(l.id)) fail(`narration line id "${l.id}": lowercase letters, digits, hyphens`);
    if (seen.has(l.id)) fail(`narration line id "${l.id}" appears twice`);
    seen.add(l.id);
    if (typeof l.text !== 'string' || !l.text.trim() || typeof (l.read ?? l.text) !== 'string' || !(l.read ?? l.text).trim()) fail(`narration line "${l.id}": text (and read, if given) must be non-empty`);
  }
  const old: NarrationLock | null = existsSync(P.lock) ? readJson<NarrationLock>(P.lock, 'lock') : null;
  const backend = o.backend ?? old?.backend ?? 'cosyvoice3';
  const M = MODELS[backend] ?? usage(`--backend ${backend}: one of ${Object.keys(MODELS).join(', ')}`);
  if (M.dir && !existsSync(path.join(M.dir, 'cosyvoice3.yaml'))) fail(`model not found in ${path.relative(ROOT, M.dir)}: run just tts-setup`);

  const voiceDir = path.join(ROOT, 'voices', script.voice);
  const voice = readJson<{ text: string; file: string }>(path.join(voiceDir, 'voice.json'), `voice "${script.voice}"`);
  if (typeof voice.text !== 'string' || typeof voice.file !== 'string' || voice.file !== path.basename(voice.file)) fail(`voices/${script.voice}/voice.json: needs text and a plain file name`);
  const voiceWav = path.join(voiceDir, voice.file);
  const voiceSha = sha256(readFileSync(voiceWav));

  const all = o.resynth === 'all';
  const resynth = new Set(all ? script.lines.map((l) => l.id) : (o.resynth ?? '').split(',').filter(Boolean));
  for (const id of resynth) if (!seen.has(id)) usage(`--resynth ${id}: no such line`);

  const lines: Record<string, LockLine> = {};
  const todo: { id: string; read: string; seed: number; key: string }[] = [];
  for (const l of script.lines) {
    const read = l.read ?? l.text;
    const seed = parseInt(sha256(`${FILM}/${l.id}`).slice(0, 8), 16);
    const key = sha256(JSON.stringify({ adapter: ADAPTER_VERSION, backend, model: M.model, voice: voiceSha, prompt: voice.text, read, speed: 1, seed }));
    const e = old?.lines[l.id];
    const file = P.audio(l.id);
    const intact = e && existsSync(file) && sha256(readFileSync(file)) === e.sha256;
    if (e && e.key === key && !resynth.has(l.id)) {
      if (!intact) fail(`line "${l.id}": its audio ${path.relative(ROOT, file)} is missing or not the one in the lock; restore it, or make it again with --resynth ${l.id} (the timing will change)`);
      lines[l.id] = { ...e, text: l.text };
    } else todo.push({ id: l.id, read, seed, key });
  }

  // a private work directory
  const work = path.join(workRoot, `${FILM}-${process.pid}`);
  // new audio is staged beside the committed files; the lock is the commit point
  const staged: { id: string; tmp: string }[] = [];
  try {
    if (todo.length) {
      mkdirSync(work, { recursive: true });
      const job = path.join(work, 'job.json');
      writeFileSync(job, JSON.stringify({
        backend, model_dir: M.dir ?? '', src_dir: COSYVOICE_SRC, voice: { wav: voiceWav, text: voice.text },
        lines: todo.map((t) => ({ id: t.id, read: t.read, seed: t.seed, out: path.join(work, `${t.id}.wav`) })),
      }, null, 1));
      console.log(`synthesizing ${todo.length} line(s) with ${backend}...`);
      const p = Bun.spawnSync([...python(backend), path.join(ROOT, 'audio', 'tts.py'), job], { cwd: ROOT, stdout: 'pipe', stderr: 'inherit' });
      if (p.exitCode !== 0) fail(`audio/tts.py failed (${p.exitCode})`);
      const done = new Map(p.stdout.toString().split('\n').filter((x) => x.trim().startsWith('{')).map((x) => { const r = JSON.parse(x); return [r.id as string, r]; }));
      for (const t of todo) {
        if (!done.has(t.id)) fail(`audio/tts.py did not report line "${t.id}"`);
        if (process.env.NARRATE_TEST_FAIL_AT === t.id) fail(`test hook: failing at line "${t.id}"`);
        const wav = path.join(work, `${t.id}.wav`);
        const { samples, rate } = wavInfo(wav);
        const tmp = path.join(path.dirname(P.audio(t.id)), `.${t.id}.${process.pid}.new.flac`);
        mkdirSync(path.dirname(tmp), { recursive: true });
        staged.push({ id: t.id, tmp });
        const ff = Bun.spawnSync(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-c:a', 'flac', '-compression_level', '8', tmp], { stderr: 'pipe' });
        if (ff.exitCode !== 0) fail(`ffmpeg (flac, ${t.id}): ${ff.stderr.toString().trim()}`);
        const l = script.lines.find((x) => x.id === t.id)!;
        const duration = samples / rate;
        const was = old?.lines[t.id]?.duration;
        lines[t.id] = { text: l.text, read: t.read, duration, sha256: sha256(readFileSync(tmp)), key: t.key };
        console.log(`  ${t.id}: ${duration.toFixed(3)}s${was !== undefined ? ` (was ${was.toFixed(3)}s)` : ''}`);
      }
    }
    // commit: the old files aside, the new ones in, the lock written; a failure before the lock puts everything back
    const aside: { file: string; old: string | null }[] = [];
    try {
      for (const st of staged) {
        const file = P.audio(st.id);
        const keep = existsSync(file) ? path.join(path.dirname(file), `.${st.id}.${process.pid}.old.flac`) : null;
        if (keep) renameSync(file, keep);
        aside.push({ file, old: keep });
        renameSync(st.tmp, file);
      }
      const lock: NarrationLock = { film: FILM, backend, model: M.model, voice: script.voice, lines: Object.fromEntries(script.lines.map((l) => [l.id, lines[l.id]])) };
      writeAtomic(P.lock, JSON.stringify(lock, null, 1) + '\n');
      const total = Object.values(lock.lines).reduce((x, l) => x + l.duration, 0);
      console.log(`${script.lines.length} line(s), ${total.toFixed(2)}s of speech, ${todo.length} synthesized -> ${path.relative(ROOT, P.lock)}`);
    } catch (e) {
      for (const a of aside.reverse()) {
        try { rmSync(a.file, { force: true }); if (a.old) renameSync(a.old, a.file); } catch (r) { console.error(`could not restore ${a.file}: ${r instanceof Error ? r.message : r}`); }
      }
      throw e;
    }
    // committed: cleanup only (warnings)
    for (const a of aside) if (a.old) tidy(a.old);
    for (const id of Object.keys(old?.lines ?? {})) if (!seen.has(id)) { tidy(P.audio(id)); console.log(`  ${id}: no longer in the script, removed`); }
  } finally {
    for (const st of staged) tidy(st.tmp);
    tidy(work);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  tidy(filmLock);
  process.exit(1);
}
tidy(filmLock);
