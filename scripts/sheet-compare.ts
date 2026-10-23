/**
 * A contact sheet of a film in its own styles and in styles it does not use, without editing the film by hand:
 *
 *   bun scripts/sheet-compare.ts --film <id> --with <style>[,<style>] [--times 4,39.5] [--out out/<id>/sheet-compare]
 *   (just sheet-compare <film> <style>[,<style>] ...)
 *
 * Why a temporary change, not a --with-style option of the sheet: a film's bundle holds only the styles its film.ts
 * installs (a plan film's are film-plan.json's, and boot() requires them to match exactly), and boot() refuses a style
 * without the film's own font bundle films/<film>/fonts/<style>/. Bringing a style in from outside would need a way
 * into the engine for styles no film imports, which is what the import rules (just check-imports) exclude. So, for the
 * length of one build, this:
 *   1. writes the font bundle of each added style for this film (scripts/fonts.ts --style: the film's characters and
 *      the style's) into films/<film>/fonts/<style>/ (refused if that directory exists already);
 *   2. adds the styles to the film: to a plan film's film-plan.json styles; to a hand-written film's film.ts, one import
 *      per style and the style appended to its selectStyle([...]) list (refused unless there is exactly one such list);
 *   3. builds the page into dist/.sheet-compare-<film>/ (dist/<film>/ is left alone), then puts film.ts or
 *      film-plan.json back byte for byte and removes the font bundles it wrote;
 *   4. renders the sheet from that build (scripts/sheet.ts --dist): the film's styles, then the added ones, into --out
 *      (default out/<film>/sheet-compare/), and removes the build.
 * Before anything is written, the original file, the edited one and the font directories to be written are recorded in
 * out/<film>/.sheet-compare/state.json (also the lock: one comparison per film at a time); the restore runs after the
 * build, on failure, on Ctrl+C and on SIGTERM. After a hard kill the next run finds the record: it restores the file
 * if it still holds the edit (and stops, naming the files, if it was changed since), removes those font directories,
 * and goes on. A style made for other films may misread a film's conventions (e.g. a style that draws a caption's second
 * slot as English shows math-lessons's verse marks there); that affects the comparison only.
 * Exit code 1 on failure, 2 on bad arguments.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { requireFilm } from './film-arg';
import { requireCaptureFrames } from './lib/captures';
import { writeAtomic } from './plan-schema';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const usage = (m: string): never => { console.error(m); process.exit(2); };
/** A refusal once the lock is held: thrown, so the lock is released on the way out. */
const refuse = (m: string): never => { throw Object.assign(new Error(m), { exit: 2 }); };
let o: { with?: string; times?: string; out?: string } = {};
try {
  o = parseArgs({ args: argv, options: { film: { type: 'string' }, with: { type: 'string' }, times: { type: 'string' }, out: { type: 'string' } } }).values;
} catch (e) { usage(e instanceof Error ? e.message : String(e)); }
const FILM = requireFilm(argv);
const DIR = path.join(ROOT, 'films', FILM);
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, '/');
const WITH = (o.with ?? '').split(',').filter(Boolean);
if (!WITH.length) usage('--with <style>[,<style>] is required: the styles to add to the sheet');
for (const s of WITH)
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s) || !existsSync(path.join(ROOT, 'styles', s, 'index.ts')) || !existsSync(path.join(ROOT, 'styles', s, 'fonts.json')))
    usage(`--with ${s}: not a style package (styles/<id>/index.ts and fonts.json)`);
if (new Set(WITH).size !== WITH.length) usage(`--with ${o.with}: a style is listed twice`);
const STATE_DIR = path.join(ROOT, 'out', FILM, '.sheet-compare'), STATE = path.join(STATE_DIR, 'state.json');
const DIST = path.join(ROOT, 'dist', `.sheet-compare-${FILM}`);
const OUT = path.resolve(ROOT, o.out ?? `out/${FILM}/sheet-compare`);

/** What this run changes in the film, recorded before the change (file contents in base64, paths repo-relative). */
interface State { pid: number; file: string; original: string; edited: string; fonts: string[] }

