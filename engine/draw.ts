/**
 * Canvas2D drawing primitives: text, rules, pen strokes, circles, hatching, arrows, bits. Default colours and fonts
 * come from the active style (style.ts); the look itself lives in the style package.
 */
import { clamp, lerp, hash1, TAU, W, H } from './util';
import { C, F, style } from './style';

export const cv = document.getElementById('c') as HTMLCanvasElement;
export const ctx = cv.getContext('2d')!;

/** Where a text() call landed on the canvas (after the current transform), for layout checks. */
export interface TextBox { s: string; font: string; x0: number; y0: number; x1: number; y1: number; alpha: number }
let boxes: TextBox[] | null = null;
/** Start (on = true) or stop recording text boxes; returns what was recorded since the last start. */
export function recordText(on: boolean): TextBox[] {
  const out = boxes ?? [];
  boxes = on ? [] : null;
  return out;
}
/** Index of the next recorded box (0 when not recording). */
export const textMark = (): number => boxes?.length ?? 0;
/** Multiply the alpha of boxes recorded since `mark` by `k` (a layer later covered by a fade). */
export function scaleText(mark: number, k: number): void {
  if (boxes) for (let i = mark; i < boxes.length; i++) boxes[i].alpha *= k;
}

/**
 * Glyph coverage of the bundled fonts (set by boot from the film's font manifest). Every string text() draws is
 * checked once per font chain and style: each character must be covered by a bundled family in the chain, otherwise
 * text() throws, so an export can never fall back to a system font silently.
 */
