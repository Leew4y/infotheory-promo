/**
 * Every-frame text check of a built grow1 picture (validate samples five frames of the one scene; this looks at all).
 *
 *   bun probe.ts <film id> [step seconds, default 1/30]      (run from the repository root; the film built in dist/<id>)
 *
 * For each frame time: the frame renders (the kit's pic() throws on a size or safe-area breach); every text box at
 * alpha >= 0.02 is inside x 96..1653, y 60..1020; picture text is >= 46 px (34 px only for the NOTES strings); two
 * boxes both at alpha >= 0.5 do not intersect by more than 2 px each way; a display line (>= 32 px) does not end in
 * ，、；：。. Prints the scene's beat table (globalThis.__beats) and the sound cues. Exit 1 on any finding.
 */
import path from 'node:path';
const REPO = path.resolve(import.meta.dir, '..', '..');
const { chromeArgs, findChrome, loadFilm, serveDist } = await import(path.join(REPO, 'scripts/chrome.ts'));
const puppeteer = (await import(Bun.resolveSync('puppeteer-core', path.join(REPO, 'scripts')))).default;

const fid = Bun.argv[2], step = +(Bun.argv[3] ?? 1 / 30);
const NOTES = new Set(['有错，评论区见']);
const server = serveDist(path.join(REPO, 'dist', fid));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }, args: chromeArgs('platform') });
const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (e: unknown) => errors.push(e instanceof Error ? e.message : String(e)));
let bad = 0;
const say = (s: string) => { bad++; if (bad <= 60) console.log(s); };
try {
  await loadFilm(page, server.url, fid, '', 60_000, '&captions=0');
  const tl = await page.evaluate(() => window.__timeline());
  console.log('beats', JSON.stringify(await page.evaluate(() => (globalThis as unknown as { __beats?: unknown }).__beats ?? null)));
  console.log('cues', JSON.stringify(await page.evaluate(() => window.__cues())));
  const dur = tl.frames / tl.fps;
  let n = 0;
  const seen = new Set<string>();
  for (let t = 0; t < dur - 1e-6; t += step) {
    n++;
    let boxes: { s: string; px: number; x0: number; y0: number; x1: number; y1: number; alpha: number; role?: string }[];
    try {
      boxes = await page.evaluate((tt: number, fps: number) => window.__layout(tt, fps), t, tl.fps);
    } catch (e) {
      say(`t=${t.toFixed(3)} render error: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      continue;
    }
    const vis = boxes.filter((b) => b.alpha >= 0.02);
    for (const b of vis) {
      const k = (m: string) => { const key = `${m}|${b.s}`; if (!seen.has(key)) { seen.add(key); say(`t=${t.toFixed(3)} ${m}: "${b.s}" px ${b.px.toFixed(1)} box ${b.x0.toFixed(0)},${b.y0.toFixed(0)}-${b.x1.toFixed(0)},${b.y1.toFixed(0)} a ${b.alpha.toFixed(2)}`); } };
      if (b.x0 < 95.5 || b.x1 > 1653.5 || b.y0 < 59.5 || b.y1 > 1020.5) k('outside');
      if (b.px < 45.99 && !(NOTES.has(b.s) && b.px >= 33.99)) k('small');
      if (b.px >= 32 && b.alpha >= 0.5 && /[，、；：。]$/.test(b.s)) k('punctuation');
    }
    const half = vis.filter((b) => b.alpha >= 0.5);
    for (let i = 0; i < half.length; i++) for (let j = i + 1; j < half.length; j++) {
      const a = half[i], b = half[j];
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox > 2 && oy > 2) {
        const key = `overlap|${a.s}|${b.s}`;
        if (!seen.has(key)) { seen.add(key); say(`t=${t.toFixed(3)} overlap: "${a.s}" (a ${a.alpha.toFixed(2)}) x "${b.s}" (a ${b.alpha.toFixed(2)}) by ${ox.toFixed(0)}x${oy.toFixed(0)}`); }
      }
    }
  }
  for (const e of errors) say(`page error: ${e}`);
  console.log(`${n} frames checked, ${bad} finding(s)`);
} finally {
  await browser.close();
  server.stop();
}
process.exit(bad ? 1 : 0);
