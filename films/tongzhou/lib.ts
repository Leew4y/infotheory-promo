// Shared drawing for the tongzhou film: wrapped text, the 「模拟数据」 tag, and the placeholder that stands in for a
// screen capture until the footage is recorded on the frozen main (10-12 09:00).
import { ctx, text, measure, C, F, W, sstep, type TextOpts } from '../../engine';

/** One type scale for the film (px at 1080p): key figures a little larger, never shouting. */
export const T = { name: 96, sub: 36, head: 48, figure: 128, body: 28, small: 22, tag: 20 } as const;

const CLOSE = /^[）」』。，、；：！？%)]$/u;

/** Break a string into lines no wider than maxW (CJK breaks anywhere; Latin runs stay whole). */
export function wrap(s: string, maxW: number, size: number, font = F.body, weight: number | string = 400): string[] {
  const tokens = s.match(/[A-Za-z0-9.%/()'#_\-−]+|\s+|./gu) ?? [];
  const lines: string[] = [];
  let cur = '';
  for (const t of tokens) {
    const next = cur + t;
    // closing punctuation never starts a line: it stays on the line it closes, even a little past maxW
    if (cur && !CLOSE.test(t) && measure(next, size, font, weight) > maxW) { lines.push(cur.trimEnd()); cur = t.trimStart(); }
    else cur = next;
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines;
}

/** Wrapped text; returns the y below the last line. */
export function block(s: string, x: number, y: number, maxW: number, o: TextOpts & { lh?: number } = {}): number {
  const size = o.size ?? 24, lh = o.lh ?? size * 1.45;
  // an explicit \n in the copy is a preferred break; each part then wraps on its own
  const lines = s.split('\n').flatMap((part) => wrap(part, maxW, size, o.font ?? F.body, o.weight ?? 400));
  lines.forEach((l, i) => text(l, x, y + i * lh, o));
  return y + lines.length * lh;
}

/** 「模拟数据」 in the top-right corner. */
export function mockTag(s: string, a: number): void {
  text(s, W - 150, 122, { size: T.tag, weight: 500, color: C.muted, alpha: a, align: 'right', ls: 2 });
}

/** The style's demo area, drawn as an empty frame with what the recording will show. */
export function placeholder(slot: string, what: string, lt: number): void {
  const x = 150, y = 190, w = W - 300, h = 660, a = sstep(0.1, 0.7, lt);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x, y, w, h);
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = C.rule;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
  text(slot, x + 48, y + 80, { size: T.body, weight: 700, color: C.accent, alpha: a, ls: 2 });
  block(what, x + 48, y + 136, w - 96, { size: T.body, color: C.muted, alpha: a, lh: 44 });
}
