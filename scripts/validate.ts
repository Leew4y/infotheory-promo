/**
 * Static checks of a built film, for people and agents.
 *
 *   just build <id> && bun scripts/validate.ts --film <id> [--style <id>] [--dist dist/<id>] [--json]
 *
 * Without --style every style of the film is checked (the page's __styles, default first); with it, that one.
 * - page load: the page renders the requested film; film and scene declarations satisfy FilmSpec / SceneSpec
 *   (engine/schema.ts); no page errors
 * - timeline: scenes start at 0, are contiguous (no gap, no overlap) and end at the film's duration
 * - render: each sampled frame renders without error (this includes the bundled-font glyph check in text())
 * - layout: at 0 / 25 / 50 / 75 % and the last frame of every scene (no motion blur), every visible text box
 *   (alpha >= 0.02 after the scene's fade, after the camera transform) lies inside the frame and inside the safe area
 *   (5 % each side); both are errors. Five frames per scene are a sample: nothing is proved
 *   about the frames in between.
 * Diagnostics: { level, code, path, message }, also written to out/<film>/validate.json. With --json, stdout is only
 * the JSON list and the summary goes to stderr. Exit code 1 on any error, 2 if the tool itself could not run.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';
import { chromeArgs, findChrome, loadFilm, serveDist } from './chrome';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const VALUED = ['film', 'style', 'dist'], FLAGS = ['json'];
for (let i = 0; i < argv.length; i++) {
  const k = argv[i].replace(/^--/, '');
  if (!argv[i].startsWith('--') || ![...VALUED, ...FLAGS].includes(k)) { console.error(`unknown argument: ${argv[i]}`); process.exit(2); }
  if (VALUED.includes(k)) i++;
}
const opt = (k: string, d: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const JSON_OUT = argv.includes('--json');
const FILM = opt('film', '');
if (!FILM) { console.error('--film <id> is required (one of films/*)'); process.exit(2); }
/** One of the film's styles (?style=<id>); omitted: all of them. */
const STYLE = opt('style', '');
const DIST = path.resolve(ROOT, opt('dist', `dist/${FILM}`));
const FPS = 30, W = 1920, H = 1080, SAFE = 0.05, MIN_ALPHA = 0.02;
const OUT = path.join(ROOT, 'out', FILM, 'validate.json');

interface Diag { level: 'error' | 'warning'; style: string; code: string; path: string; message: string }
const diags: Diag[] = [];
/** The style being checked ('default' until the default page has loaded and named it). */
let cur = STYLE || 'default';
const err = (code: string, p: string, message: string) => diags.push({ level: 'error', style: cur, code, path: p, message });

let CHROME = '';
try { CHROME = findChrome(); } catch (e) { console.error((e as Error).message); process.exit(2); }
if (!existsSync(path.join(DIST, 'index.html'))) { console.error(`${DIST}/index.html missing: run \`just build ${FILM}\``); process.exit(2); }

