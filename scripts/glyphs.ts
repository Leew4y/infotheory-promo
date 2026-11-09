/**
 * Glyph proof: the film's character set in every font of a style, drawn from the committed subsets, for a person (and
 * the agent) to read glyph by glyph. The automatic glyph check of `just fonts` reads outlines; it cannot tell that a
 * character reads as another one (ZCOOL XiaoWei's 受 reads as 要): only reading does.
 *
 *   bun scripts/glyphs.ts --film <id> [--style <id>]          (just glyphs <film> [--style id])
 *
 * Styles: every style with committed fonts (films/<film>/fonts/<style>/manifest.json), or --style. For each face of
 * the manifest, the characters of the set the face covers (the manifest's `missing` ones are left out, so no fallback
 * font can stand in; they are listed in the header) are drawn at 48 px, a variable face at weight 400, each in a cell
 * whose grey frame is the glyph's advance, labelled with its code point and the character in the system UI font for
 * comparison. Chrome reports the fonts it used for each sheet; anything other than the face is an error.
 * Writes out/<film>/glyphs/<style>/<NN>-<face>.png and index.json, through a temporary directory that then replaces
 * that style's directory as a whole (only a previous proof, i.e. one with an index.json, is replaced).
 * Exit code 1 on failure, 2 on bad arguments.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeArgs, findChrome } from './chrome';
import { requireFilm } from './film-arg';
import { confined } from './lib/confine';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const opt = (k: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : undefined);
const usage = (msg: string): never => { console.error(msg); process.exit(2); };
const FILM = requireFilm(argv);
const FONTS = path.join(ROOT, 'films', FILM, 'fonts');
const all = existsSync(FONTS) ? readdirSync(FONTS).filter((n) => existsSync(path.join(FONTS, n, 'manifest.json'))).sort() : [];
const STYLE = opt('style');
if (STYLE !== undefined && !all.includes(STYLE)) usage(`--style ${STYLE}: films/${FILM}/fonts/${STYLE}/manifest.json does not exist (styles with fonts: ${all.join(', ') || 'none'}; run just fonts ${FILM})`);
const styles = STYLE ? [STYLE] : all;
if (!styles.length) usage(`films/${FILM}/fonts/ has no font manifest: run just fonts ${FILM}`);

interface Face { family: string; role: string; style: 'normal' | 'italic'; weight: string; file: string; chars: number; missing: string }
const COLS = 26, CELL_W = 68, CELL_H = 92, SIZE = 48;
const hex = (ch: string) => ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** The weight to draw a face at: its own for a static face, 400 within a variable face's range. */
const drawWeight = (w: string) => {
  const [a, b] = w.split(' ').map(Number);
  return b === undefined ? a : Math.min(Math.max(400, a), b);
};

