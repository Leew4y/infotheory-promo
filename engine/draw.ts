/**
 * Canvas2D helpers for the "dawn and paper" look: warm paper, ink lines, one rust accent, serif type.
 * No glows, no neon: everything that reads as printed or photographed.
 */
import { clamp, lerp, mulberry, hash1, TAU, W, H } from './util';

export const cv = document.getElementById('c') as HTMLCanvasElement;
export const ctx = cv.getContext('2d')!;

// Fonts: installed locally on the render machine.
export const F_ZH = '"Noto Serif SC", "华文中宋", "SimSun", serif';
export const F_EN = '"Georgia", "Palatino Linotype", "Times New Roman", serif';
export const F_MATH = '"Cambria Math", "Cambria", "Times New Roman", serif';
export const F_MONO = '"Consolas", "Cascadia Mono", monospace';

// Palette
export const C = {
  cream: '#F3F1EA',
  cream2: '#E8E4D9',
  ink: '#1A1917',
  ink2: '#4A4640',
  grey: '#8F8A80',
  line: '#C9C4B8',
  rust: '#C9663D',
  rust2: '#E58B5B',
  slate: '#5C7A99',
  sage: '#7C8C68',
  paper: '#F3EDE0', // text on dark plates
  paper2: '#D9CFBD',
};

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
  ctx.font = `${o.style ?? ''} ${o.weight ?? 400} ${o.size ?? 40}px ${o.font ?? F_ZH}`;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.base ?? 'alphabetic';
  if (o.ls) ctx.letterSpacing = `${o.ls}px`;
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.fillStyle = o.color ?? C.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

export function measure(s: string, size: number, font = F_ZH, weight: number | string = 400, ls = 0): number {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.letterSpacing = `${ls}px`;
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

/** Small-caps tracking label: "01 — 惊讶 · SURPRISE". */
export function label(s: string, x: number, y: number, a = 1, color = C.grey, size = 19, align: CanvasTextAlign = 'left'): void {
  text(s.toUpperCase(), x, y, { font: F_EN, size, ls: size * 0.28, color, alpha: a, align });
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

// ---- paper
let FIBER: HTMLCanvasElement | null = null;
function fiber(): HTMLCanvasElement {
  if (FIBER) return FIBER;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const r = mulberry(4242);
  const img = g.createImageData(512, 512);
  for (let i = 0; i < 512 * 512; i++) {
    const v = 118 + Math.floor(r() * 20);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = r() < 0.55 ? 0 : 14;
  }
  g.putImageData(img, 0, 0);
  FIBER = c;
  return c;
}
/** Warm paper with faint fibre and a soft edge fall-off. */
export function paper(tone = C.cream): void {
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.fillStyle = ctx.createPattern(fiber(), 'repeat')!;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, 'rgba(60,40,20,0)');
  g.addColorStop(1, 'rgba(60,40,20,.10)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ---- ink
export function rule(x0: number, y0: number, x1: number, y1: number, col = C.line, a = 1, w = 1.5): void {
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
export function ink(pts: [number, number][], k: number, col = C.ink, w = 2, a = 1, dash?: number[]): void {
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
export const circle = (cx: number, cy: number, r: number, k: number, col = C.ink, w = 2, a = 1): void => ink(circlePts(cx, cy, r), k, col, w, a);

export function dot(x: number, y: number, r: number, col = C.rust, a = 1): void {
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
export function hatch(clip: () => void, col = C.rust, a = 0.5, gap = 9, angle = -Math.PI / 4, w = 1.2): void {
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

export function arrow(x0: number, y0: number, x1: number, y1: number, col = C.ink, a = 1, w = 1.6, head = 10): void {
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
    const col = h ? C.rust : s[i] === '1' ? (onDark ? C.paper : C.ink) : onDark ? C.paper2 : C.grey;
    text(s[i], x + i * step, y, { font: F_MONO, size, weight: 700, color: col, alpha: a * k, align: 'center' });
    if (h) rule(x + i * step - size * 0.3, y - size * 0.34, x + i * step + size * 0.3, y - size * 0.34, C.rust, a * k, 2);
  }
}

export { clamp, lerp };