/** Undo a recorded change: the file back if it holds the edit, the font directories removed, the record removed. */
function undo(st: State): string {
  const f = path.join(ROOT, st.file);
  const now = existsSync(f) ? readFileSync(f).toString('base64') : null;
  let what = `${st.file} unchanged`;
  if (now === st.edited) { writeBytes(f, Buffer.from(st.original, 'base64')); what = `${st.file} restored`; }
  else if (now !== st.original)
    throw new Error(`${st.file} was changed after sheet-compare edited it: its original is "original" (base64) in ${rel(STATE)}; restore it by hand${st.fonts.length ? `, remove ${st.fonts.map((d) => `${d}/`).join(', ')}` : ''}, then remove ${rel(STATE_DIR)}/`);
  for (const d of st.fonts) rmSync(path.join(ROOT, d), { recursive: true, force: true });
  rmSync(STATE_DIR, { recursive: true, force: true });
  return what;
}
/** Replace a file's bytes in one step (a temporary file beside it, renamed over it). */
function writeBytes(f: string, b: Buffer): void {
  const tmp = `${f}.${process.pid}.sheet-compare.tmp`;
  try { writeFileSync(tmp, b, { flag: 'wx' }); renameSync(tmp, f); } finally { rmSync(tmp, { force: true }); }
}

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; } };
/** Take the lock (the state directory); recover from a run that was killed. */
function lock(): void {
  mkdirSync(path.dirname(STATE_DIR), { recursive: true });
  for (let i = 0; i < 2; i++) {
    try { mkdirSync(STATE_DIR); return; } catch { /* exists */ }
    let st: State | null = null;
    try { st = JSON.parse(readFileSync(STATE, 'utf8')); } catch { /* the record was never written */ }
    if (st && alive(st.pid) && st.pid !== process.pid) usage(`another sheet-compare of ${FILM} is running (pid ${st.pid}); if not, remove ${rel(STATE_DIR)}/`);
    try { console.log(st ? `a previous sheet-compare did not finish: ${undo(st)}` : `removing an empty ${rel(STATE_DIR)}/`); }
    catch (e) { usage(e instanceof Error ? e.message : String(e)); }
    rmSync(STATE_DIR, { recursive: true, force: true });
  }
  usage(`could not take ${rel(STATE_DIR)}/`);
}

