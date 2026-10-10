/**
 * Cases for the checks of scripts/validate.ts that need a film to trigger them:
 *
 *   bun scripts/test-validate.ts        (just test-validate)
 *
 * Builds a throwaway film from templates/film/ (films/validate-fixture-<pid>/, style nebula; new-film refuses an
 * existing directory, so the run owns it) and validates it twice:
 *   1. as generated: no error and no warning (the template itself must pass every check);
 *   2. with one extra page scene that draws, each in its own place:
 *      - text in the page colour (text-contrast), and near-invisible text in rgba() (text-contrast);
 *      - white text whose glyphs sit on a white patch while most of its box is dark ground (text-contrast: judged
 *        glyph by glyph, not by the box average);
 *      - two fully shown strings on top of each other (text-overlap);
 *      - a steady low-contrast string at alpha 0.7 (text-contrast-partial warning);
 *      - a label running off the frame (text-overflow);
 *      validate must exit 1 and report exactly those codes, all on the fault scene.
 * Only the directories this run created are removed afterwards (also on failure). Needs uv (fonts).
 * Exit code 0 when every case behaves as expected, 1 otherwise.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const ID = `validate-fixture-${process.pid}`;
const FILM = path.join(ROOT, 'films', ID);
const owned: string[] = [];
const own = (p: string) => { if (!existsSync(p)) owned.push(p); };
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
  if (existsSync(FILM)) throw new Error(`films/${ID} exists already; not touching it`);
  for (const p of [path.join(ROOT, 'dist', ID), path.join(ROOT, 'out', ID)]) own(p);
  const r = run(['bun', 'scripts/new-film.ts', ID, '--style', 'nebula']);
  if (r.code === 0) owned.push(FILM);
  step('new-film', r);
  // the fault scene goes into the film before fonts are made, so its characters are in the subsets
  writeFileSync(path.join(FILM, 'scenes', 'faults.ts'), `// Deliberate layout faults for scripts/test-validate.ts.
import { ctx, text, background, C, scene, W } from '../../../engine';

scene({
  name: 'faults', kind: 'page', dur: 4, fi: 0, fo: 0,
  subs: [],
  draw() {
    background();
    text('看不清的字', 200, 260, { size: 40, color: C.bg2 });
    text('几乎透明', 700, 260, { size: 40, color: 'rgba(230,238,247,0.04)' });
    // a white patch under the glyphs, dark ground in the rest of the (much wider) box
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(1180, 225, 60, 50);
    text('白', 1190, 265, { size: 40, color: '#F4F6F8', ls: 400 });
    text('叠在一起', 200, 460, { size: 40, color: C.fg });
    text('叠在一起', 210, 465, { size: 40, color: C.fg });
    text('半透明的低对比', 700, 460, { size: 40, color: C.bg2, alpha: 0.7 });
    text('出画面', W - 40, 800, { size: 40, color: C.fg });
  },
});
`);
  step('fonts', run(['bun', 'scripts/fonts.ts', '--film', ID]));

  // 1. the template as generated (the fault scene is not imported yet)
  const v1 = validate();
  if (v1.code !== 0 || v1.diags.length) failures.push(`template: expected no diagnostics, got exit ${v1.code}: ${v1.diags.map((d) => `${d.level} ${d.code}`).join(', ')}`);
  else console.log('ok    template validates with no diagnostics');

  // 2. with the fault scene
  const idx = path.join(FILM, 'scenes', 'index.ts');
  writeFileSync(idx, readFileSync(idx, 'utf8') + "import './faults';\n");
  const v2 = validate();
  const errs = v2.diags.filter((d) => d.level === 'error'), warns = v2.diags.filter((d) => d.level === 'warning');
  const has = (code: string, s: string, list = errs) => list.some((d) => d.code === code && d.message.includes(s));
  const want: [string, string, Diag[]][] = [
    ['text-contrast', '看不清的字', errs], ['text-contrast', '几乎透明', errs], ['text-contrast', '"白"', errs],
    ['text-overlap', '叠在一起', errs], ['text-overflow', '出画面', errs], ['text-contrast-partial', '半透明的低对比', warns],
  ];
  if (v2.code !== 1) failures.push(`faults: expected exit 1, got ${v2.code}`);
  for (const [code, s, list] of want) if (!has(code, s, list)) failures.push(`faults: expected ${code} for "${s}"`);
  const known = new Set(want.map(([c]) => c));
  for (const d of v2.diags) {
    if (!known.has(d.code)) failures.push(`faults: unexpected ${d.level} ${d.code}: ${d.message}`);
    if (!d.path.startsWith('scene:faults')) failures.push(`faults: diagnostic outside the fault scene: ${d.path} ${d.code}`);
  }
  if (!failures.some((f) => f.startsWith('faults'))) console.log(`ok    fault scene reports ${want.map(([c, s]) => `${c} (${s})`).join(', ')}, nothing else`);
} catch (e) {
  failures.push(e instanceof Error ? e.message : String(e));
} finally {
  for (const p of owned) rmSync(p, { recursive: true, force: true });
}
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`${failures.length ? 'FAIL' : 'PASS'} test-validate${owned.some((p) => existsSync(p)) ? ' (fixture left behind!)' : ''}`);
process.exit(failures.length ? 1 : 0);
