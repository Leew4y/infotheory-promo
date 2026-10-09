/**
 * Drawing helpers shared by this film's scenes (not a library for other films). Everything is drawn in the active
 * style's roles (C, F, M) so that every style renders the same content its own way.
 *
 * Voices: the film speaks in three voices plus the response line of the closing litany, and the viewer should be able
 * to tell them apart: 'film' (the film's statements of fact and its claims), 'essay' (lines of the essay, a voice, not
 * evidence), 'counter' (counter-arguments, set smaller with a rule), 'response' (the litany's silent second half).
 */
import { ctx, text, measure, label, rule, C, F } from '../../engine';

export type Voice = 'film' | 'essay' | 'counter' | 'response';

/** A verse mark at (x, y) (baseline of the line it marks): "1".."18" in mono accent, "◇" as a small diamond, "" none. */
export function verse(m: string, x: number, y: number, a: number, size = 40): void {
  if (!m || a <= 0.002) return;
  if (m !== '◇') {
    text(m, x, y, { font: F.mono, size: Math.max(18, size * 0.5), color: C.accent, alpha: a, align: 'center' });
    return;
  }
  const r = Math.max(6, size * 0.16), cy = y - size * 0.34;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = C.muted;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, cy - r);
  ctx.lineTo(x + r, cy);
  ctx.lineTo(x, cy + r);
  ctx.lineTo(x - r, cy);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** Colour of a voice on a page or on a plate. */
function tone(who: Voice, onDark: boolean): string {
  if (who === 'response') return C.accent;
  if (who === 'counter') return onDark ? C.mutedOnDark : C.muted;
  if (who === 'essay') return onDark ? C.mutedOnDark : C.fg2;
  return onDark ? C.fgOnDark : C.fg;
}

/**
 * One display line in a voice, left-aligned at x or centred on x (align 'center'); `mk` is its verse mark, drawn in
 * the left margin of the line. A counter line gets a vertical rule and the tag 反方; an essay line the tag 随笔
 * (tags only on the first line of a block: pass `tag`).
 */
export function voiceLine(s: string, x: number, y: number, a: number, who: Voice, o: { size?: number; onDark?: boolean; align?: CanvasTextAlign; mk?: string; tag?: boolean } = {}): void {
  if (a <= 0.002) return;
  const size = (o.size ?? 48) * (who === 'counter' ? 0.78 : 1);
  const ls = who === 'essay' ? size * 0.14 : size * 0.06;
  const w = measure(s, size, F.body, 400, ls);
  const x0 = o.align === 'center' ? x - w / 2 : x;
  text(s, x0, y, { size, color: tone(who, !!o.onDark), alpha: a, ls });
  if (o.mk) verse(o.mk, x0 - Math.min(size * 0.75, 44), y, a, size);
  if (who === 'counter') rule(x0 - 22, y - size * 0.95, x0 - 22, y + size * 0.2, tone(who, !!o.onDark), a, 2);
  if (o.tag && (who === 'counter' || who === 'essay')) label(who === 'counter' ? '反方' : '随笔', x0, y - size * 1.25, a, o.onDark ? C.mutedOnDark : C.muted, 18);
}

/** A quotation block: large Chinese lines, the original in small italic Latin below, then the source. */
export function quote(lines: string[], original: string[], source: string, x: number, y: number, a: number, mk = '', size = 60): number {
  let yy = y;
  lines.forEach((l, i) => {
    voiceLine(l, x, yy, a, 'film', { size, mk: i === 0 ? mk : '' });
    yy += size * 1.45;
  });
  yy += 10;
  for (const l of original) {
    text(l, x, yy, { font: F.latin, style: 'italic', size: 26, color: C.muted, alpha: a });
    yy += 38;
  }
  yy += 18;
  label(source, x, yy, a, C.muted, 18);
  return yy;
}
