/**
 * End-to-end cases of screen captures: test videos -> import-capture -> demo scenes -> the real export in both styles
 * -> every output frame decoded and checked against expectations worked out independently of the engine:
 *
 *   bun scripts/test-capture.ts        (just test-capture)
 *
 * A throwaway film (films/capture-fixture-<pid>/, styles nebula and paper-dawn) has three scenes on its 30 fps grid:
 *   lead  7 frames of page (so the demo scenes start at a frame other than 0);
 *   cap   a numbered 6 s video (each frame carries its number as a barcode), filling the canvas, edit [0, 2) at speed 1
 *         then [3, 5) at speed 2: 90 frames; local frame l shows source frame l (l < 60), else 90 + 2 (l - 60);
 *   gray  a flat gray 2 s video imported with --crop 960:540:100:50 and one click at 0.51 s on viewport (400, 200):
 *         in the 960x540 frames that is (300, 150) (crop origin subtracted), and the click belongs to local frame 15.
 * Checks:
 *   1. import: 180 frames for the numbered video; the gray one 60 frames of 960x540 with the crop recorded;
 *   2. per style: 157 frames; every cap frame shows exactly the expected source frame (motion blur on);
 *   3. per style: the cursor's tip is drawn where (300, 150) of the footage is on the canvas (the footage's box is found
 *      in the frame), and the click (ripple, press) changes nothing up to local frame 14 and shows from frame 15;
 *   4. validate: no errors, exactly one warning for the recorded click that the edit cuts (capture-event-cut);
 *   5. a missing frame is an error (strict mode): with one frame file removed, rendering that frame fails;
 *   6. a failed re-import (bad events file) leaves the manifest and frames as they were, and nothing staged behind;
 *   7. --rebuild refuses a manifest whose id is a path, re-derives a cleared cache from the sources (sha256), and refuses
 *      a changed source without touching the frames;
 *   8. a scripted web capture (capture.ts on scripts/test-fixtures/capture-page.html): each recorded click names its
 *      target and box, lies within 4 px of the red marker the page draws at the press, which shows 0–2 frames after
 *      the event frame.
 * Every fixture path is created exclusively before anything is written (an existing one aborts the run), and only
 * those are removed afterwards. Needs ffmpeg, uv (fonts).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CaptureAsset, Segment } from '../engine/capture';
import { mediaDir } from './film-arg';
import { makeNumberedVideo, readBarcode } from './lib/barcode';

const ROOT = path.resolve(import.meta.dir, '..');
const ID = `capture-fixture-${process.pid}`;
const FILM = path.join(ROOT, 'films', ID);
const WORK = path.join(ROOT, 'out', ID);
const DIST = path.join(ROOT, 'dist', ID);
const MEDIA = mediaDir(ID);
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
const LEAD = 7, CAP = 90, GRAY = 60, TOTAL = LEAD + CAP + GRAY;
/** The source frame local frame l of the cap scene shows (worked out by hand from EDIT at 30 fps). */
const capSource = (l: number) => (l < 60 ? l : 90 + 2 * (l - 60));
const STYLES = ['nebula', 'paper-dawn'];
const W = 1920, H = 1080, FB = W * H * 4;

const failures: string[] = [];
const ok = (m: string) => console.log(`ok    ${m}`);

