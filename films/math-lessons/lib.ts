/**
 * Drawing helpers shared by this film's scenes (not a library for other films). Everything is drawn in the active
 * style's roles (C, F, M, COL) so that every style renders the same content its own way.
 *
 * Voices: the film speaks in three voices plus the response line of the closing litany, and the viewer should be able
 * to tell them apart: 'film' (the film's statements of fact and its claims), 'essay' (lines of the essay, a voice, not
 * evidence), 'counter' (counter-arguments, set smaller with a rule), 'response' (the litany's silent second half).
 */
import { ctx, text, measure, label, rule, ink, dot, rollNumber, C, F, COL, W, clamp, sstep, eout } from '../../engine';

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

/**
 * The sound of a verse number: a chime pitch on D Dorian, rising with the number (1 = D5), an octave lower once it
 * would pass D7. Used in scenes' sfx as ['chime', { midi: bell(n) }].
 */
export function bell(n: number): number {
  const scale = [0, 2, 3, 5, 7, 9, 10], k = n - 1;
  const m = 74 + 12 * Math.floor(k / 7) + scale[k % 7];
  return m > 98 ? m - 12 : m;
}

/** Colour of a voice on a page or on a plate. */
function tone(who: Voice, onDark: boolean): string {
  if (who === 'response') return C.accent;
  if (who === 'counter') return onDark ? C.mutedOnDark : C.muted;
  if (who === 'essay') return onDark ? C.mutedOnDark : C.fg2;
  return onDark ? C.fgOnDark : C.fg;
}
const sizeOf = (who: Voice, size: number) => size * (who === 'counter' ? 0.78 : 1);
const lsOf = (who: Voice, size: number) => (who === 'essay' ? size * 0.09 : size * 0.04);
const widthOf = (s: string, who: Voice, size: number) => measure(s, sizeOf(who, size), F.body, 400, lsOf(who, sizeOf(who, size)));

/**
 * One display line in a voice, left-aligned at x or centred on x (align 'center'); `mk` is its verse mark, drawn in
 * the left margin of the line. A counter line gets a vertical rule and the tag 反方, an essay line the tag 随笔
 * (tags only when `tag` is set, on the first line of a block).
 */
export function voiceLine(s: string, x: number, y: number, a: number, who: Voice, o: { size?: number; onDark?: boolean; align?: CanvasTextAlign; mk?: string; tag?: boolean } = {}): void {
  if (a <= 0.002) return;
  const size = sizeOf(who, o.size ?? 48), ls = lsOf(who, size);
  const w = measure(s, size, F.body, 400, ls);
  const x0 = o.align === 'center' ? x - w / 2 : x;
  text(s, x0, y, { size, color: tone(who, !!o.onDark), alpha: a, ls });
  if (o.mk) verse(o.mk, x0 - Math.min(size * 0.75, 44), y, a, size);
  if (who === 'counter') rule(x0 - 22, y - size * 0.95, x0 - 22, y + size * 0.2, tone(who, !!o.onDark), a, 2);
  if (o.tag && (who === 'counter' || who === 'essay')) label(who === 'counter' ? '反方' : '随笔', x0, y - size * 1.25, a, o.onDark ? C.mutedOnDark : C.muted, 18);
}

/** A quotation block: large Chinese lines, the original or a gloss in small text below, then the source. */
export function quote(lines: string[], below: string[], source: string, x: number, y: number, a: number, mk = '', size = 60, who: Voice = 'film', latin = true): number {
  let yy = y;
  lines.forEach((l, i) => {
    voiceLine(l, x, yy, a, who, { size, mk: i === 0 ? mk : '', tag: i === 0 && who === 'counter' });
    yy += sizeOf(who, size) * 1.45;
  });
  yy += 10;
  for (const l of below) {
    text(l, x, yy, latin ? { font: F.latin, style: 'italic', size: 26, color: C.muted, alpha: a } : { size: 24, color: C.muted, alpha: a });
    yy += 38;
  }
  yy += 18;
  if (source) label(source, x, yy, a, C.muted, 18);
  return yy;
}

/** A line of a recited block: shown from time t; `resp` is the litany's answer, appended on the same line at its own time. */
export interface Line { t: number; s: string; mk?: string; who: Voice; resp?: { t: number; s: string } }
/** A block of lines shown together from its first line's time until t1, centred around y. */
export interface Block { t1: number; lines: Line[]; y?: number; size?: number }

/** Display text on a plate: each block's lines centred, appearing line by line, the block fading out at t1. */
export function recite(blocks: Block[], lt: number, x = W / 2): void {
  for (const b of blocks) {
    const size = b.size ?? 50, lh = size * 1.75, n = b.lines.length;
    const y0 = (b.y ?? 520) - ((n - 1) * lh) / 2;
    b.lines.forEach((l, i) => {
      const a = sstep(l.t, l.t + 0.6, lt) * (1 - sstep(b.t1 - 0.5, b.t1, lt));
      if (a <= 0.002) return;
      const y = y0 + i * lh;
      if (!l.resp) {
        voiceLine(l.s, x, y, a, l.who, { size, onDark: true, align: 'center', mk: l.mk, tag: i === 0 && l.who !== 'film' });
        return;
      }
      // a litany line: the spoken half, then the silent answer in the response voice, centred as one line
      const gap = size * 0.4, w1 = widthOf(l.s, l.who, size), w2 = widthOf(l.resp.s, 'response', size);
      const xs = x - (w1 + gap + w2) / 2;
      voiceLine(l.s, xs, y, a, l.who, { size, onDark: true, mk: l.mk });
      const ar = sstep(l.resp.t, l.resp.t + 0.4, lt) * (1 - sstep(b.t1 - 0.5, b.t1, lt));
      voiceLine(l.resp.s, xs + w1 + gap, y, ar, 'response', { size, onDark: true });
    });
  }
}

