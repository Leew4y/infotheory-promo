/**
 * Narration end to end with the fake voice (audio/tts.py --backend fake: 0.2 s per character of the reading,
 * whitespace excluded), against expectations worked out by hand:
 *
 *   bun scripts/test-narration.ts        (just test-narration)
 *
 * A throwaway film (films/narration-fixture-<pid>/, style nebula, 30 fps) with three scenes:
 *   intro  narratedScene: "ver" (a version, read "v二点一": 8 chars, 1.6 s) and "price" (an amount, read in words: 10
 *          chars, 2.0 s): .6 + 1.6 + .35 + 2.0 + .8 = 5.35 s -> 161 frames;
 *   demo   demoScene over a 5 s capture with 2.0 s of narration ("short"): the footage wins, 150 frames;
 *   outro  narratedScene: "term-a" and "term-b", the same text twice (0.8 s each), told apart by id; the scene's drawing
 *          lands on vo("term-b"): .6 + .8 + .35 + .8 + .8 = 3.35 s -> 101 frames.
 * Checks:
 *   1. narrate: the lock holds every line with the expected duration and the sha256 of its committed FLAC; a second
 *      run synthesizes nothing; a caption-only change updates the lock without synthesis; a changed reading
 *      synthesizes that line only; a lost audio file is an error until --resynth names it;
 *   2. the page: scene lengths, placements (film seconds) and captions as worked out above; validate has no errors,
 *      and a script line placed in no scene is a narration-unplaced error;
 *   3. mix over a pink-noise bed: integrated loudness -16 ± 0.5 LUFS, true peak <= -1.5 dBTP, and in every line's
 *      window the master is >= 6 dB louder than the bed alone (outside every window);
 *   4. export uses the final mix, and refuses it once the narration has moved (a lead changed, the mix not redone).
 * Every fixture path is created exclusively first; only those are removed afterwards. Needs ffmpeg, uv.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { NarrationLock, NarrationScript } from '../engine/narration';
import { makeNumberedVideo } from './lib/barcode';
import { mediaDir } from './film-arg';

const ROOT = path.resolve(import.meta.dir, '..');
const ID = `narration-fixture-${process.pid}`;
const FILM = path.join(ROOT, 'films', ID), WORK = path.join(ROOT, 'out', ID), DIST = path.join(ROOT, 'dist', ID), MEDIA = mediaDir(ID);
const owned: string[] = [];
const run = (cmd: string[], env: Record<string, string> = {}) => {
  const p = Bun.spawnSync(cmd, { cwd: ROOT, env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'pipe' });
  return { code: p.exitCode ?? 1, out: p.stdout.toString(), err: p.stderr.toString() };
};
const step = (what: string, r: { code: number; out: string; err: string }) => {
  if (r.code !== 0) throw new Error(`${what} failed (${r.code}): ${(r.err || r.out).trim().split('\n').slice(-4).join(' ')}`);
  return r;
};
const failures: string[] = [];
const ok = (m: string) => console.log(`ok    ${m}`);
const check = (cond: boolean, good: string, bad: string) => (cond ? ok(good) : failures.push(bad));
const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e;

const SCRIPT: NarrationScript = {
  voice: 'cosyvoice-zero-shot',
  lines: [
    { id: 'ver', scene: 'intro', text: '版本 v2.1 发布', read: '版本 v二点一 发布' },
    { id: 'price', scene: 'intro', text: '价格 ¥1,299', read: '价格 一千二百九十九元', en: 'Price: 1,299 yuan' },
    { id: 'short', scene: 'demo', text: '两秒钟的旁白说完了', read: '两秒钟的旁白文字说完' },
    { id: 'term-a', scene: 'outro', text: '熵是什么' },
    { id: 'term-b', scene: 'outro', text: '熵是什么' },
  ],
};
const DUR: Record<string, number> = { ver: 1.6, price: 2.0, short: 2.0, 'term-a': 0.8, 'term-b': 0.8 };
const F = { intro: 161, demo: 150, outro: 101 };
const T0 = { intro: 0, demo: 161 / 30, outro: 311 / 30 };
const AT: Record<string, number> = { ver: 0.6, price: 2.55, short: T0.demo + 0.6, 'term-a': T0.outro + 0.6, 'term-b': T0.outro + 1.75 };

const narrate = (...a: string[]) => run(['bun', 'scripts/narrate.ts', '--film', ID, '--backend', 'fake', ...a]);
const lockFile = path.join(FILM, 'narration.lock.json');
const readLock = (): NarrationLock => JSON.parse(readFileSync(lockFile, 'utf8'));
const writeScript = (s: NarrationScript) => writeFileSync(path.join(FILM, 'narration.json'), JSON.stringify(s, null, 1));

/** RMS (dB) of mono samples of the master in [a, b) seconds, or over the samples where `keep` holds. */
function rmsDb(x: Float32Array, sr: number, pick: (i: number) => boolean, a = 0, b = x.length / sr): number {
  let s = 0, n = 0;
  for (let i = Math.floor(a * sr); i < Math.min(x.length, Math.floor(b * sr)); i++) if (pick(i)) { s += x[i] * x[i]; n++; }
  return 10 * Math.log10(s / Math.max(1, n) + 1e-20);
}

