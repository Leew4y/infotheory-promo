/**
 * Render a film's covers (engine/cover.ts) to out/<film>/covers/<name>.png and <name>.jpg:
 *
 *   bun scripts/covers.ts --film <id> [--style <id>] [--only <name,name>]     (just covers)
 *
 * Each cover is rendered in a fresh page (a cover changes the page's frame size), through the frame pipeline at its
 * own size. Its text boxes are checked: outside the image is an error, outside the 5 % safe margin a warning (a
 * platform crops or overlays the edges). The JPEG (quality 92, sRGB) is for upload forms that take JPEG only.
 * Exit code 1 on an error, 2 on bad arguments or no covers.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer-core';
import { chromeArgs, findChrome, loadFilm, serveDist } from './chrome';
import { mediaDir, requireFilm } from './film-arg';

const ROOT = path.resolve(import.meta.dir, '..');
const usage = (m: string): never => { console.error(m); process.exit(2); };
let o: { style?: string; only?: string } = {};
try { o = parseArgs({ args: Bun.argv.slice(2), strict: true, options: { film: { type: 'string' }, style: { type: 'string' }, only: { type: 'string' } } }).values; } catch (e) { usage((e as Error).message); }
const FILM = requireFilm(Bun.argv.slice(2));
const DIST = path.join(ROOT, 'dist', FILM);
const OUT = path.join(ROOT, 'out', FILM, 'covers');
const SAFE = 0.05;

const server = serveDist(DIST, { media: mediaDir(FILM) });
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 }, args: chromeArgs('platform') });
let errors = 0;
try {
  const first = await browser.newPage();
  await loadFilm(first, server.url, FILM, o.style ?? '');
  const all: string[] = await first.evaluate(() => window.__covers?.() ?? []);
  await first.close();
  const names = o.only ? o.only.split(',') : all;
  if (!all.length) usage(`${FILM} declares no covers (engine/cover.ts: cover({ name, size, draw, overlay }) in a module main.ts imports)`);
  for (const n of names) if (!all.includes(n)) usage(`--only ${n}: the film's covers are ${all.join(', ')}`);
  mkdirSync(OUT, { recursive: true });
  for (const name of names) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error(`page error: ${e instanceof Error ? e.message : String(e)}`));
    await loadFilm(page, server.url, FILM, o.style ?? '');
    const r = await page.evaluate((n) => window.__cover(n), name);
    await page.close();
    const png = path.join(OUT, `${name}.png`), jpg = path.join(OUT, `${name}.jpg`);
    writeFileSync(png, Buffer.from(r.png.slice(r.png.indexOf(',') + 1), 'base64'));
    const ff = Bun.spawnSync(['ffmpeg', '-v', 'error', '-y', '-i', png, '-q:v', '2', jpg], { stderr: 'pipe' });
    if (ff.exitCode !== 0) throw new Error(`ffmpeg (jpg): ${ff.stderr.toString().trim()}`);
    const [w, h] = r.size, sx0 = w * SAFE, sx1 = w * (1 - SAFE), sy0 = h * SAFE, sy1 = h * (1 - SAFE);
    for (const b of r.boxes) {
      if (b.alpha < 0.02) continue;
      const box = `[${Math.round(b.x0)}, ${Math.round(b.y0)}, ${Math.round(b.x1)}, ${Math.round(b.y1)}]`;
      if (b.x0 < 0 || b.y0 < 0 || b.x1 > w || b.y1 > h) { errors++; console.log(`error: cover ${name}: "${b.s}" ${box} leaves the ${w}x${h} image`); }
      else if (b.x0 < sx0 || b.y0 < sy0 || b.x1 > sx1 || b.y1 > sy1) console.log(`warning: cover ${name}: "${b.s}" ${box} is in the outer 5 % (cropped or covered on some platforms)`);
    }
    console.log(`${name}: ${w}x${h}, ${r.boxes.length} text box(es) -> ${path.relative(ROOT, png)}, ${path.relative(ROOT, jpg)}`);
  }
} finally {
  await browser.close().catch(() => {});
  server.stop();
}
process.exit(errors ? 1 : 0);