/** Comments and the contents of strings blanked, offsets kept (so brackets in text are not counted). */
const mask = (src: string) => src.replace(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`/g,
  (s) => (s.startsWith('/') ? ' '.repeat(s.length) : s[0] + ' '.repeat(s.length - 2) + s.at(-1)));

/** The film file to change and its edited contents. */
function edit(): { file: string; before: Buffer; after: Buffer } {
  const planFile = path.join(DIR, 'film-plan.json');
  if (existsSync(planFile)) {
    const before = readFileSync(planFile), plan = JSON.parse(before.toString('utf8'));
    if (!Array.isArray(plan.styles)) refuse(`${rel(planFile)}: no styles list`);
    for (const s of WITH) if (plan.styles.includes(s)) refuse(`${s} is already one of ${FILM}'s styles: use just sheet ${FILM}`);
    return { file: planFile, before, after: Buffer.from(JSON.stringify({ ...plan, styles: [...plan.styles, ...WITH] }, null, 2) + '\n') };
  }
  const file = path.join(DIR, 'film.ts'), before = readFileSync(file), src = before.toString('utf8');
  for (const imp of new Bun.Transpiler({ loader: 'ts' }).scanImports(src)) {
    const r = path.relative(ROOT, path.resolve(DIR, imp.path)).split(path.sep);
    if (r[0] === 'styles' && WITH.includes(r[1])) refuse(`${r[1]} is already one of ${FILM}'s styles: use just sheet ${FILM}`);
  }
  const blank = mask(src), calls = [...blank.matchAll(/\bselectStyle\s*\(\s*\[/g)];
  if (calls.length !== 1) refuse(`${rel(file)}: expected exactly one selectStyle([...]) call, found ${calls.length}; add the style to the film by hand (AGENTS.md, Commands: sheet-compare)`);
  const open = calls[0].index! + calls[0][0].length - 1;
  let depth = 0, close = -1;
  for (let i = open; i < blank.length && close < 0; i++) {
    if (blank[i] === '[') depth++;
    else if (blank[i] === ']' && --depth === 0) close = i;
  }
  if (close < 0) refuse(`${rel(file)}: the selectStyle([...]) list does not close`);
  const names = WITH.map((_, i) => `__compare${i}`);
  const inner = src.slice(open + 1, close).trimEnd();
  const sep = !inner.trim() ? '' : inner.endsWith(',') ? ' ' : ', ';
  const imports = WITH.map((s, i) => `import ${names[i]} from '../../styles/${s}/index.ts'; // sheet-compare (temporary)\n`).join('');
  const after = imports + src.slice(0, open + 1) + inner + sep + names.join(', ') + src.slice(close);
  return { file, before, after: Buffer.from(after) };
}

const run = (what: string, cmd: string[], env: Record<string, string> = {}) => {
  const p = Bun.spawnSync(cmd, { cwd: ROOT, env: { ...process.env, ...env }, stdout: 'inherit', stderr: 'inherit' });
  if (p.exitCode !== 0) throw new Error(`${what} failed (exit ${p.exitCode})`);
};

// ---- checks before anything is written (the sheet needs every capture's frames: fail before the fonts and the build)
await requireCaptureFrames(FILM);
const fontDirs = WITH.map((s) => path.join(DIR, 'fonts', s));
lock();
let state: State | null = null, keepRecord = false;
/** Undo this run's change once; if that fails, the record stays (it names what to do). */
const restore = () => {
  if (!state) return;
  const st = state;
  state = null;
  try { console.log(`sheet-compare: ${undo(st)}, ${st.fonts.length} temporary font bundle(s) removed`); }
  catch (e) { keepRecord = true; console.error(`sheet-compare: ${e instanceof Error ? e.message : String(e)}`); process.exitCode = 1; }
};
const release = () => { rmSync(DIST, { recursive: true, force: true }); if (!keepRecord) rmSync(STATE_DIR, { recursive: true, force: true }); };
const onSignal = (code: number) => () => { restore(); release(); process.exit(code); };
process.on('SIGINT', onSignal(130));
process.on('SIGTERM', onSignal(143));
let code = 0;
try {
  const e = edit(); // refuses a style the film already has
  for (const d of fontDirs) if (existsSync(d)) refuse(`${rel(d)}/ exists although that style is not one of ${FILM}'s; remove it first`);
  state = { pid: process.pid, file: rel(e.file), original: e.before.toString('base64'), edited: e.after.toString('base64'), fonts: fontDirs.map(rel) };
  writeAtomic(STATE, JSON.stringify(state, null, 1) + '\n');
  // 1. the added styles' font bundles for this film
  for (const s of WITH) run(`fonts --style ${s}`, ['bun', 'scripts/fonts.ts', '--film', FILM, '--style', s]);
  // 2.-3. the edit, for the length of one build into a directory of its own
  writeBytes(e.file, e.after);
  try { run('build', ['bunx', '--no-install', 'vite', 'build', '--outDir', DIST, '--emptyOutDir'], { FILM }); }
  finally { restore(); }
  // 4. the sheet from that build
  const args = ['--film', FILM, '--dist', DIST, '--out', OUT, ...(o.times ? ['--times', o.times] : [])];
  run('sheet', ['bun', 'scripts/sheet.ts', ...args]);
  console.log(`sheet-compare: ${FILM} with ${WITH.join(', ')} -> ${rel(path.join(OUT, 'sheet.jpg'))}`);
} catch (e) {
  console.error(`sheet-compare: ${e instanceof Error ? e.message : String(e)}`);
  code = (e as { exit?: number }).exit ?? 1;
} finally {
  restore();
  release();
}
process.exit(code || (process.exitCode as number) || 0);
