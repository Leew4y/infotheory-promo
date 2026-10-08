/**
 * Contact sheet of a film in its styles, for reviewing a look (agent self-review and people):
 *
 *   bun scripts/sheet.ts --film <id> [--style a,b] [--times 4,39.5] [--out out/<id>/sheet]     (just sheet <film> ...)
 *
 * The same moments in every style, chosen from the film (unless --times): the middle of the first full-frame plate,
 * of the first three page scenes and of the last scene; a frame with a caption on screen; the middle of the fade-out
 * of the first page scene that has one. Each frame is rendered as exported (motion blur), saved as
 * <out>/<style>/t<time>.jpg, and the sheet <out>/sheet.jpg puts the moments in rows and the styles in columns
 * (each cell 960x540). <out>/sheet.json lists the cells: row, column, time, scene, what the moment is, style, file.
 * Styles default to all of the film's. Needs ffmpeg. Exit code 1 if a frame cannot be rendered.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeArgs, findChrome, loadFilm, serveDist } from './chrome';
import { requireFilm } from './film-arg';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const opt = (k: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : undefined);
const FILM = requireFilm(argv);
const OUT = path.resolve(ROOT, opt('out') ?? `out/${FILM}/sheet`);
const DIST = path.join(ROOT, 'dist', FILM);

interface Scene { name: string; kind: string; start: number; end: number; fadeIn: number; fadeOut: number; subs: [number, number][] }
interface Moment { t: number; scene: string; what: string }

/** The representative moments of a film (see the header). */
function moments(scenes: Scene[]): Moment[] {
  const mid = (s: Scene) => +((s.start + s.end) / 2).toFixed(2);
  const out: Moment[] = [];
  const add = (t: number, scene: string, what: string) => { if (!out.some((m) => Math.abs(m.t - t) < 0.5)) out.push({ t, scene, what }); };
  const plate = scenes.find((s) => s.kind === 'plate');
  if (plate) add(mid(plate), plate.name, 'full-frame plate');
  for (const s of scenes.filter((s) => s.kind === 'page').slice(0, 3)) add(mid(s), s.name, 'page');
  const cap = scenes.find((s) => s.subs.length);
  if (cap) add(+((cap.subs[0][0] + cap.subs[0][1]) / 2).toFixed(2), cap.name, 'caption');
  const fade = scenes.find((s) => s.kind === 'page' && s.fadeOut > 0);
  if (fade) add(+(fade.end - fade.fadeOut / 2).toFixed(2), fade.name, 'fade-out');
  const last = scenes[scenes.length - 1];
  add(mid(last), last.name, 'last scene');
  return out.sort((a, b) => a.t - b.t);
}

const server = serveDist(DIST);
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }, args: chromeArgs('platform') });
let code = 0;
try {
  const page = await browser.newPage();
  const first = await loadFilm(page, server.url, FILM, '');
  const styles = opt('style') ? opt('style')!.split(',') : first.styles;
  const scenes: Scene[] = await page.evaluate(() => window.__scenes());
  const fps: number = await page.evaluate(() => window.__timeline().fps);
  const ms: Moment[] = opt('times')
    ? opt('times')!.split(',').map(Number).map((t) => ({ t, scene: scenes.find((s) => t >= s.start && t < s.end)?.name ?? '?', what: 'requested' }))
    : moments(scenes);
  rmSync(OUT, { recursive: true, force: true });
  const cells: { row: number; col: number; t: number; scene: string; what: string; style: string; file: string }[] = [];
  for (const [col, style] of styles.entries()) {
    await loadFilm(page, server.url, FILM, style);
    mkdirSync(path.join(OUT, style), { recursive: true });
    for (const [row, m] of ms.entries()) {
      const url: string = await page.evaluate((t, f) => window.__frame(t, f), m.t, fps);
      const file = path.join(OUT, style, `t${m.t.toFixed(2).padStart(7, '0')}.jpg`);
      writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
      cells.push({ row, col, t: m.t, scene: m.scene, what: m.what, style, file: path.relative(ROOT, file).replace(/\\/g, '/') });
    }
  }
  // the grid: rows = moments, columns = styles
  const n = cells.length;
  const inputs = cells.flatMap((c) => ['-i', path.join(ROOT, c.file)]);
  const scale = cells.map((_, i) => `[${i}:v]scale=960:540[s${i}]`).join(';');
  const layout = cells.map((c) => `${c.col * 960}_${c.row * 540}`).join('|');
  const filter = n === 1 ? '[0:v]scale=960:540[o]' : `${scale};${cells.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${n}:layout=${layout}[o]`;
  const sheet = path.join(OUT, 'sheet.jpg');
  const p = Bun.spawnSync(['ffmpeg', '-v', 'error', '-y', ...inputs, '-filter_complex', filter, '-map', '[o]', '-q:v', '3', sheet], { stderr: 'pipe' });
  if (p.exitCode !== 0) throw new Error(`ffmpeg: ${p.stderr.toString().trim()}`);
  writeFileSync(path.join(OUT, 'sheet.json'), JSON.stringify({ film: FILM, styles, moments: ms, sheet: path.relative(ROOT, sheet).replace(/\\/g, '/'), cell: [960, 540], cells }, null, 1));
  console.log(`${ms.length} moments x ${styles.length} style(s) -> ${sheet}`);
  for (const m of ms) console.log(`  ${m.t.toFixed(2).padStart(7)}s  ${m.scene.padEnd(14)} ${m.what}`);
} catch (e) {
  console.error(`sheet failed: ${e instanceof Error ? e.message : String(e)}`);
  code = 1;
} finally {
  await browser.close().catch(() => {});
  server.stop();
}
process.exit(code);