/** Decode every frame of a video as RGBA and hand it to `fn`; returns the frame count. */
async function eachFrame(file: string, fn: (f: number, px: Uint8Array) => void): Promise<number> {
  const dec = Bun.spawn(['ffmpeg', '-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { stdout: 'pipe' });
  let buf = new Uint8Array(0), f = 0;
  for await (const chunk of dec.stdout as ReadableStream<Uint8Array>) {
    const next = new Uint8Array(buf.length + chunk.length);
    next.set(buf); next.set(chunk, buf.length); buf = next;
    while (buf.length >= FB) { fn(f++, buf.subarray(0, FB)); buf = buf.slice(FB); }
  }
  await dec.exited;
  return f;
}

/** The composite checks on the gray scene's frames (local frames 13, 14, 15 and 50) of one style. */
function grayChecks(style: string, fr: Map<number, Uint8Array>): string[] {
  const out: string[] = [];
  const px = (p: Uint8Array, x: number, y: number) => { const i = (y * W + x) * 4; return [p[i], p[i + 1], p[i + 2]]; };
  const late = fr.get(LEAD + CAP + 50)!;
  const g = px(late, W / 2, H / 2);
  const isGray = (c: number[]) => c.every((v, k) => Math.abs(v - g[k]) <= 12);
  // the footage's box: the gray run through the canvas centre
  let x0 = W / 2, x1 = W / 2, y0 = H / 2, y1 = H / 2;
  while (x0 > 0 && isGray(px(late, x0 - 1, H / 2))) x0--;
  while (x1 < W - 1 && isGray(px(late, x1 + 1, H / 2))) x1++;
  while (y0 > 0 && isGray(px(late, W / 2, y0 - 1))) y0--;
  while (y1 < H - 1 && isGray(px(late, W / 2, y1 + 1))) y1++;
  const sx = (x1 - x0 + 1) / 960, sy = (y1 - y0 + 1) / 540;
  if (Math.abs(sx - sy) > 0.01) return [`${style}: footage box ${x1 - x0 + 1}x${y1 - y0 + 1} is not 16:9 (window found wrongly?)`];
  const tip = { x: x0 + 300 * sx, y: y0 + 150 * sy };
  // 3a. the cursor: strongly non-gray pixels within 4 px of the expected tip, and its body below-right of it
  let near = Infinity, body = 0;
  for (let y = Math.round(tip.y) - 40; y <= Math.round(tip.y) + 40; y++)
    for (let x = Math.round(tip.x) - 40; x <= Math.round(tip.x) + 40; x++) {
      const c = px(late, x, y);
      if (c.some((v, k) => Math.abs(v - g[k]) > 60)) {
        near = Math.min(near, Math.hypot(x + 0.5 - tip.x, y + 0.5 - tip.y));
        if (x > tip.x + 2 && y > tip.y + 4) body++;
      }
    }
  if (!(near <= 4 && body >= 30)) out.push(`${style}: no cursor at the expected tip (${tip.x.toFixed(1)}, ${tip.y.toFixed(1)}): nearest mark ${near.toFixed(1)} px, ${body} body px`);
  // 3b. the click: nothing changes from local frame 13 to 14 (no early press or ripple); the ripple shows at 15
  const diff = (a: Uint8Array, b: Uint8Array, keep: (dx: number, dy: number) => boolean) => {
    let n = 0;
    for (let dy = -40; dy <= 40; dy++)
      for (let dx = -40; dx <= 40; dx++) {
        if (!keep(dx, dy)) continue;
        const ca = px(a, Math.round(tip.x) + dx, Math.round(tip.y) + dy), cb = px(b, Math.round(tip.x) + dx, Math.round(tip.y) + dy);
        if (ca.some((v, k) => Math.abs(v - cb[k]) > 40)) n++;
      }
    return n;
  };
  const [f13, f14, f15] = [13, 14, 15].map((l) => fr.get(LEAD + CAP + l)!);
  const early = diff(f13, f14, () => true);
  const ring = diff(f14, f15, (dx, dy) => dx < -2 && dy < -2 && Math.hypot(dx, dy) < 14);
  if (early > 2) out.push(`${style}: ${early} px change between local frames 13 and 14, before the click's frame 15 (early press or ripple)`);
  if (ring < 4) out.push(`${style}: the ripple does not show on the click's frame 15 (${ring} px changed around the tip)`);
  return out;
}

try {
  // every fixture path exclusively, before anything is written
  if (existsSync(FILM)) throw new Error(`films/${ID} exists already; not touching it`);
  for (const p of [DIST, WORK, MEDIA]) {
    mkdirSync(path.dirname(p), { recursive: true });
    try { mkdirSync(p); } catch { throw new Error(`${p} exists already; not touching it`); }
    owned.push(p);
  }
  const r = run(['bun', 'scripts/new-film.ts', ID, '--style', 'nebula']);
  if (r.code === 0) owned.push(FILM);
  step('new-film', r);
  const filmTs = path.join(FILM, 'film.ts');
  writeFileSync(filmTs, readFileSync(filmTs, 'utf8')
    .replace(/import style from '..\/..\/styles\/nebula';/, "import nebula from '../../styles/nebula';\nimport paper from '../../styles/paper-dawn';")
    .replace('selectStyle([style]);', 'selectStyle([nebula, paper]);'));

  // 1. imports
  const video = path.join(WORK, 'numbered.mp4'), gray = path.join(WORK, 'gray.mp4');
  await makeNumberedVideo(video, 6, 30);
  step('gray video', run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x808080:s=1920x1080:r=30:d=2', '-c:v', 'libx264', '-crf', '10', '-pix_fmt', 'yuv420p', gray]));
  // one click inside the edit (1 s) and one in the part it cuts (2.5 s)
  const events = path.join(WORK, 'events.jsonl'), grayEvents = path.join(WORK, 'gray.jsonl');
  writeFileSync(events, '{"t": 11, "type": "click", "x": 1500, "y": 300}\n{"t": 12.5, "type": "click", "x": 1500, "y": 300}\n');
  writeFileSync(grayEvents, '{"t": 0.51, "type": "click", "x": 400, "y": 200}\n');
  step('import-capture num', run(['bun', 'scripts/import-capture.ts', '--film', ID, '--id', 'num', video, '--events', events, '--sync', '10=0']));
  step('import-capture gray', run(['bun', 'scripts/import-capture.ts', '--film', ID, '--id', 'gray', gray, '--crop', '960:540:100:50', '--events', grayEvents, '--sync', '0=0']));
  const manifest = path.join(FILM, 'captures', 'num.json');
  const asset: CaptureAsset = JSON.parse(readFileSync(manifest, 'utf8'));
  const grayAsset: CaptureAsset = JSON.parse(readFileSync(path.join(FILM, 'captures', 'gray.json'), 'utf8'));
  if (asset.frames !== 180 || asset.events.length !== 2) failures.push(`import: ${asset.frames} frames and ${asset.events.length} events, expected 180 and 2`);
  else ok('import: 180 frames for 6 s at 30 fps, 2 events');
  const gc = grayAsset.crop;
  if (grayAsset.frames !== 60 || grayAsset.width !== 960 || grayAsset.height !== 540 || !gc || gc.x !== 100 || gc.y !== 50 || grayAsset.viewport.width !== 1920)
    failures.push(`import --crop: ${grayAsset.frames} frames ${grayAsset.width}x${grayAsset.height}, crop ${JSON.stringify(gc)}, viewport ${JSON.stringify(grayAsset.viewport)}`);
  else ok('import --crop: 60 frames of 960x540, crop origin (100, 50) and the source viewport recorded');

  // the film: lead (7 frames), cap, gray
  writeFileSync(path.join(FILM, 'scenes', 'index.ts'), "import './cap';\n");
  writeFileSync(path.join(FILM, 'scenes', 'cap.ts'), `import { background, demoScene, scene } from '../../../engine';
import num from '../captures/num.json';
import gray from '../captures/gray.json';

const flat = { bloom: 0, ca: 0, vig: 0, grain: 0, sat: 1, split: 0 };
scene({ name: 'lead', kind: 'page', dur: ${LEAD} / 30, fi: 0, fo: 0, subs: [], draw: () => background() });
demoScene({ name: 'cap', asset: num as never, edit: ${JSON.stringify(EDIT)}, rect: { x: 0, y: 0, w: 1920, h: 1080 }, fi: 0, fo: 0, mb: 3, grade: flat });
demoScene({ name: 'gray', asset: gray as never, title: 'crop', fi: 0, fo: 0, mb: 3, grade: flat });
`);
  for (const f of ['title.ts', 'idea.ts', 'end.ts']) rmSync(path.join(FILM, 'scenes', f), { force: true });
  step('fonts', run(['bun', 'scripts/fonts.ts', '--film', ID]));
  step('build', run(['bunx', 'vite', 'build'], { FILM: ID }));

  // 2, 3. export in each style; read every frame
  for (const style of STYLES) {
    const mp4 = path.join(WORK, `out-${style}.mp4`);
    step(`export ${style}`, run(['bun', 'scripts/export.ts', '--film', ID, '--style', style, '--noaudio', '--workers', '2', '--out', mp4]));
    const wrong: string[] = [];
    const keep = new Map<number, Uint8Array>();
    const n = await eachFrame(mp4, (f, px) => {
      if (f >= LEAD && f < LEAD + CAP) {
        const got = readBarcode(px, W), want = capSource(f - LEAD);
        if (got !== want) wrong.push(`${f}: ${got} != ${want}`);
      }
      if ([13, 14, 15, 50].some((l) => f === LEAD + CAP + l)) keep.set(f, px.slice());
    });
    if (n !== TOTAL) failures.push(`${style}: export has ${n} frames, expected ${TOTAL}`);
    if (wrong.length) failures.push(`${style}: ${wrong.length} frame(s) show the wrong source frame: ${wrong.slice(0, 8).join(', ')}`);
    if (n === TOTAL && !wrong.length) ok(`${style}: ${TOTAL} frames; the demo starting at frame ${LEAD} shows exactly the expected source frame in all ${CAP}`);
    const comp = keep.size === 4 ? grayChecks(style, keep) : [`${style}: gray scene frames missing`];
    failures.push(...comp);
    if (!comp.length) ok(`${style}: cursor tip at the cropped footage's (300, 150); the click shows on its frame, not before`);
  }

  // 4. validate
  const v = run(['bun', 'scripts/validate.ts', '--film', ID, '--json']);
  const diags: { level: string; code: string; message?: string }[] = JSON.parse(v.out || '[]');
  const errs = diags.filter((d) => d.level === 'error'), cuts = diags.filter((d) => d.code === 'capture-event-cut');
  if (v.code !== 0 || errs.length) failures.push(`validate: expected no errors, got ${errs.map((d) => `${d.code} ${d.message ?? ''}`).join('; ')}`);
  if (cuts.length !== 1) failures.push(`validate: expected one capture-event-cut warning, got ${cuts.length}`);
  if (v.code === 0 && !errs.length && cuts.length === 1) ok('validate: no errors; the cut click is one warning');

  // 5. a missing frame fails the render: at 1.5 s = output frame 45 = local frame 38 of cap = source frame 38
  const dir = path.join(MEDIA, 'num'), victim = path.join(dir, '00038.jpg');
  renameSync(victim, `${victim}.bak`);
  const shot = run(['bun', 'scripts/export.ts', '--film', ID, '--shots', '1.5', '--dir', path.join(WORK, 'shots')]);
  renameSync(`${victim}.bak`, victim);
  if (shot.code === 0) failures.push('missing frame: rendering succeeded, expected a failure');
  else ok('missing frame: rendering fails instead of drawing a placeholder');

  // 6. a failed re-import changes nothing
  const before = readFileSync(manifest, 'utf8');
  const bad = path.join(WORK, 'bad.jsonl');
  writeFileSync(bad, 'not json\n');
  const fi = run(['bun', 'scripts/import-capture.ts', '--film', ID, '--id', 'num', path.join(WORK, 'gray.mp4'), '--events', bad, '--sync', '0=0']);
  const frames = () => (existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.jpg')).length : 0);
  const staged = readdirSync(MEDIA).filter((n) => n.startsWith('.'));
  if (fi.code === 0 || readFileSync(manifest, 'utf8') !== before || frames() !== 180 || staged.length)
    failures.push(`failed import: exit ${fi.code}, manifest ${readFileSync(manifest, 'utf8') === before ? 'kept' : 'changed'}, ${frames()} frames (expected 180), left behind: ${staged.join(', ') || 'nothing'}`);
  else ok('failed import: manifest and frames unchanged, nothing staged left behind');

  // 7. --rebuild: a path as id is refused; a cleared cache is re-derived; a changed source is refused, frames kept
  const evil = path.join(FILM, 'captures', 'evil.json');
  writeFileSync(evil, JSON.stringify({ ...asset, id: `../../../films/${ID}` }));
  const ev = run(['bun', 'scripts/import-capture.ts', '--film', ID, '--rebuild', '--from', WORK]);
  rmSync(evil);
  if (ev.code === 0 || !/id/.test(ev.err) || !existsSync(path.join(FILM, 'main.ts'))) failures.push(`rebuild: a manifest with a path as id was not refused (exit ${ev.code}): ${ev.err.trim()}`);
  else ok('rebuild: a manifest whose id is a path is refused before anything is touched');
  rmSync(dir, { recursive: true, force: true });
  const rb = run(['bun', 'scripts/import-capture.ts', '--film', ID, '--rebuild', '--from', WORK]);
  if (rb.code !== 0 || frames() !== 180) failures.push(`rebuild: exit ${rb.code}, ${frames()} frames (expected 0 and 180): ${rb.err.trim()}`);
  else ok('rebuild: the cleared cache is re-derived from the source, 180 frames');
  await makeNumberedVideo(video, 5, 30); // a different file under the same name
  const ch = run(['bun', 'scripts/import-capture.ts', '--film', ID, '--rebuild', '--from', WORK]);
  if (ch.code === 0 || !/sha256/.test(ch.err) || frames() !== 180) failures.push(`rebuild: a changed source was accepted or the frames were touched (exit ${ch.code}, ${frames()} frames)`);
  else ok('rebuild: a source whose sha256 differs is refused; the frames stay');

  // 8. a scripted web capture (Playwright): every recorded click lands where the page itself marks it, on time
  step('capture', run(['bun', 'scripts/capture.ts', '--film', ID, '--id', 'web', path.join(ROOT, 'scripts', 'test-fixtures', 'capture-scenario.ts'), '--sources', path.join(WORK, 'sources')]));
  const web: CaptureAsset = JSON.parse(readFileSync(path.join(FILM, 'captures', 'web.json'), 'utf8'));
  const clicks = web.events.filter((e) => e.type === 'click');
  if (clicks.length !== 4) failures.push(`capture: ${clicks.length} clicks recorded, expected 4`);
  const webDir = path.join(MEDIA, 'web');
  const problems: string[] = [];
  for (const [k, e] of clicks.entries()) {
    if (!e.target?.startsWith('div#b') || !e.box || !(e.x! >= e.box.x && e.x! <= e.box.x + e.box.w && e.y! >= e.box.y && e.y! <= e.box.y + e.box.h))
      problems.push(`click ${k}: target ${e.target} / box ${JSON.stringify(e.box)} missing or not around (${e.x}, ${e.y})`);
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
  else if (clicks.length === 4) ok('capture: 4 clicks with target and box, each marked by the page within 4 px and 0–2 frames of the recorded event');
} catch (e) {
  failures.push(e instanceof Error ? e.message : String(e));
} finally {
  for (const p of owned) rmSync(p, { recursive: true, force: true });
}
for (const m of failures) console.log(`FAIL  ${m}`);
console.log(`${failures.length ? 'FAIL' : 'PASS'} test-capture${owned.some((p) => existsSync(p)) ? ' (fixture left behind!)' : ''}`);
process.exit(failures.length ? 1 : 0);
