/**
 * Cases for the checks of scripts/validate.ts that need a film to trigger them:
 *
 *   bun scripts/test-validate.ts        (just test-validate)
 *
 * Builds a throwaway film from templates/film/ (films/validate-fixture/, style nebula) and validates it twice:
 *   1. as generated: no error (the template itself must pass every check);
 *   2. with one extra page scene that draws text in the background colour (text-contrast), two fully shown strings on
 *      top of each other (text-overlap), and a label outside the frame (text-overflow): validate must exit 1 and report
 *      exactly those codes, on that scene.
 * The fixture film, its build and its outputs are removed afterwards (also on failure). Needs uv (fonts).
 * Exit code 0 when every case behaves as expected, 1 otherwise.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const ID = 'validate-fixture';
const FILM = path.join(ROOT, 'films', ID);
const clean = () => { for (const p of [FILM, path.join(ROOT, 'dist', ID), path.join(ROOT, 'out', ID)]) rmSync(p, { recursive: true, force: true }); };
const run = (cmd: string[], env: Record<string, string> = {}) => {
  const p = Bun.spawnSync(cmd, { cwd: ROOT, env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'pipe' });
  return { code: p.exitCode ?? 1, out: p.stdout.toString(), err: p.stderr.toString() };
};
const step = (what: string, r: { code: number; out: string; err: string }) => {
  if (r.code !== 0) throw new Error(`${what} failed (${r.code}): ${(r.err || r.out).trim().split('\n').slice(-3).join(' ')}`);
};
interface Diag { level: string; code: string; path: string; message: string }
const validate = (): { code: number; diags: Diag[] } => {
  step('build', run(['bunx', 'vite', 'build'], { FILM: ID }));
  const r = run(['bun', 'scripts/validate.ts', '--film', ID, '--json']);
  return { code: r.code, diags: JSON.parse(r.out || '[]') };
};

const failures: string[] = [];
try {
  clean();
  step('new-film', run(['bun', 'scripts/new-film.ts', ID, '--style', 'nebula']));
  // the fault scene goes into the film before fonts are made, so its characters are in the subsets
  writeFileSync(path.join(FILM, 'scenes', 'faults.ts'), `// Deliberate layout faults for scripts/test-validate.ts.
import { text, background, C, scene, W } from '../../../engine';

scene({
  name: 'faults', kind: 'page', dur: 4, fi: 0, fo: 0,
  subs: [],
  draw() {
    background();
    text('看不清的字', 300, 400, { size: 40, color: C.bg2 });
    text('叠在一起', 300, 600, { size: 40, color: C.fg });
    text('叠在一起', 310, 605, { size: 40, color: C.fg });
    text('出画面', W - 40, 800, { size: 40, color: C.fg });
  },
});
`);
  step('fonts', run(['bun', 'scripts/fonts.ts', '--film', ID]));

  // 1. the template as generated (the fault scene is not imported yet)
  const clean1 = validate();
  if (clean1.code !== 0 || clean1.diags.some((d) => d.level === 'error')) failures.push(`template: expected no errors, got exit ${clean1.code}: ${clean1.diags.map((d) => d.code).join(', ')}`);
  else console.log('ok    template validates with no error');

  // 2. with the fault scene
  const idx = path.join(FILM, 'scenes', 'index.ts');
  writeFileSync(idx, readFileSync(idx, 'utf8') + "import './faults';\n");
  const bad = validate();
  const codes = new Set(bad.diags.filter((d) => d.level === 'error').map((d) => d.code));
  const want = ['text-contrast', 'text-overlap', 'text-overflow'];
  const onScene = bad.diags.filter((d) => d.level === 'error').every((d) => d.path.startsWith('scene:faults'));
  if (bad.code !== 1) failures.push(`faults: expected exit 1, got ${bad.code}`);
  for (const c of want) if (!codes.has(c)) failures.push(`faults: expected a ${c} error`);
  for (const c of codes) if (!want.includes(c)) failures.push(`faults: unexpected ${c} error`);
  if (!onScene) failures.push('faults: an error was reported outside the fault scene');
  const contrast = bad.diags.find((d) => d.code === 'text-contrast');
  if (contrast && !contrast.message.includes('看不清的字')) failures.push(`faults: contrast error names another text: ${contrast.message}`);
  if (!failures.some((f) => f.startsWith('faults'))) console.log(`ok    fault scene reports ${want.join(', ')} and nothing else`);
} catch (e) {
  failures.push(e instanceof Error ? e.message : String(e));
} finally {
  clean();
}
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`${failures.length ? 'FAIL' : 'PASS'} test-validate${existsSync(FILM) ? ' (fixture left behind!)' : ''}`);
process.exit(failures.length ? 1 : 0);