const server = serveDist(DIST);
let browser: Browser | null = null;
let scenesChecked = 0, framesChecked = 0, boxesChecked = 0, toolError: string | null = null;
const checked: string[] = [];
try {
  browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
    args: chromeArgs('platform'),
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => err('page-error', 'page', e instanceof Error ? e.message : String(e)));
  page.on('console', (m) => m.type() === 'error' && err('console-error', 'page', m.text()));

  /** Load the film in one style (`id` '' = the default) and check it; returns the page's style list when it loaded. */
  const checkStyle = async (id: string): Promise<string[] | null> => {
    let ready = false;
    try {
      // fails fast when the page throws (e.g. a declaration fails its schema), names no or another style, or is not ready
      await loadFilm(page, server.url, FILM, id, 30_000);
      ready = true;
    } catch (e) {
      err('page-load', 'page', `film did not load: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!ready) return null;
    const pageStyle: string = await page.evaluate(() => window.__style);
    const styles: string[] = await page.evaluate(() => window.__styles);
    for (const d of diags) if (d.style === cur) d.style = pageStyle;
    cur = pageStyle;
    checked.push(pageStyle);
    const pageFilm: string | undefined = await page.evaluate(() => window.__film);
    if (pageFilm !== FILM) err('film-mismatch', 'page', `the built page renders film "${pageFilm}", not "${FILM}"`);
    else {
      const scenes: { name: string; start: number; end: number }[] = await page.evaluate(() => window.__scenes());
      const duration: number = await page.evaluate(() => window.__duration);
      const eps = 1e-6;
      if (!scenes.length) err('timeline-empty', 'timeline', 'no scenes registered');
      else {
        if (Math.abs(scenes[0].start) > eps) err('timeline-start', `scene:${scenes[0].name}`, `first scene starts at ${scenes[0].start}s, not 0`);
        for (let i = 1; i < scenes.length; i++) {
          const gap = scenes[i].start - scenes[i - 1].end;
          if (gap > eps) err('timeline-gap', `scene:${scenes[i].name}`, `${gap.toFixed(3)}s gap after "${scenes[i - 1].name}"`);
          if (gap < -eps) err('timeline-overlap', `scene:${scenes[i].name}`, `overlaps "${scenes[i - 1].name}" by ${(-gap).toFixed(3)}s`);
        }
        const end = scenes[scenes.length - 1].end;
        if (Math.abs(end - duration) > 1e-3) err('timeline-end', `scene:${scenes[scenes.length - 1].name}`, `last scene ends at ${end}s, film is ${duration}s`);
      }
      const sx0 = W * SAFE, sx1 = W * (1 - SAFE), sy0 = H * SAFE, sy1 = H * (1 - SAFE);
      for (const s of scenes) {
        scenesChecked++;
        const d = s.end - s.start;
        for (const [tag, t] of [['0%', s.start], ['25%', s.start + d * 0.25], ['50%', s.start + d * 0.5], ['75%', s.start + d * 0.75], ['end', s.end - 1 / FPS]] as const) {
          framesChecked++;
          let boxes: { s: string; x0: number; y0: number; x1: number; y1: number; alpha: number }[];
          try {
            boxes = await page.evaluate((t) => window.__layout(t, 30), t);
          } catch (e) {
            // the film failed to render this frame (e.g. a character no bundled font covers)
            err('render-error', `scene:${s.name}@${tag}(${t.toFixed(2)}s)`, (e instanceof Error ? e.message : String(e)).split(/\r?\n/)[0]);
            continue;
          }
          for (const b of boxes) {
            if (!(b.alpha >= MIN_ALPHA)) continue;
            boxesChecked++;
            const where = `scene:${s.name}@${tag}(${t.toFixed(2)}s)`;
            const box = `[${b.x0.toFixed(0)},${b.y0.toFixed(0)}]-[${b.x1.toFixed(0)},${b.y1.toFixed(0)}]`;
            if (b.x0 < 0 || b.y0 < 0 || b.x1 > W || b.y1 > H) err('text-overflow', where, `"${b.s}" ${box} leaves the frame (alpha ${b.alpha.toFixed(2)})`);
            else if (b.x0 < sx0 || b.y0 < sy0 || b.x1 > sx1 || b.y1 > sy1) err('text-safe-area', where, `"${b.s}" ${box} is outside the ${SAFE * 100}% safe area (alpha ${b.alpha.toFixed(2)})`);
          }
        }
      }
    }
    return styles;
  };

  if (STYLE) await checkStyle(STYLE);
  else {
    const styles = await checkStyle('');
    const def = checked[0];
    for (const id of styles ?? []) if (id !== def) { cur = id; await checkStyle(id); }
  }
} catch (e) {
  toolError = e instanceof Error ? e.message : String(e);
  err('tool-error', 'validate', `validate could not finish: ${toolError}`);
} finally {
  await browser?.close().catch(() => {});
  server.stop();
}

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ film: FILM, styles: checked, scenesChecked, framesChecked, boxesChecked, diagnostics: diags }, null, 1));
const errors = diags.filter((d) => d.level === 'error').length, warnings = diags.length - errors;
const summary = `${errors ? 'FAIL' : 'PASS'} validate ${FILM} [${checked.join(', ') || 'no style loaded'}]: ${scenesChecked} scenes, ${framesChecked} frames, ${boxesChecked} text boxes, ${errors} error(s), ${warnings} warning(s) -> ${OUT}`;
if (JSON_OUT) {
  console.log(JSON.stringify(diags, null, 1));
  console.error(summary);
} else {
  for (const d of diags.slice(0, 40)) console.log(`${d.level}: [${d.style}] ${d.code} ${d.path}: ${d.message}`);
  console.log(summary);
}
process.exit(toolError ? 2 : errors ? 1 : 0);
