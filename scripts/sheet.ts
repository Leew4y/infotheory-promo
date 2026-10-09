/**
 * Contact sheet of a film in its styles, for reviewing a look (agent self-review and people):
 *
 *   bun scripts/sheet.ts --film <id> [--style a,b] [--times 4,39.5] [--out out/<id>/sheet]     (just sheet <film> ...)
 *
 * The same moments in every style, chosen from the film (unless --times): the middle of the first full-frame plate,
 * of the first three page scenes and of the last scene; a frame with a caption on screen; the middle of the fade-out
 * of the first page scene that has one. Moments are kept inside their scene's frames, one per frame (a short scene
 * still gets its own), and taken over all selected styles (their fade lengths may differ). Requested times must be
 * finite and inside the film. Each frame is rendered as exported (motion blur) to <out>/<style>/r<row>-t<time>.jpg;
 * <out>/sheet.jpg puts moments in rows and styles in columns (cells 960x540); <out>/sheet.json lists the cells.
 * Everything is written to a temporary directory first and then replaces <out> as a whole, and only if <out> is a
 * previous sheet (it has a sheet.json) or does not exist: any other directory is refused, never emptied.
 * Styles default to all of the film's; with --style the first one listed loads the film. Needs ffmpeg.
 * Exit code 1 on failure, 2 on bad arguments.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeArgs, findChrome, loadFilm, serveDist } from './chrome';
import { requireFilm } from './film-arg';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const opt = (k: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : undefined);
const usage = (msg: string): never => { console.error(msg); process.exit(2); };
const FILM = requireFilm(argv);
const OUT = path.resolve(ROOT, opt('out') ?? `out/${FILM}/sheet`);
const DIST = path.join(ROOT, 'dist', FILM);
if (existsSync(OUT) && !existsSync(path.join(OUT, 'sheet.json')) && readdirSync(OUT).length)
  usage(`--out ${OUT} exists and is not a previous sheet (no sheet.json): refusing to replace it`);
const STYLES = opt('style')?.split(',').filter(Boolean);
const TIMES = opt('times')?.split(',').map(Number);
if (TIMES && TIMES.some((t) => !Number.isFinite(t) || t < 0)) usage(`--times must be finite, non-negative seconds: ${opt('times')}`);

interface Scene { name: string; kind: string; start: number; end: number; fadeIn: number; fadeOut: number; subs: [number, number][] }
interface Moment { t: number; frame: number; scene: string; what: string }

/** The representative moments of a film in one style (see the header), each inside its scene's frames. */
function moments(scenes: Scene[], fps: number): Moment[] {
  const out: Moment[] = [];
  const at = (s: Scene, t: number, what: string) => {
    const f0 = Math.ceil(s.start * fps - 1e-9), f1 = Math.max(f0, Math.ceil(s.end * fps - 1e-9) - 1);
    const frame = Math.min(f1, Math.max(f0, Math.round(t * fps)));
    if (!out.some((m) => m.frame === frame)) out.push({ t: +(frame / fps).toFixed(4), frame, scene: s.name, what });
  };
  const mid = (s: Scene) => (s.start + s.end) / 2;
  const plate = scenes.find((s) => s.kind === 'plate');
  if (plate) at(plate, mid(plate), 'full-frame plate');
  for (const s of scenes.filter((s) => s.kind === 'page').slice(0, 3)) at(s, mid(s), 'page');
  const cap = scenes.find((s) => s.subs.length);
  if (cap) at(cap, (cap.subs[0][0] + cap.subs[0][1]) / 2, 'caption');
  const fade = scenes.find((s) => s.kind === 'page' && s.fadeOut > 0);
  if (fade) at(fade, fade.end - Math.min(fade.fadeOut, fade.end - fade.start) / 2, 'fade-out');
  const last = scenes[scenes.length - 1];
  if (last) at(last, mid(last), 'last scene');
  return out;
}