try {
  if (existsSync(FILM)) throw new Error(`films/${ID} exists already; not touching it`);
  for (const p of [DIST, WORK, MEDIA]) {
    mkdirSync(path.dirname(p), { recursive: true });
    try { mkdirSync(p); } catch { throw new Error(`${p} exists already; not touching it`); }
    owned.push(p);
  }
  const r = run(['bun', 'scripts/new-film.ts', ID, '--style', 'nebula']);
  if (r.code === 0) owned.push(FILM);
  step('new-film', r);

  // 1. narrate
  writeScript(SCRIPT);
  step('narrate', narrate());
  let lock = readLock();
  const durs = SCRIPT.lines.map((l) => [l.id, lock.lines[l.id]?.duration] as const);
  const files = SCRIPT.lines.every((l) => existsSync(path.join(FILM, 'narration', `${l.id}.flac`)) && sha(path.join(FILM, 'narration', `${l.id}.flac`)) === lock.lines[l.id].sha256);
  check(durs.every(([id, d]) => d !== undefined && near(d, DUR[id])) && files && lock.backend === 'fake' && lock.film === ID,
    'narrate: every line in the lock, durations 0.2 s per read character, sha256 of the committed FLAC',
    `narrate: lock ${JSON.stringify(durs)}, files ${files}`);
  const again = narrate();
  check(again.code === 0 && /0 synthesized/.test(again.out), 'narrate again: nothing synthesized', `narrate again: ${again.code} ${again.out.trim()}`);
  const caption = structuredClone(SCRIPT);
  caption.lines[4].en = 'What is entropy?';
  caption.lines[3].text = '熵是什么？';
  caption.lines[3].read = '熵是什么';
  writeScript(caption);
  const cap = narrate();
  lock = readLock();
  check(cap.code === 0 && /0 synthesized/.test(cap.out) && lock.lines['term-a'].text === '熵是什么？',
    'a caption-only change updates the lock without synthesis', `caption change: ${cap.code} ${cap.out.trim()}`);
  const reread = structuredClone(caption);
  reread.lines[0].read = '版本 v二点一 正式发布';
  writeScript(reread);
  const rr = narrate();
  lock = readLock();
  check(rr.code === 0 && /1 synthesized/.test(rr.out) && near(lock.lines.ver.duration, 2.0),
    'a changed reading synthesizes that line only (10 chars: 2.0 s)', `reading change: ${rr.code} ${rr.out.trim()}`);
  writeScript(caption);
  step('narrate back', narrate());
  rmSync(path.join(FILM, 'narration', 'price.flac'));
  const lost = narrate();
  const back = narrate('--resynth', 'price');
  check(lost.code !== 0 && /price/.test(lost.err) && back.code === 0 && existsSync(path.join(FILM, 'narration', 'price.flac')),
    'a lost audio file is an error until --resynth names it', `lost audio: ${lost.code} ${lost.err.trim()} / resynth ${back.code}`);
  lock = readLock();

  // the film: capture, film.ts with the narration, three scenes
  await makeNumberedVideo(path.join(WORK, 'app.mp4'), 5, 30);
  step('import-capture', run(['bun', 'scripts/import-capture.ts', '--film', ID, '--id', 'app', path.join(WORK, 'app.mp4')]));
  const filmTs = path.join(FILM, 'film.ts');
  writeFileSync(filmTs, readFileSync(filmTs, 'utf8')
    .replace("import { defineFilm, selectStyle } from '../../engine';", "import { defineFilm, selectStyle, useNarration } from '../../engine';\nimport script from './narration.json';\nimport lock from './narration.lock.json';")
    .replace(/(export default defineFilm\([^;]*\);)/, '$1\nuseNarration(script as never, lock as never);'));
  writeFileSync(path.join(FILM, 'scenes', 'index.ts'), "import './all';\n");
  const scenes = (introLead: number) => `import { background, demoScene, narratedScene, text, vo, C } from '../../../engine';
import app from '../captures/app.json';

narratedScene({ name: 'intro', kind: 'page', lead: ${introLead}, draw: () => background() });
demoScene({ name: 'demo', asset: app as never, narration: {} });
narratedScene({ name: 'outro', kind: 'page', draw(lt) {
  background();
  if (lt >= vo('term-b')) text('熵', 960, 540, { size: 120, color: C.fg, align: 'center' });
} });
`;
  writeFileSync(path.join(FILM, 'scenes', 'all.ts'), scenes(0.6));
  for (const f of ['title.ts', 'idea.ts', 'end.ts']) rmSync(path.join(FILM, 'scenes', f), { force: true });
  step('fonts', run(['bun', 'scripts/fonts.ts', '--film', ID]));
  step('build', run(['bunx', 'vite', 'build'], { FILM: ID }));

  // 2. the page
  const tlFile = path.join(WORK, 'timeline.json'), cues = path.join(WORK, 'narration.cues.json');
  step('export --timeline --narration', run(['bun', 'scripts/export.ts', '--film', ID, '--timeline', tlFile, '--narration', cues]));
  const tl: { scenes: { name: string; f0: number; f1: number }[] } = JSON.parse(readFileSync(tlFile, 'utf8'));
  const lens = Object.fromEntries(tl.scenes.map((s) => [s.name, s.f1 - s.f0]));
  check(lens.intro === F.intro && lens.demo === F.demo && lens.outro === F.outro,
    'scene lengths: intro 161, demo 150 (the 5 s footage outlasts 2 s of narration), outro 101 frames', `scene lengths ${JSON.stringify(lens)}`);
  const pl: { film: string; duration: number; placements: { id: string; t: number; dur: number }[] } = JSON.parse(readFileSync(cues, 'utf8'));
  const bad = SCRIPT.lines.filter((l) => { const p = pl.placements.find((q) => q.id === l.id); return !p || !near(p.t, AT[l.id]) || !near(p.dur, lock.lines[l.id].duration); });
  check(!bad.length && pl.placements.length === 5 && near(pl.duration, 412 / 30), 'placements: every line where worked out by hand, the repeated text twice by id',
    `placements wrong for ${bad.map((l) => l.id).join(', ')}: ${JSON.stringify(pl)}`);
  const v = run(['bun', 'scripts/validate.ts', '--film', ID, '--json']);
  const diags: { level: string; code: string; path?: string }[] = JSON.parse(v.out || '[]');
  check(v.code === 0 && !diags.some((d) => d.level === 'error'), 'validate: no errors', `validate: ${v.code} ${JSON.stringify(diags.filter((d) => d.level === 'error'))}`);
  const extra = structuredClone(caption);
  extra.lines.push({ id: 'stray', scene: 'nowhere', text: '没有地方说的话' });
  writeScript(extra);
  step('narrate stray', narrate());
  step('build stray', run(['bunx', 'vite', 'build'], { FILM: ID }));
  const vs = run(['bun', 'scripts/validate.ts', '--film', ID, '--json']);
  const sd: { level: string; code: string }[] = JSON.parse(vs.out || '[]');
  check(vs.code !== 0 && sd.some((d) => d.level === 'error' && d.code === 'narration-unplaced'), 'a line placed in no scene is a narration-unplaced error', `stray line: ${vs.code} ${JSON.stringify(sd.map((d) => d.code))}`);
  writeScript(caption);
  step('narrate without stray', narrate());
  step('build again', run(['bunx', 'vite', 'build'], { FILM: ID }));

  // 3. mix over a pink-noise bed
  const bed = path.join(WORK, 'bed.wav');
  step('bed', run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', `anoisesrc=color=pink:amplitude=0.25:sample_rate=44100:seed=7:duration=${(412 / 30 + 1).toFixed(3)}`, '-ac', '2', '-c:a', 'pcm_s16le', bed]));
  step('mix', run(['uv', 'run', '--project', 'audio', 'python', 'audio/mix.py', '--film', ID, '--music', bed, '--placements', cues]));
  const master = path.join(WORK, 'master.wav');
  const meas = run(['ffmpeg', '-hide_banner', '-nostats', '-i', master, '-af', 'ebur128=peak=true', '-f', 'null', '-']).err;
  const sum = meas.slice(meas.lastIndexOf('Summary:'));
  const I = +sum.split('I:')[1].split('LUFS')[0], TP = +sum.split('Peak:')[1].split('dBFS')[0];
  check(Math.abs(I + 16) <= 0.5 && TP <= -1.5, `master: ${I.toFixed(2)} LUFS, true peak ${TP.toFixed(2)} dBTP`, `master loudness ${I} LUFS, true peak ${TP} dBTP`);
  const SR = 44100;
  const raw = Bun.spawnSync(['ffmpeg', '-v', 'error', '-i', master, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { stdout: 'pipe' }).stdout;
  const x = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
  const inAny = (i: number, m: number) => pl.placements.some((p) => i / SR >= p.t - m && i / SR < p.t + p.dur + m);
  const bedDb = rmsDb(x, SR, (i) => !inAny(i, 0.6));
  const lift = pl.placements.map((p) => [p.id, rmsDb(x, SR, () => true, p.t, p.t + p.dur) - bedDb] as const);
  check(lift.every(([, d]) => d >= 6), `every line >= 6 dB over the bed (${lift.map(([id, d]) => `${id} ${d.toFixed(1)}`).join(', ')})`, `lines over the bed: ${JSON.stringify(lift)}`);

  // 4. export with the final mix; refused once the narration moved
  const mp4 = path.join(WORK, 'film.mp4');
  const ex = run(['bun', 'scripts/export.ts', '--film', ID, '--workers', '2', '--to', '2', '--out', mp4]);
  check(ex.code === 0 && /audio \S*master\.wav/.test(ex.out), 'export muxes the final mix', `export with the mix: ${ex.code} ${ex.err.trim()}`);
  writeFileSync(path.join(FILM, 'scenes', 'all.ts'), scenes(0.9));
  step('build moved', run(['bunx', 'vite', 'build'], { FILM: ID }));
  const st = run(['bun', 'scripts/export.ts', '--film', ID, '--workers', '1', '--to', '1', '--out', mp4]);
  check(st.code !== 0 && /stale/.test(st.err), 'export refuses the mix once the narration moved', `stale mix: ${st.code} ${st.err.trim()}`);
} catch (e) {
  failures.push(e instanceof Error ? e.message : String(e));
} finally {
  if (process.env.KEEP_FIXTURE && failures.length) console.log(`kept for debugging: ${owned.join(', ')}`);
  else for (const p of owned) rmSync(p, { recursive: true, force: true });
}
for (const m of failures) console.log(`FAIL  ${m}`);
console.log(`${failures.length ? 'FAIL' : 'PASS'} test-narration${owned.some((p) => existsSync(p)) ? ' (fixture left behind)' : ''}`);
process.exit(failures.length ? 1 : 0);
