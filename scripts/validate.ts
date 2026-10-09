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
 * - overlap: on the same frames, two text boxes that intersect by more than 2 px each way: an error when both are
 *   fully shown (alpha >= 0.9), a warning when both are at least half shown.
 * - contrast: on the same frames, rendered as exported (motion blur), each text box against what is under it, glyph by
 *   glyph (engine/inspect.ts), WCAG AA: 4.5, large text (>= 24 px, or >= 18.66 px bold) 3. Below AA: an error for
 *   fully shown text, a warning for text at 0.5–0.9 alpha; text below 0.5 alpha is counted as unchecked in the report.
 *   Boxes are axis-aligned and sampled on five frames per scene: a heuristic, not a proof of glyph-level legibility.
 * Diagnostics: { level, code, path, message }, also written to out/<film>/validate.json. With --json, stdout is only
 * the JSON list and the summary goes to stderr. Exit code 1 on any error, 2 if the tool itself could not run.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';
import { chromeArgs, findChrome, loadFilm, serveDist } from './chrome';
import { filmArg, mediaDir } from './film-arg';

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
const filmR = filmArg(argv);
if (filmR.error !== undefined) {
  // a usage error still answers in the diagnostics format
  const d = [{ level: 'error', code: 'usage', path: 'argv', message: filmR.error }];
  if (argv.includes('--json')) console.log(JSON.stringify(d, null, 1));
  console.error(filmR.error);
  process.exit(2);
}
const FILM = filmR.film;
/** One of the film's styles (?style=<id>); omitted: all of them. */
const STYLE = opt('style', '');
const DIST = path.resolve(ROOT, opt('dist', `dist/${FILM}`));
const W = 1920, H = 1080, SAFE = 0.05, MIN_ALPHA = 0.02;
/** Text at least this opaque counts as fully shown (overlap and contrast checks); WCAG large text: 24 px, or 18.66 px bold. */
const FULL_ALPHA = 0.9, HALF_ALPHA = 0.5, LARGE_PX = 24, LARGE_BOLD_PX = 18.66;
const OUT = path.join(ROOT, 'out', FILM, 'validate.json');

interface Diag { level: 'error' | 'warning'; style: string; code: string; path: string; message: string }
const diags: Diag[] = [];
/** The style being checked ('default' until the default page has loaded and named it). */
let cur = STYLE || 'default';
const err = (code: string, p: string, message: string) => diags.push({ level: 'error', style: cur, code, path: p, message });
const warn = (code: string, p: string, message: string) => diags.push({ level: 'warning', style: cur, code, path: p, message });

let CHROME = '';
try { CHROME = findChrome(); } catch (e) { console.error((e as Error).message); process.exit(2); }
if (!existsSync(path.join(DIST, 'index.html'))) { console.error(`${DIST}/index.html missing: run \`just build ${FILM}\``); process.exit(2); }

const server = serveDist(DIST, { media: mediaDir(FILM) });
let browser: Browser | null = null;
let scenesChecked = 0, framesChecked = 0, boxesChecked = 0, contrastChecked = 0, contrastUnchecked = 0, toolError: string | null = null;
const checked: string[] = [];
const noted = new Set<string>();
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
    const { unplaced } = await page.evaluate(() => window.__narration());
    for (const id of unplaced) if (!noted.has(`unplaced|${id}`)) { noted.add(`unplaced|${id}`); err('narration-unplaced', `narration:${id}`, `narration line "${id}" is placed in no scene (narratedScene / demoScene narration)`); }
    // notes the film recorded while registering (engine/notes.ts) are warnings, once (they recur in every style)
    for (const n of await page.evaluate(() => window.__notes())) {
      const k = `${n.code}|${n.path}|${n.message}`;
      if (!noted.has(k)) { noted.add(k); warn(n.code, n.path, n.message); }
    }
    const pageFilm: string | undefined = await page.evaluate(() => window.__film);
    if (pageFilm !== FILM) err('film-mismatch', 'page', `the built page renders film "${pageFilm}", not "${FILM}"`);
    else {
      const scenes: { name: string; start: number; end: number }[] = await page.evaluate(() => window.__scenes());
      const FPS: number = await page.evaluate(() => window.__timeline().fps);
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
            boxes = await page.evaluate((t, fps) => window.__layout(t, fps), t, FPS);
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
          const where = `scene:${s.name}@${tag}(${t.toFixed(2)}s)`;
          // overlapping text boxes (more than 2 px each way): an error when both are fully shown, a warning when both are
          // at least half shown (steady semi-transparent text, or the middle of a crossfade)
          const shown = boxes.filter((b) => b.alpha >= HALF_ALPHA);
          for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
            const a = shown[i], b = shown[j];
            const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
            if (w <= 2 || h <= 2) continue;
            const full = a.alpha >= FULL_ALPHA && b.alpha >= FULL_ALPHA;
            (full ? err : warn)(full ? 'text-overlap' : 'text-overlap-partial', where, `"${a.s}" and "${b.s}" overlap by ${w.toFixed(0)}x${h.toFixed(0)} px${full ? '' : ` (alpha ${a.alpha.toFixed(2)} / ${b.alpha.toFixed(2)})`}`);
          }
          // contrast of each text box against what is under it, as exported (engine/inspect.ts); WCAG AA: 4.5, large 3.
          // Fully shown text below AA is an error; text shown at 0.5–0.9 alpha is judged at that alpha and reported as a
          // warning (it may be a fade in progress); text below 0.5 alpha is not judged and is counted as unchecked.
          const cs: { s: string; px: number; weight: number; alpha: number; ratio: number; text: number[]; bg: number[] }[] = await page.evaluate((t, fps) => window.__contrast(t, fps), t, FPS);
          contrastChecked += cs.length;
          contrastUnchecked += boxes.filter((b) => b.alpha >= MIN_ALPHA && b.alpha < HALF_ALPHA).length;
          for (const c of cs) {
            const large = c.px >= LARGE_PX || (c.px >= LARGE_BOLD_PX && c.weight >= 700);
            const need = large ? 3 : 4.5;
            if (c.ratio >= need) continue;
            const rgb = (v: number[]) => `rgb(${v.map((x) => Math.round(x)).join(',')})`;
            const msg = `"${c.s}" (${c.px.toFixed(0)} px${large ? ', large' : ''}, alpha ${c.alpha.toFixed(2)}) contrast ${c.ratio.toFixed(2)} < ${need}: ${rgb(c.text)} on ${rgb(c.bg)}`;
            if (c.alpha >= FULL_ALPHA) err('text-contrast', where, msg);
            else warn('text-contrast-partial', where, msg);
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
writeFileSync(OUT, JSON.stringify({ film: FILM, styles: checked, scenesChecked, framesChecked, boxesChecked, contrastChecked, contrastUnchecked, diagnostics: diags }, null, 1));
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