const server = serveDist(DIST);
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }, args: chromeArgs('platform') });
const TMP = `${OUT}.${process.pid}.tmp`;
let code = 0;
try {
  const page = await browser.newPage();
  const first = await loadFilm(page, server.url, FILM, STYLES?.[0] ?? '');
  const styles = STYLES ?? first.styles;
  for (const s of styles) if (!first.styles.includes(s)) usage(`--style ${s} is not one of the film's styles (${first.styles.join(', ')})`);
  const fps: number = await page.evaluate(() => window.__timeline().fps);
  const duration: number = await page.evaluate(() => window.__duration);
  // the moments, over all selected styles
  let ms: Moment[] = [];
  if (TIMES) {
    if (TIMES.some((t) => t >= duration)) usage(`--times must be inside the film (0 .. ${duration}s): ${opt('times')}`);
    const scenes: Scene[] = await page.evaluate(() => window.__scenes());
    ms = TIMES.map((t) => ({ t, frame: Math.round(t * fps), scene: scenes.find((s) => t >= s.start && t < s.end)?.name ?? '?', what: 'requested' }));
  } else {
    for (const style of styles) {
      await loadFilm(page, server.url, FILM, style);
      for (const m of moments(await page.evaluate(() => window.__scenes()), fps)) if (!ms.some((x) => x.frame === m.frame)) ms.push(m);
    }
    ms.sort((a, b) => a.t - b.t);
  }
  rmSync(TMP, { recursive: true, force: true });
  const cells: { row: number; col: number; t: number; scene: string; what: string; style: string; file: string }[] = [];
  for (const [col, style] of styles.entries()) {
    await loadFilm(page, server.url, FILM, style);
    mkdirSync(path.join(TMP, style), { recursive: true });
    for (const [row, m] of ms.entries()) {
      const url: string = await page.evaluate((t, f) => window.__frame(t, f), m.t, fps);
      const name = `r${String(row).padStart(2, '0')}-t${m.t.toFixed(3)}.jpg`;
      writeFileSync(path.join(TMP, style, name), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
      cells.push({ row, col, t: m.t, scene: m.scene, what: m.what, style, file: `${style}/${name}` });
    }
  }
  // the grid: rows = moments, columns = styles
  const n = cells.length;
  const inputs = cells.flatMap((c) => ['-i', path.join(TMP, c.file)]);
  const scale = cells.map((_, i) => `[${i}:v]scale=960:540[s${i}]`).join(';');
  const layout = cells.map((c) => `${c.col * 960}_${c.row * 540}`).join('|');
  const filter = n === 1 ? '[0:v]scale=960:540[o]' : `${scale};${cells.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${n}:layout=${layout}[o]`;
  const p = Bun.spawnSync(['ffmpeg', '-v', 'error', '-y', ...inputs, '-filter_complex', filter, '-map', '[o]', '-q:v', '3', path.join(TMP, 'sheet.jpg')], { stderr: 'pipe' });
  if (p.exitCode !== 0) throw new Error(`ffmpeg: ${p.stderr.toString().trim()}`);
  writeFileSync(path.join(TMP, 'sheet.json'), JSON.stringify({ film: FILM, fps, styles, moments: ms, sheet: 'sheet.jpg', cell: [960, 540], cells }, null, 1));
  // publish: replace the previous sheet (checked above) as a whole
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(path.dirname(OUT), { recursive: true });
  renameSync(TMP, OUT);
  console.log(`${ms.length} moments x ${styles.length} style(s) -> ${path.join(OUT, 'sheet.jpg')}`);
  for (const m of ms) console.log(`  ${m.t.toFixed(2).padStart(7)}s  ${m.scene.padEnd(14)} ${m.what}`);
} catch (e) {
  console.error(`sheet failed: ${e instanceof Error ? e.message : String(e)}`);
  code = 1;
} finally {
  rmSync(TMP, { recursive: true, force: true });
  await browser.close().catch(() => {});
  server.stop();
}
process.exit(code);