function page(faces: Face[], charset: string): string {
  const css = faces.map((f, i) => `@font-face { font-family: "proof-${i}"; src: url("/${encodeURI(f.file)}") format("woff2"); font-style: ${f.style}; font-weight: ${f.weight}; }`).join('\n');
  const sections = faces.map((f, i) => {
    const miss = new Set([...f.missing]);
    const chars = [...charset].filter((c) => !miss.has(c));
    const cells = chars.map((c) => `<div class="cell"><span class="g">${c === ' ' ? '&nbsp;' : esc(c)}</span><div class="l"><span class="sys">${esc(c)}</span>${hex(c)}</div></div>`).join('');
    const font = `font-family: "proof-${i}"; font-style: ${f.style}; font-weight: ${drawWeight(f.weight)};`;
    return `<section id="s${i}">
<h1>${esc(f.family)} ${f.style} ${esc(f.weight)} <small>(${esc(f.role)}; ${esc(f.file)}; drawn at weight ${drawWeight(f.weight)}, ${SIZE} px)</small></h1>
<p>${chars.length} of ${[...charset].length} characters of the set; ${miss.size ? `${miss.size} not in this face (a later font of the chain draws them): ${esc([...miss].slice(0, 40).join(' '))}${miss.size > 40 ? ' …' : ''}` : 'it covers all of them'}</p>
<div class="grid" style="${esc(font)}">${cells}</div>
<div class="probe" style="${esc(font)}">${esc(chars.join(''))}</div>
</section>`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${css}
body { margin: 0; background: #fff; color: #111; font-family: system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
section { padding: 20px 24px 24px; width: ${COLS * CELL_W}px; }
h1 { font-size: 20px; margin: 0 0 4px; font-weight: 600; } h1 small { font-weight: 400; color: #555; font-size: 14px; }
p { margin: 0 0 12px; font-size: 13px; color: #444; }
.grid { display: grid; grid-template-columns: repeat(${COLS}, ${CELL_W}px); grid-auto-rows: ${CELL_H}px; border-top: 1px solid #ccc; border-left: 1px solid #ccc; }
.cell { border-right: 1px solid #ccc; border-bottom: 1px solid #ccc; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding-top: 6px; }
.g { font-size: ${SIZE}px; line-height: 1; display: inline-block; outline: 1px solid #ddd; white-space: pre; font-kerning: none; }
.l { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; color: #555; padding-bottom: 4px; white-space: nowrap; }
.sys { font-family: system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; font-size: 14px; color: #000; margin-right: 4px; }
.probe { position: absolute; left: -99999px; white-space: pre; }
</style></head><body>${sections}</body></html>`;
}

/** The proof page at /, and the style's committed font files beside it (a request reaches only files inside `dir`). */
function serve(dir: string, html: string): { url: string; stop: () => void } {
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch(req) {
      let p: string;
      try { p = decodeURIComponent(new URL(req.url).pathname); } catch { return new Response('bad request', { status: 400 }); }
      if (p === '/') return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      const file = /\.woff2$/.test(p) ? confined(dir, p) : null;
      return file ? new Response(Bun.file(file)) : new Response('not found', { status: 404 });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
}

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, defaultViewport: { width: COLS * CELL_W + 48, height: 1000, deviceScaleFactor: 1 }, args: chromeArgs('platform') });
let code = 0;
try {
  for (const style of styles) {
    const dir = path.join(FONTS, style);
    const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as { charset: string; fonts: Face[] };
    const OUT = path.join(ROOT, 'out', FILM, 'glyphs', style);
    if (existsSync(OUT) && !existsSync(path.join(OUT, 'index.json')) && readdirSync(OUT).length) throw new Error(`${OUT} exists and is not a previous proof (no index.json): refusing to replace it`);
    const TMP = `${OUT}.${process.pid}.tmp`;
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
    const server = serve(dir, page(manifest.fonts, manifest.charset));
    try {
      const tab = await browser.newPage();
      await tab.goto(`${server.url}/`, { waitUntil: 'load' });
      // every face must load, and every sheet must be drawn in its own face only
      const loaded: string[] = await tab.evaluate(async (n) => {
        await document.fonts.ready;
        const out: string[] = [];
        for (let i = 0; i < n; i++) {
          const faces = [...document.fonts].filter((f) => f.family.replace(/"/g, '') === `proof-${i}`);
          out.push(faces.map((f) => f.status).join(',') || 'not declared');
        }
        return out;
      }, manifest.fonts.length);
      const cdp = await tab.createCDPSession();
      await cdp.send('DOM.enable');
      await cdp.send('CSS.enable');
      const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
      const images = [];
      for (const [i, f] of manifest.fonts.entries()) {
        if (loaded[i] !== 'loaded') throw new Error(`${style}/${f.file}: the face did not load (${loaded[i]})`);
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `#s${i} .probe` });
        const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
        // one web font (the only one this sheet names), whose name is the family's (a variable face adds its default instance)
        const used = fonts.map((x) => `${x.familyName}${x.isCustomFont ? ' (web font)' : ''}: ${x.glyphCount} glyphs`);
        if (fonts.length !== 1 || !fonts[0].isCustomFont || !fonts[0].familyName.startsWith(f.family))
          throw new Error(`${style}/${f.file}: Chrome drew the sheet with ${used.join(', ')}, not only ${f.family}`);
        const name = `${String(i + 1).padStart(2, '0')}-${f.file.replace(/\.woff2$/, '')}.png`;
        const el = await tab.$(`#s${i}`);
        await el!.screenshot({ path: path.join(TMP, name) });
        const box = await el!.boundingBox();
        images.push({ file: name, family: f.family, style: f.style, weight: f.weight, drawnAt: drawWeight(f.weight), role: f.role, face: f.file,
          chars: [...manifest.charset].length - [...f.missing].length, missing: f.missing, size: [Math.round(box!.width), Math.round(box!.height)] });
      }
      await tab.close();
      writeFileSync(path.join(TMP, 'index.json'), JSON.stringify({ film: FILM, style, charset: manifest.charset, cell: [CELL_W, CELL_H], glyphPx: SIZE, images }, null, 1) + '\n');
      if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
      mkdirSync(path.dirname(OUT), { recursive: true });
      renameSync(TMP, OUT);
      console.log(`${style}: ${images.length} faces -> ${OUT}`);
      for (const im of images) console.log(`  ${im.file.padEnd(36)} ${String(im.chars).padStart(4)} glyphs  ${im.size[0]}x${im.size[1]}`);
    } finally {
      rmSync(TMP, { recursive: true, force: true });
      server.stop();
    }
  }
} catch (e) {
  console.error(`glyphs failed: ${e instanceof Error ? e.message : String(e)}`);
  code = 1;
} finally {
  await browser.close().catch(() => {});
}
process.exit(code);
