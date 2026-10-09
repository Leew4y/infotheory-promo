/**
 * End-to-end cases of screen captures (import path): a numbered test video -> import-capture -> a demo scene with an
 * edit -> the real export -> every output frame decoded and its barcode read:
 *
 *   bun scripts/test-capture.ts        (just test-capture)
 *
 * A throwaway film (films/capture-fixture-<pid>/, style nebula) gets one demo scene filling the canvas, no grade,
 * motion blur on, whose edit plays source [0, 2) at speed 1 and [3, 5) at speed 2 (3 s of film). Checks:
 *   1. the import made round(6 s x 30) = 180 frames;
 *   2. the export has round(3 s x 30) = 90 frames, and output frame f shows source frame
 *      floor(sourceTime(edit, f / 30) x 30 + 1e-9): no skipped, repeated or blurred frames beyond what the edit says;
 *   3. validate: no errors, and exactly one warning for the recorded click that the edit cuts (capture-event-cut);
 *   4. a missing frame is an error (strict mode), not a placeholder: with one frame file removed, rendering that frame fails;
 *   5. --rebuild re-derives a cleared cache from the source video (checked by sha256) and refuses a changed source;
 *   6. a scripted web capture (capture.ts on scripts/test-fixtures/capture-page.html): each recorded click lies within
 *      4 px of the red marker the page draws at the press, and the marker shows 0–2 frames after the event frame.
 * Only what this run created is removed afterwards. Needs ffmpeg, uv (fonts).
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sourceFrame, sourceTime, type CaptureAsset, type Segment } from '../engine/capture';
import { mediaDir } from './film-arg';
import { makeNumberedVideo, readBarcode } from './lib/barcode';

const ROOT = path.resolve(import.meta.dir, '..');
const ID = `capture-fixture-${process.pid}`;
const FILM = path.join(ROOT, 'films', ID);
const WORK = path.join(ROOT, 'out', ID);
const owned: string[] = [];
const run = (cmd: string[], env: Record<string, string> = {}) => {
  const p = Bun.spawnSync(cmd, { cwd: ROOT, env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'pipe' });
  return { code: p.exitCode ?? 1, out: p.stdout.toString(), err: p.stderr.toString() };
};
const step = (what: string, r: { code: number; out: string; err: string }) => {
  if (r.code !== 0) throw new Error(`${what} failed (${r.code}): ${(r.err || r.out).trim().split('\n').slice(-3).join(' ')}`);
  return r;
};
const EDIT: Segment[] = [{ from: 0, to: 2 }, { from: 3, to: 5, speed: 2 }];

const failures: string[] = [];
const ok = (m: string) => console.log(`ok    ${m}`);
try {
  if (existsSync(FILM)) throw new Error(`films/${ID} exists already; not touching it`);
  for (const p of [path.join(ROOT, 'dist', ID), WORK, mediaDir(ID)]) if (!existsSync(p)) owned.push(p);
  const r = run(['bun', 'scripts/new-film.ts', ID, '--style', 'nebula']);
  if (r.code === 0) owned.push(FILM);
  step('new-film', r);
  mkdirSync(WORK, { recursive: true });
  const video = path.join(WORK, 'numbered.mp4');
  await makeNumberedVideo(video, 6, 30);
  // one click inside the edit (1 s) and one in the part it cuts (2.5 s)
  const events = path.join(WORK, 'events.jsonl');
  writeFileSync(events, '{"t": 11, "type": "click", "x": 1500, "y": 300}\n{"t": 12.5, "type": "click", "x": 1500, "y": 300}\n');
  step('import-capture', run(['bun', 'scripts/import-capture.ts', '--film', ID, '--id', 'num', video, '--events', events, '--sync', '10=0']));
  const asset: CaptureAsset = await Bun.file(path.join(FILM, 'captures', 'num.json')).json();
  if (asset.frames !== 180) failures.push(`import: ${asset.frames} frames, expected 180`);
  else ok('import: 180 frames for 6 s at 30 fps');
  if (asset.events.length !== 2) failures.push(`import: ${asset.events.length} events, expected 2`);

  // the film: just the demo scene
  writeFileSync(path.join(FILM, 'scenes', 'index.ts'), "import './cap';\n");
  writeFileSync(path.join(FILM, 'scenes', 'cap.ts'), `import { demoScene } from '../../../engine';
import num from '../captures/num.json';

demoScene({
  name: 'cap', asset: num as never, edit: ${JSON.stringify(EDIT)},
  rect: { x: 0, y: 0, w: 1920, h: 1080 }, fi: 0, fo: 0, mb: 3,
  grade: { bloom: 0, ca: 0, vig: 0, grain: 0, sat: 1, split: 0 },
});
`);
  for (const f of ['title.ts', 'idea.ts', 'end.ts']) rmSync(path.join(FILM, 'scenes', f), { force: true });
  step('fonts', run(['bun', 'scripts/fonts.ts', '--film', ID]));
  step('build', run(['bunx', 'vite', 'build'], { FILM: ID }));

  // 2. export and read every frame
  const mp4 = path.join(WORK, 'out.mp4');
  step('export', run(['bun', 'scripts/export.ts', '--film', ID, '--noaudio', '--workers', '2', '--out', mp4]));
  const dec = Bun.spawn(['ffmpeg', '-v', 'error', '-i', mp4, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { stdout: 'pipe' });
  const FB = 1920 * 1080 * 4;
  let buf = new Uint8Array(0), f = 0;
  const wrong: string[] = [];
  for await (const chunk of dec.stdout as ReadableStream<Uint8Array>) {
    const next = new Uint8Array(buf.length + chunk.length);
    next.set(buf); next.set(chunk, buf.length); buf = next;
    while (buf.length >= FB) {
      const got = readBarcode(buf.subarray(0, FB), 1920);
      const want = sourceFrame(asset, sourceTime(EDIT, f / 30));
      if (got !== want) wrong.push(`${f}: ${got} != ${want}`);
      buf = buf.slice(FB);
      f++;
    }
  }
  await dec.exited;
  if (f !== 90) failures.push(`export: ${f} frames, expected 90`);
  if (wrong.length) failures.push(`export: ${wrong.length} frame(s) show the wrong source frame: ${wrong.slice(0, 8).join(', ')}`);
  if (f === 90 && !wrong.length) ok('export: 90 frames, each shows exactly the source frame the edit maps it to');

  // 3. validate
  const v = run(['bun', 'scripts/validate.ts', '--film', ID, '--json']);
  const diags: { level: string; code: string }[] = JSON.parse(v.out || '[]');
  const errs = diags.filter((d) => d.level === 'error'), cuts = diags.filter((d) => d.code === 'capture-event-cut');
  if (v.code !== 0 || errs.length) failures.push(`validate: expected no errors, got ${errs.map((d) => d.code).join(', ')}`);
  if (cuts.length !== 1) failures.push(`validate: expected one capture-event-cut warning, got ${cuts.length}`);
  if (v.code === 0 && !errs.length && cuts.length === 1) ok('validate: no errors; the cut click is one warning');

  // 4. a missing frame fails the render
  const dir = path.join(mediaDir(ID), 'num'), victim = path.join(dir, '00030.jpg');
  renameSync(victim, `${victim}.bak`);
  const shot = run(['bun', 'scripts/export.ts', '--film', ID, '--shots', '1.0', '--dir', path.join(WORK, 'shots')]);
  renameSync(`${victim}.bak`, victim);
  if (shot.code === 0) failures.push('missing frame: rendering succeeded, expected a failure');
  else ok('missing frame: rendering fails instead of drawing a placeholder');

  // 5. a cleared cache is re-derived from the source (checked by sha256); a changed source is refused
  rmSync(dir, { recursive: true, force: true });
  const rb = run(['bun', 'scripts/import-capture.ts', '--film', ID, '--rebuild', '--from', WORK]);
  const back = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.jpg')).length : 0;
  if (rb.code !== 0 || back !== 180) failures.push(`rebuild: exit ${rb.code}, ${back} frames (expected 0 and 180): ${rb.err.trim()}`);
  else ok('rebuild: the cleared cache is re-derived from the source, 180 frames');
  await makeNumberedVideo(video, 5, 30); // a different file under the same name
  const bad = run(['bun', 'scripts/import-capture.ts', '--film', ID, '--rebuild', '--from', WORK]);
  if (bad.code === 0 || !/sha256/.test(bad.err)) failures.push(`rebuild: a changed source was accepted (exit ${bad.code})`);
  else ok('rebuild: a source whose sha256 differs is refused');

  // 6. a scripted web capture (Playwright): every recorded click lands where the page itself marks it, on time
  step('capture', run(['bun', 'scripts/capture.ts', '--film', ID, '--id', 'web', path.join(ROOT, 'scripts', 'test-fixtures', 'capture-scenario.ts'), '--sources', path.join(WORK, 'sources')]));
  const web: CaptureAsset = await Bun.file(path.join(FILM, 'captures', 'web.json')).json();
  const clicks = web.events.filter((e) => e.type === 'click');
  if (clicks.length !== 4) failures.push(`capture: ${clicks.length} clicks recorded, expected 4`);
  const webDir = path.join(mediaDir(ID), 'web');
  const problems: string[] = [];
  for (const [k, e] of clicks.entries()) {
    const fe = Math.floor(e.t * web.fps + 1e-9);
    const s = Math.max(0, fe - 3), n = Math.min(web.frames - s, 10);
    // decode frames s .. s+n-1 of the asset and look for the page's red marker near the click
    const dec2 = Bun.spawnSync(['ffmpeg', '-v', 'error', '-start_number', String(s), '-i', path.join(webDir, '%05d.jpg'), '-frames:v', String(n), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { stdout: 'pipe' });
    const raw = dec2.stdout, FB2 = web.width * web.height * 3;
    const ex = (e.x! * web.width) / web.viewport.width, ey = (e.y! * web.height) / web.viewport.height;
    let first = -1, cx = 0, cy = 0;
    for (let i = 0; i < n && first < 0; i++) {
      let m = 0, sx = 0, sy = 0;
      for (let y = Math.max(0, Math.round(ey) - 20); y < Math.min(web.height, Math.round(ey) + 20); y++)
        for (let x = Math.max(0, Math.round(ex) - 20); x < Math.min(web.width, Math.round(ex) + 20); x++) {
          const o = i * FB2 + (y * web.width + x) * 3;
          if (raw[o] > 200 && raw[o + 1] < 70 && raw[o + 2] < 70) { m++; sx += x; sy += y; }
        }
      if (m >= 40) { first = s + i; cx = sx / m; cy = sy / m; }
    }
    if (first < 0) { problems.push(`click ${k}: the page's marker never appears near (${ex.toFixed(0)}, ${ey.toFixed(0)})`); continue; }
    const lag = first - fe, dist = Math.hypot(cx + 0.5 - ex, cy + 0.5 - ey);
    if (lag < 0 || lag > 2) problems.push(`click ${k}: the page shows it ${lag} frame(s) after the event frame (allowed 0–2)`);
    if (dist > 4) problems.push(`click ${k}: recorded at (${ex.toFixed(1)}, ${ey.toFixed(1)}), the page marks (${(cx + 0.5).toFixed(1)}, ${(cy + 0.5).toFixed(1)}): ${dist.toFixed(1)} px (allowed 4)`);
  }
  if (problems.length) failures.push(...problems.map((p) => `capture: ${p}`));
  else if (clicks.length === 4) ok('capture: 4 clicks, each marked by the page within 4 px and 0–2 frames of the recorded event');
} catch (e) {
  failures.push(e instanceof Error ? e.message : String(e));
} finally {
  for (const p of owned) rmSync(p, { recursive: true, force: true });
}
for (const m of failures) console.log(`FAIL  ${m}`);
console.log(`${failures.length ? 'FAIL' : 'PASS'} test-capture${owned.some((p) => existsSync(p)) ? ' (fixture left behind!)' : ''}`);
process.exit(failures.length ? 1 : 0);
