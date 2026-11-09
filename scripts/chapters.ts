/**
 * A film's chapters as timestamps for a video description (YouTube, Bilibili and the like):
 *
 *   bun scripts/chapters.ts --film <id> [--style <id>]      (just chapters)
 *
 * A chapter starts at the first scene that carries its number (scene `chapter` / `ch`); scenes before the first
 * chapter (a hook) belong to it, so the list starts at 00:00. Each line is "MM:SS 中文标题 · English title".
 * Checked against YouTube's rules (support.google.com/youtube/answer/9884579, read 2026-10-23): the first timestamp
 * is 00:00, at least three timestamps in ascending order, each chapter at least 10 seconds; a break is a warning,
 * since the list is still useful elsewhere. Writes out/<film>/chapters.txt; exit code 2 if the film has no chapters.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer-core';
import { chromeArgs, findChrome, loadFilm, serveDist } from './chrome';
import { mediaDir, requireFilm } from './film-arg';

const ROOT = path.resolve(import.meta.dir, '..');
let o: { style?: string } = {};
try { o = parseArgs({ args: Bun.argv.slice(2), strict: true, options: { film: { type: 'string' }, style: { type: 'string' } } }).values; } catch (e) { console.error((e as Error).message); process.exit(2); }
const FILM = requireFilm(Bun.argv.slice(2));
const server = serveDist(path.join(ROOT, 'dist', FILM), { media: mediaDir(FILM) });
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: chromeArgs('platform') });
let scenes: { name: string; start: number; end: number; chapter?: number; ch?: [string, string] }[] = [];
let duration = 0;
try {
  const page = await browser.newPage();
  await loadFilm(page, server.url, FILM, o.style ?? '');
  scenes = await page.evaluate(() => window.__scenes());
  duration = await page.evaluate(() => window.__duration);
} finally {
  await browser.close().catch(() => {});
  server.stop();
}

const chapters: { n: number; title: string; start: number }[] = [];
for (const s of scenes) {
  if (!s.chapter || chapters.some((c) => c.n === s.chapter)) continue;
  const [zh, en] = s.ch ?? ['', ''];
  chapters.push({ n: s.chapter, title: [zh, en].filter(Boolean).join(' · '), start: chapters.length ? s.start : 0 });
}
if (!chapters.length) { console.error(`${FILM} has no chapters (give scenes chapter: n and ch: [zh, en])`); process.exit(2); }
const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const lines = chapters.map((c) => `${mmss(c.start)} ${c.title}`);
const warnings: string[] = [];
if (chapters.length < 3) warnings.push(`${chapters.length} chapter(s): YouTube shows chapters only with at least three`);
chapters.forEach((c, i) => {
  const len = (chapters[i + 1]?.start ?? duration) - c.start;
  if (len < 10) warnings.push(`"${c.title}" lasts ${len.toFixed(1)} s: YouTube needs at least 10 s per chapter`);
});
const file = path.join(ROOT, 'out', FILM, 'chapters.txt');
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, lines.join('\n') + '\n');
console.log(lines.join('\n'));
for (const w of warnings) console.warn(`warning: ${w}`);
console.error(`-> ${path.relative(ROOT, file)}`);