interface Coverage { charset: Set<string>; missing: Map<string, string> }
let coverage: Coverage | null = null;
const checked = new Set<string>();
export function setCoverage(m: { charset: string; fonts: { family: string; style: string; missing: string }[] }): void {
  coverage = { charset: new Set(m.charset), missing: new Map(m.fonts.map((f) => [`${f.family}|${f.style}`, f.missing])) };
  checked.clear();
}
const families = (font: string): string[] => font.split(',').map((x) => x.trim().replace(/^["']|["']$/g, ''));
function checkGlyphs(s: string, font: string, style: string): void {
  if (!coverage) return;
  const key = `${style}|${font}|${s}`;
  if (checked.has(key)) return;
  const cov = coverage;
  const st = style === 'italic' ? 'italic' : 'normal';
  for (const ch of s) {
    if (/\s/.test(ch)) continue;
    const ok = cov.charset.has(ch) && families(font).some((fam) => {
      const miss = cov.missing.get(`${fam}|${st}`) ?? cov.missing.get(`${fam}|normal`);
      return miss !== undefined && !miss.includes(ch);
    });
    if (!ok) {
      const code = ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
      throw new Error(`no bundled font covers "${ch}" (U+${code}) in "${s}" (font: ${font}): put the character in the film's text and run "just fonts", or change the text`);
    }
  }
  checked.add(key);
}

export interface TextOpts {
  font?: string;
  size?: number;
  weight?: number | string;
  style?: string;
  align?: CanvasTextAlign;
  base?: CanvasTextBaseline;
  color?: string;
  alpha?: number;
  ls?: number;
}

export function text(s: string, x: number, y: number, o: TextOpts = {}): void {
  if ((o.alpha ?? 1) <= 0.002 || !s) return;
  ctx.save();
  checkGlyphs(s, o.font ?? F.body, o.style ?? 'normal');
  ctx.font = `${o.style ?? ''} ${o.weight ?? 400} ${o.size ?? 40}px ${o.font ?? F.body}`;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.base ?? 'alphabetic';
  if (o.ls) ctx.letterSpacing = `${o.ls}px`;
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.fillStyle = o.color ?? C.fg;
  if (boxes) {
    const m = ctx.measureText(s), t = ctx.getTransform();
    const xs: number[] = [], ys: number[] = [];
    for (const [px, py] of [[x - m.actualBoundingBoxLeft, y - m.actualBoundingBoxAscent], [x + m.actualBoundingBoxRight, y - m.actualBoundingBoxAscent], [x - m.actualBoundingBoxLeft, y + m.actualBoundingBoxDescent], [x + m.actualBoundingBoxRight, y + m.actualBoundingBoxDescent]]) {
      const q = t.transformPoint(new DOMPoint(px, py));
      xs.push(q.x);
      ys.push(q.y);
    }
    boxes.push({ s, font: ctx.font, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), alpha: ctx.globalAlpha });
  }
  ctx.fillText(s, x, y);
  ctx.restore();
}

export function measure(s: string, size: number, font = F.body, weight: number | string = 400, ls = 0): number {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.letterSpacing = `${ls}px`;
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

/** A small label; how it is set (case, tracking, font) is the style's choice. */
export function label(s: string, x: number, y: number, a = 1, color = C.muted, size = 19, align: CanvasTextAlign = 'left'): void {
  style().label(s, x, y, a, color, size, align);
}

/** Multi-line block, one string per line. */
export function para(lines: string[], x: number, y: number, o: TextOpts & { lh?: number; stagger?: number; k?: number } = {}): void {
  const lh = o.lh ?? (o.size ?? 40) * 1.55;
  lines.forEach((l, i) => {
    const a = (o.alpha ?? 1) * (o.stagger !== undefined && o.k !== undefined ? clamp((o.k - i * o.stagger) / 0.6) : 1);
    text(l, x, y + i * lh, { ...o, alpha: a });
  });
}

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a)})`;
}

// ---- ink
export function rule(x0: number, y0: number, x1: number, y1: number, col = C.rule, a = 1, w = 1.5): void {
  if (a <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

/** Draw the first `k` (0..1) of a polyline with a pen: round joins, no glow. */
export function ink(pts: [number, number][], k: number, col = C.fg, w = 2, a = 1, dash?: number[]): void {
  if (a <= 0.002 || k <= 0 || pts.length < 2) return;
  let total = 0;
  const seg: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(total);
  }
  const L = total * clamp(k);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    if (seg[i] <= L) ctx.lineTo(pts[i][0], pts[i][1]);
    else {
      const f = (L - seg[i - 1]) / (seg[i] - seg[i - 1]);
      ctx.lineTo(lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f));
      break;
    }
  }
  ctx.stroke();
  ctx.restore();
}

export function circlePts(cx: number, cy: number, r: number, n = 72, a0 = -Math.PI / 2): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) out.push([cx + Math.cos(a0 + (i / n) * TAU) * r, cy + Math.sin(a0 + (i / n) * TAU) * r]);
  return out;
}
export const circle = (cx: number, cy: number, r: number, k: number, col = C.fg, w = 2, a = 1): void => ink(circlePts(cx, cy, r), k, col, w, a);

export function dot(x: number, y: number, r: number, col = C.accent, a = 1): void {
  if (a <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Diagonal hatching inside a clip path: the printed way to shade a region. */
export function hatch(clip: () => void, col = C.accent, a = 0.5, gap = 9, angle = -Math.PI / 4, w = 1.2): void {
  if (a <= 0.002) return;
  ctx.save();
  ctx.beginPath();
  clip();
  ctx.clip();
  ctx.globalAlpha = a;
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.translate(W / 2, H / 2);
  ctx.rotate(angle);
  const L = Math.hypot(W, H);
  ctx.beginPath();
  for (let x = -L; x <= L; x += gap) {
    ctx.moveTo(x, -L);
    ctx.lineTo(x, L);
  }
  ctx.stroke();
  ctx.restore();
}

export function arrow(x0: number, y0: number, x1: number, y1: number, col = C.fg, a = 1, w = 1.6, head = 10): void {
  if (a <= 0.002) return;
  const ang = Math.atan2(y1 - y0, x1 - x0);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - Math.cos(ang - 0.4) * head, y1 - Math.sin(ang - 0.4) * head);
  ctx.lineTo(x1 - Math.cos(ang + 0.4) * head, y1 - Math.sin(ang + 0.4) * head);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A number that settles digit by digit: for reveals. */
export function rollNumber(str: string, lt: number, t0: number, dur: number, seed = 0): string {
  const k = clamp((lt - t0) / dur);
  return [...str]
    .map((ch, i) => {
      if (!/[0-9]/.test(ch)) return ch;
      const settle = clamp((k - (i / str.length) * 0.6) / 0.4);
      if (settle >= 1) return ch;
      return String(Math.floor(hash1(seed + i * 7.3 + Math.floor(lt * 20)) * 10));
    })
    .join('');
}

/** Bits set in mono: ones ink, zeros grey, `hi` indices in rust with a strike. */
export function bits(s: string, x: number, y: number, size: number, lit: number, a = 1, hi: number[] = [], gap = 0.72, onDark = false): void {
  if (a <= 0.002) return;
  const step = size * gap;
  for (let i = 0; i < s.length; i++) {
    const k = clamp(lit - i);
    if (k <= 0) continue;
    const h = hi.includes(i);
    const col = h ? C.accent : s[i] === '1' ? (onDark ? C.fgOnDark : C.fg) : onDark ? C.mutedOnDark : C.muted;
    text(s[i], x + i * step, y, { font: F.mono, size, weight: 700, color: col, alpha: a * k, align: 'center' });
    if (h) rule(x + i * step - size * 0.3, y - size * 0.34, x + i * step + size * 0.3, y - size * 0.34, C.accent, a * k, 2);
  }
}

export { clamp, lerp };
