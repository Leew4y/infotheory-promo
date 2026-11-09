/**
 * Cases for scripts/regress.ts's order check, on a real page:
 *
 *   bun scripts/test-regress.ts        (just test-regress)
 *
 * Builds a throwaway film from templates/film/ (films/regress-fixture-<pid>/, style nebula) and changes one scene:
 *   1. pure: --update writes the baseline, and the out-of-order comparison passes;
 *   2. a frame that draws differently after a seek backwards (state kept between frames): it matches the baseline in
 *      order, so regress reports it as order-dependent, and --update refuses to record it;
 *   3. Math.random in a frame: --update refuses to record it;
 *   4. an ordinary change: regress reports it as a difference, not as order-dependent.
 * Only the directories this run created are removed afterwards (also on failure). Needs uv (fonts) and Chrome.
 * Exit code 0 when every case behaves as expected, 1 otherwise.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const ID = `regress-fixture-${process.pid}`;
const FILM = path.join(ROOT, 'films', ID), OUT = path.join(ROOT, 'out', ID), DIST = path.join(ROOT, 'dist', ID);
const SCENE = path.join(FILM, 'scenes', 'idea.ts');
const BASELINE = path.join(FILM, 'regress', `nebula.${process.platform}-${process.arch}.json`);
const REPORT = path.join(OUT, 'regress', 'nebula.json');
const DRAW = '    background();\n';
const owned: string[] = [];
const failures: string[] = [];

const run = (cmd: string[]) => {
  const p = Bun.spawnSync(cmd, { cwd: ROOT, env: { ...process.env, FILM: ID }, stdout: 'pipe', stderr: 'pipe' });
  return { code: p.exitCode ?? 1, out: p.stdout.toString(), err: p.stderr.toString() };
};
const step = (what: string, r: { code: number; out: string; err: string }) => {
  if (r.code !== 0) throw new Error(`${what} failed (${r.code}): ${(r.err || r.out).trim().split('\n').slice(-3).join(' ')}`);
};
const regress = (...args: string[]) => run(['bun', 'scripts/regress.ts', '--film', ID, '--workers', '2', ...args]);
const report = (): { verdict: string; mismatched: number[]; orderDependent: number[] } => JSON.parse(readFileSync(REPORT, 'utf8'));
const expectThat = (what: string, good: boolean, detail: string) => {
  if (good) console.log(`ok    ${what}`);
  else failures.push(`${what}: ${detail}`);
};

try {
  if (existsSync(FILM)) throw new Error(`films/${ID} exists already; not touching it`);
  for (const p of [DIST, OUT]) if (!existsSync(p)) owned.push(p);
  const made = run(['bun', 'scripts/new-film.ts', ID, '--style', 'nebula']);
  if (made.code === 0) owned.push(FILM);
  step('new-film', made);
  step('fonts', run(['bun', 'scripts/fonts.ts', '--film', ID]));
  mkdirSync(OUT, { recursive: true });
  const original = readFileSync(SCENE, 'utf8');
  if (!original.includes(DRAW)) throw new Error(`${SCENE} has no line "${DRAW.trim()}" to change`);
  /** Build the film with `change` applied to the scene's draw (and `head` at the top of its module). */
  const build = (change = '', head = '') => {
    writeFileSync(SCENE, head + original.replace(DRAW, DRAW + change));
    step('build', run(['bunx', 'vite', 'build']));
  };

  // 1. pure
  build();
  const recorded = regress('--update');
  expectThat('a pure film: --update writes the baseline', recorded.code === 0 && existsSync(BASELINE), `exit ${recorded.code}: ${recorded.err || recorded.out}`);
  const clean = regress();
  expectThat('a pure film passes out of order', clean.code === 0 && report().verdict === 'PASS', `exit ${clean.code}: ${clean.out}`);
  const baseline = readFileSync(BASELINE, 'utf8');

  // 2. state kept between frames: nothing shows while time only moves forward
  const stateful = ['    if (lt < lastT) circle(300, 300, 80, 1);\n    lastT = lt;\n', 'let lastT = -1;\n'] as const;
  build(...stateful);
  const dep = regress();
  const depReport = report();
  expectThat('state between frames: reported as order-dependent', dep.code === 1 && depReport.orderDependent.length > 0 && /order-dependent/.test(dep.out), `exit ${dep.code}, ${depReport.orderDependent.length} order-dependent: ${dep.out}`);
  expectThat('state between frames: every mismatch is order-dependent', depReport.orderDependent.length === depReport.mismatched.length, `${depReport.orderDependent.length} of ${depReport.mismatched.length}`);
  const refused = regress('--update');
  expectThat('state between frames: --update refuses and keeps the baseline', refused.code === 1 && /order-dependent/.test(refused.out) && readFileSync(BASELINE, 'utf8') === baseline, `exit ${refused.code}: ${refused.out}`);

  // 3. Math.random in a frame
  build('    circle(300, 300, 30 + Math.random() * 60, 1);\n');
  const random = regress('--update');
  expectThat('Math.random: --update refuses and keeps the baseline', random.code === 1 && /order-dependent/.test(random.out) && readFileSync(BASELINE, 'utf8') === baseline, `exit ${random.code}: ${random.out}`);

  // 4. an ordinary change
  build('    circle(300, 300, 80, 1);\n');
  const changed = regress();
  const changedReport = report();
  expectThat('an ordinary change: a difference, not order-dependent', changed.code === 1 && changedReport.mismatched.length > 0 && changedReport.orderDependent.length === 0 && !/order-dependent/.test(changed.out), `exit ${changed.code}, ${changedReport.orderDependent.length} order-dependent: ${changed.out}`);
} catch (e) {
  failures.push(e instanceof Error ? e.message : String(e));
} finally {
  for (const p of owned) rmSync(p, { recursive: true, force: true });
}
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`${failures.length ? 'FAIL' : 'PASS'} test-regress${owned.some((p) => existsSync(p)) ? ' (fixture left behind)' : ''}`);
process.exit(failures.length ? 1 : 0);
