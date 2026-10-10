/** Plan workflow and failure cases in exclusively owned paths; no downloads, real fake-backend FLACs and MP4s. */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { checkPlan } from './plan-check';
import { ROOT, planSchemas } from './plan-schema';
import type { FilmPlan } from '../engine/plan';
import { makeNumberedVideo } from './lib/barcode';
import { mediaDir } from './film-arg';

const ID = `plan-fixture-${process.pid}`, FILM = path.join(ROOT, 'films', ID), WORK = path.join(ROOT, 'out', ID), DIST = path.join(ROOT, 'dist', ID);
const MEDIA = mediaDir(ID);
const owned: string[] = [];
const run = (cmd: string[], env: Record<string, string> = {}) => {
  const r = Bun.spawnSync(cmd, { cwd: ROOT, env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'pipe' });
  return { code: r.exitCode ?? 1, out: r.stdout.toString(), err: r.stderr.toString() };
};
const step = (name: string, r: ReturnType<typeof run>) => {
  if (r.code) throw new Error(`${name}: exit ${r.code}\n${r.out}\n${r.err}`);
  return r;
};
const ok = (condition: boolean, text: string) => { if (!condition) throw new Error(text); console.log(`ok    ${text}`); };
const write = (f: string, value: unknown) => writeFileSync(f, JSON.stringify(value, null, 2) + '\n');
const planFile = path.join(FILM, 'film-plan.json');
const planCheck = () => run(['bun', 'scripts/plan-check.ts', '--film', ID, '--json']);
const expectCode = (code: string) => {
  const r = planCheck(), diags = JSON.parse(r.out);
  ok(r.code === 1 && diags.some((d: { code: string }) => d.code === code), `${code}: exit 1 with its diagnostic`);
};
let failed = false;
try {
  if (existsSync(FILM)) throw new Error(`${FILM} exists; not touching it`);
  for (const p of [WORK, DIST, MEDIA]) { mkdirSync(path.dirname(p), { recursive: true }); mkdirSync(p); owned.push(p); }
  const created = run(['bun', 'scripts/new-film.ts', ID, '--style', 'nebula', '--plan']);
  if (created.code === 0) owned.push(FILM);
  step('new-film --plan', created);
  const plan: FilmPlan = JSON.parse(readFileSync(planFile, 'utf8'));
  // ASCII drawing plus one known CJK glyph: use the committed reference font subsets, never fetch fonts.
  plan.scenes = [
    { id: 'title', kind: 'plate', dur: 0.2, title: ['Plan demo', ''], copy: { promise: 'One idea' } },
    { id: 'idea', kind: 'page', title: ['Idea', ''], lines: [{ id: 'idea-line', text: '熵', read: '熵' }], copy: { point: 'Show it' } },
    { id: 'end', kind: 'page', dur: 0.3, title: ['Try it', ''], captions: [[0.05, 0.25, 'Go', '']], copy: { action: 'Start' } },
  ];
  write(planFile, plan);
  const title = path.join(FILM, 'scenes/title.ts'), before = readFileSync(title, 'utf8');
  const scaffold = step('scaffold', run(['bun', 'scripts/scaffold.ts', '--film', ID]));
  ok(scaffold.out.includes('kept scenes/title.ts') && readFileSync(title, 'utf8') === before, 'scaffold preserves existing modules');
  step('narrate plan', run(['bun', 'scripts/narrate.ts', '--film', ID, '--backend', 'fake']));
  ok(!existsSync(path.join(FILM, 'narration.json')), 'plan narration works without narration.json');
  const fontDir = path.join(FILM, 'fonts/nebula');
  cpSync(path.join(ROOT, 'films/infotheory/fonts/nebula'), fontDir, { recursive: true });
  const manifestFile = path.join(fontDir, 'manifest.json'), manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  manifest.film = ID; write(manifestFile, manifest);
  step('build', run(['bunx', '--no-install', 'vite', 'build'], { FILM: ID }));
  const good = step('plan-check', planCheck());
  ok(JSON.parse(good.out).length === 0, 'plan-check passes');
  const probeFrames = (file: string) => {
    const r = step('ffprobe', run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'json', file]));
    return Number(JSON.parse(r.out).streams[0].nb_read_frames);
  };
  const rendered = JSON.parse(step('render-scene', run(['bun', 'scripts/render.ts', '--film', ID, '--scene', 'idea', '--draft', '--style', 'nebula'])).out);
  // .6 lead + .2 fake voice + .8 tail = 1.6 s, exactly 48 frames; title precedes it by 6 frames.
  ok(rendered.frames === 48 && rendered.from === 0.2 && rendered.to === 1.8 && rendered.fps === 30 && rendered.style === 'nebula' && rendered.draft && probeFrames(rendered.out) === 48,
    'render-scene: 48 frames, [0.2, 1.8), draft, nebula (ffprobe agrees)');
  const range = JSON.parse(step('render-range', run(['bun', 'scripts/render.ts', '--film', ID, '--from', '0.02', '--to', '0.32'])).out);
  ok(range.frames === 9 && range.from === 1 / 30 && range.to === 10 / 30 && !range.draft && probeFrames(range.out) === 9,
    'render-range: 9 frames, [1/30, 10/30), full quality (ffprobe agrees)');
  const valid = step('validate plan', run(['bun', 'scripts/validate.ts', '--film', ID, '--json']));
  ok(!JSON.parse(valid.out).some((d: { level: string }) => d.level === 'error'), 'plan film validates without errors');
  step('sheet', run(['bun', 'scripts/sheet.ts', '--film', ID]));
  // Keep only the review artifact; all fixture source, captures and build paths are removed below.
  if (process.env.PLAN_KEEP_SHEET) {
    const review = path.join(ROOT, 'out', `plan-review-${process.pid}`);
    mkdirSync(review); cpSync(path.join(WORK, 'sheet'), review, { recursive: true }); console.log(`sheet for review: ${review}`);
  }

  // A demo gets its manifest/edit/camera from the plan, and narration never cuts its footage short.
  await makeNumberedVideo(path.join(WORK, 'capture.mp4'), 0.5);
  step('import-capture', run(['bun', 'scripts/import-capture.ts', '--film', ID, '--id', 'app', path.join(WORK, 'capture.mp4')]));
  const demo = structuredClone(plan);
  demo.scenes.push({ id: 'demo', kind: 'demo', lead: 0, tail: 0, lines: [{ id: 'demo-line', text: '熵' }], capture: { asset: 'captures/app.json', edit: [{ from: 0, to: 0.5 }], camera: [{ t: 0, x: 960, y: 540, zoom: 1 }], title: 'App' } });
  write(planFile, demo);
  step('scaffold demo', run(['bun', 'scripts/scaffold.ts', '--film', ID]));
  step('narrate demo', run(['bun', 'scripts/narrate.ts', '--film', ID, '--backend', 'fake']));
  step('demo plan-check', planCheck());
  step('build demo', run(['bunx', '--no-install', 'vite', 'build'], { FILM: ID }));
  const demoOut = JSON.parse(step('render demo', run(['bun', 'scripts/render.ts', '--film', ID, '--scene', 'demo', '--draft'])).out);
  ok(demoOut.frames === 15 && probeFrames(demoOut.out) === 15, 'plan demo: 0.2 s narration keeps all 15 footage frames');
  write(planFile, plan); rmSync(path.join(FILM, 'scenes/demo.ts'));
  step('restore scaffold', run(['bun', 'scripts/scaffold.ts', '--film', ID]));

  // Build succeeds, but the actual page must refuse missing/reordered registration before any frame renders.
  const indexFile = path.join(FILM, 'scenes/index.ts'), ordered = readFileSync(indexFile, 'utf8');
  writeFileSync(indexFile, "import './end';\nimport './idea';\n");
  step('build incomplete', run(['bunx', '--no-install', 'vite', 'build'], { FILM: ID }));
  const refusedPage = run(['bun', 'scripts/render.ts', '--film', ID, '--scene', 'idea', '--draft']);
  ok(refusedPage.code !== 0 && /register exactly the plan/.test(refusedPage.err) && !refusedPage.out.trim(), 'boot rejects missing/reordered scenes; render propagates failure without a success JSON');
  writeFileSync(indexFile, ordered);

  const mutation = (code: string, change: (p: FilmPlan) => void) => {
    const p = structuredClone(plan); change(p); write(planFile, p);
    try { expectCode(code); } finally { write(planFile, plan); }
  };
  mutation('plan-schema', (p) => { p.fps = 0; });
  mutation('plan-style', (p) => { p.styles = ['missing-style']; });
  mutation('plan-capture', (p) => { p.scenes[0] = { id: 'title', kind: 'demo', capture: { asset: 'captures/lost.json' } }; });
  rmSync(title); expectCode('plan-module-missing'); writeFileSync(title, before);
  const extra = path.join(FILM, 'scenes/extra.ts');
  writeFileSync(extra, "import { planScene } from '../../../engine';\nplanScene('extra', { draw() {} });\n");
  expectCode('plan-module-extra'); rmSync(extra);
  writeFileSync(title, before.replace("planScene('title'", "planScene('other'"));
  expectCode('plan-module-register'); writeFileSync(title, before);
  writeFileSync(title, before + "\nscene({ name: 'extra' });\n");
  expectCode('plan-module-register'); writeFileSync(title, before);
  const idx = path.join(FILM, 'scenes/index.ts'), index = readFileSync(idx, 'utf8');
  writeFileSync(idx, "import './end';\nimport './idea';\nimport './title';\n");
  expectCode('plan-index-order'); writeFileSync(idx, index);
  writeFileSync(idx, index + "import('./title');\n"); expectCode('plan-index-order'); writeFileSync(idx, index);
  for (const text of ["'计划外的文字'", "`four stray English words`", "'\\u4e71\\u5199'"]) {
    writeFileSync(title, before + `\nconst stray = ${text};\n`); expectCode('plan-copy');
  }
  writeFileSync(title, before + "\n// 这里的注释不检查 planScene('fake', {})\nimport unused from '../../../styles/paper-dawn/index.ts';\nconst allowed = 'One idea';\n");
  step('comments and plan text allowed', planCheck()); writeFileSync(title, before);
  mutation('plan-narration-lock', (p) => { p.scenes[1].lines![0].text = '熵是什么'; });
  const asset = path.join(FILM, 'assets/pixel.png'); mkdirSync(path.dirname(asset));
  writeFileSync(asset, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=', 'base64'));
  expectCode('plan-asset-unlisted');
  const entry = { path: 'assets/pixel.png', kind: 'image', source: 'test fixture', license: 'CC0', sha256: createHash('sha256').update(readFileSync(asset)).digest('hex') };
  const assets = path.join(FILM, 'assets.json'); write(assets, [entry]); step('listed asset', planCheck());
  write(assets, [{ ...entry, sha256: '0'.repeat(64) }]); expectCode('plan-asset-sha256');
  write(assets, [{ ...entry, path: 'assets/absent.png' }]); expectCode('plan-asset-missing');
  for (const field of ['source', 'license']) { write(assets, [{ ...entry, [field]: ' ' }]); expectCode('plan-assets'); }
  write(assets, [entry]);
  const brief = path.join(FILM, 'brief.json'); write(brief, { product: '' }); expectCode('plan-brief'); rmSync(brief);
  // Stale schema in an owned directory: exercise the exact checker without editing shared schemas.
  const schemaDir = path.join(WORK, 'schemas'); mkdirSync(schemaDir);
  for (const [name, data] of Object.entries(planSchemas())) writeFileSync(path.join(schemaDir, name), data);
  writeFileSync(path.join(schemaDir, 'film-plan.schema.json'), '{}');
  ok(checkPlan(ID, { schemaDir }).some((d) => d.code === 'plan-schema-stale'), 'plan-schema-stale: detects a stale JSON schema');

  // Invalid plan even with a missing module: not a single path or byte changes.
  rmSync(title); write(planFile, { ...plan, fps: 0 });
  const names = readdirSync(path.join(FILM, 'scenes'));
  const refused = run(['bun', 'scripts/scaffold.ts', '--film', ID]);
  ok(refused.code === 1 && !existsSync(title) && JSON.stringify(names) === JSON.stringify(readdirSync(path.join(FILM, 'scenes'))) && readFileSync(idx, 'utf8') === index,
    'scaffold rejects an invalid plan before any write');
  const validate = run(['bun', 'scripts/validate.ts', '--film', ID, '--json']);
  ok(validate.code === 1 && JSON.parse(validate.out).some((d: { code: string }) => d.code === 'plan-schema'), 'validate includes plan diagnostics before rendering');
  write(planFile, plan); writeFileSync(title, before);
  step('final plan-check', planCheck());
} catch (e) { console.error(e instanceof Error ? e.message : e); failed = true; }
finally {
  for (const p of owned.reverse()) {
    const resolved = path.resolve(p);
    if (!resolved.startsWith(ROOT + path.sep) || ![FILM, WORK, DIST, MEDIA].includes(resolved)) throw new Error(`unsafe cleanup path ${resolved}`);
    rmSync(resolved, { recursive: true, force: true });
  }
}
console.log(`${failed ? 'FAIL' : 'PASS'} test-plan`);
process.exitCode = failed ? 1 : 0;
