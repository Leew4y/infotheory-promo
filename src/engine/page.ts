/** Page grid and the two recurring typographic blocks: the chapter statement and a typeset row. */
import { text, C, F_EN } from './draw';
import { clamp, eout, sstep } from './util';

export const M = 150; // left/right margin
export const COL = 1000; // right column (diagrams)

/** The chapter's one-line thesis at the top of the page, with its English under it. */
export function statement(zh: string, en: string, lt: number, t0 = 0.4, y = 300, size = 54): void {
  const k = clamp((lt - t0) / 0.9);
  const a = eout(k);
  const rise = (1 - a) * 14;
  text(zh, M, y + rise, { size, weight: 500, color: C.ink, alpha: a, ls: 3 });
  text(en, M, y + 46 + rise, { font: F_EN, style: 'italic', size: 24, color: C.grey, alpha: sstep(t0 + 0.4, t0 + 1.2, lt) });
}

/** A row in a typeset list: a year or key in rust, a title in ink, a note in grey. */
export function row(key: string, title: string, note: string, x: number, y: number, a: number, keyW = 96): void {
  if (a <= 0.002) return;
  text(key, x, y, { font: F_EN, size: 24, color: C.rust, alpha: a, ls: 1 });
  text(title, x + keyW, y, { size: 26, weight: 500, color: C.ink, alpha: a });
  text(note, x + keyW, y + 32, { size: 20, color: C.grey, alpha: a });
}