// ---- the cycloid (F-M03): an inverted cycloid with generating radius r, lowest point at (cx, yb)

/** Point of the inverted cycloid at arc length s from the lowest point (|s| <= 4r): θ = 2 asin(s / 4r). */
export function cycloidAt(cx: number, yb: number, r: number, s: number): [number, number] {
  const th = 2 * Math.asin(clamp(s / (4 * r), -1, 1));
  return [cx + r * (th + Math.sin(th)), yb - r * (1 - Math.cos(th))];
}
/** The whole arch, drawn in with a pen over k (0..1). */
export function cycloid(cx: number, yb: number, r: number, k: number, a = 1): void {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 120; i++) {
    const th = -Math.PI + (2 * Math.PI * i) / 120;
    pts.push([cx + r * (th + Math.sin(th)), yb - r * (1 - Math.cos(th))]);
  }
  ink(pts, k, C.fg2, 2, a);
}
/**
 * A bead released from rest at arc length s0 (negative: left of the lowest point) at time t0. On the cycloid the
 * tangential motion is simple harmonic, s(t) = s0 cos(ω (t - t0)) with ω = sqrt(g / 4r), whatever s0 is; this film
 * takes ω = π/2 per second, so every bead reaches the bottom 1 s after release and again every 2 s (two beats at 60 BPM).
 */
export const OMEGA = Math.PI / 2;
export function beadS(s0: number, t0: number, t: number): number {
  return t <= t0 ? s0 : s0 * Math.cos(OMEGA * (t - t0));
}

// ---- data graphics

/** Where the 722 manuscripts sit (release and withdrawal draw the same grid): 38 x 19 squares in the right column. */
export const grid = () => ({ n: 722, cols: 38, x: COL + 20, y: 330, cell: 18 });

/** A grid of n small squares (cols per row), filled in order up to `k` (0..1); `gone` indices fade out with a strike. */
export function tiles(n: number, cols: number, x: number, y: number, cell: number, k: number, a: number, gone: number[] = [], goneK = 0): void {
  if (a <= 0.002) return;
  const shown = Math.floor(n * clamp(k));
  ctx.save();
  for (let i = 0; i < shown; i++) {
    const gx = x + (i % cols) * cell, gy = y + Math.floor(i / cols) * cell;
    const g = gone.includes(i);
    ctx.globalAlpha = a * (g ? 1 - goneK : 1);
    ctx.fillStyle = g ? C.accent : C.fg2;
    ctx.fillRect(gx, gy, cell - 4, cell - 4);
  }
  ctx.restore();
  for (const i of gone) {
    if (goneK <= 0 || i >= shown) continue;
    const gx = x + (i % cols) * cell, gy = y + Math.floor(i / cols) * cell;
    rule(gx - 4, gy - 4, gx + cell, gy + cell, C.accent, a * (1 - sstep(0.6, 1, goneK)), 2);
  }
}

/** A faint field of n dots in a grid (cols per row) with a little fixed jitter. */
export function dots(n: number, cols: number, x: number, y: number, step: number, a: number): void {
  if (a <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = C.muted;
  for (let i = 0; i < n; i++) {
    const jx = (Math.sin(i * 12.9898) * 43758.5453) % 1, jy = (Math.sin(i * 78.233) * 43758.5453) % 1;
    ctx.fillRect(x + (i % cols) * step + jx * 2, y + Math.floor(i / cols) * step + jy * 2, 2, 2);
  }
  ctx.restore();
}

/**
 * A large count that settles digit by digit to `value` between t0 and t0 + dur (rollNumber), with a unit beside it;
 * before t0 it shows `from` (default: zeros).
 */
export function count(value: string, unit: string, x: number, y: number, lt: number, t0: number, dur: number, a: number, size = 120, from?: string): void {
  if (a <= 0.002) return;
  const s = lt < t0 ? (from ?? value.replace(/[0-9]/g, '0')) : rollNumber(value, lt, t0, dur, 7);
  text(s, x, y, { font: F.mono, size, color: C.fg, alpha: a });
  text(unit, x + measure(s, size, F.mono) + 24, y, { size: 36, color: C.fg2, alpha: a });
}

/** A flash at a point that decays over 0.6 s after time t (a bead reaching the bottom). */
export function flash(x: number, y: number, lt: number, t: number): void {
  const k = lt - t;
  if (k < 0 || k > 0.6) return;
  dot(x, y, 6 + 26 * eout(k / 0.6), C.accent, 0.5 * (1 - k / 0.6));
}

