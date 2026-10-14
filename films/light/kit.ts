// Shared drawing pieces for the light film: glowing beams and pulses, the apparatus of each chapter drawn as thin
// instrument lines, and the large mono number. Everything takes an alpha and draws nothing when it is ~0.
import { ctx, text, label, rgba, rule, ink, circlePts, C, F, M, W, clamp, lerp, eout, sstep, TAU } from '../../engine';

/** A glowing straight beam from (x0, y0) towards (x1, y1), drawn up to fraction k of its length. */
export function beam(x0: number, y0: number, x1: number, y1: number, k: number, a = 1, col = C.accent, w = 2.4): void {
  if (a <= 0.002 || k <= 0) return;
  const x = lerp(x0, x1, clamp(k)), y = lerp(y0, y1, clamp(k));
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  ctx.shadowColor = col;
  ctx.shadowBlur = 14;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
}

/** A short bright packet of light at fraction u along the segment, with a fading tail. */
export function pulse(x0: number, y0: number, x1: number, y1: number, u: number, a = 1, col = C.accent2, len = 0.08): void {
  if (a <= 0.002 || u < 0 || u > 1 + len) return;
  const n = 10;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.shadowColor = col;
  ctx.shadowBlur = 26;
  for (let i = 0; i < n; i++) {
    const t0 = clamp(u - (len * (i + 1)) / n), t1 = clamp(u - (len * i) / n);
    if (t1 <= t0) continue;
    ctx.globalAlpha = a * (1 - i / n);
    ctx.strokeStyle = col;
    ctx.lineWidth = 8 - (i * 5) / n;
    ctx.beginPath();
    ctx.moveTo(lerp(x0, x1, t0), lerp(y0, y1, t0));
    ctx.lineTo(lerp(x0, x1, t1), lerp(y0, y1, t1));
    ctx.stroke();
  }
  ctx.restore();
}

/** A soft round glow (a lamp, a star, a light spot). */
export function glow(x: number, y: number, r: number, a = 1, col = C.alt): void {
  if (a <= 0.002) return;
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, 0.95 * a));
  g.addColorStop(0.25, rgba(col, 0.55 * a));
  g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A lantern on a pole: outline, and an amber flame glow when open (0..1); s scales the drawing. */
export function lantern(x: number, ground: number, open: number, a = 1, s = 1): void {
  if (a <= 0.002) return;
  const top = ground - 150 * s, hw = 22 * s;
  rule(x, ground, x, top + 30 * s, C.fg2, a, 2.5);
  ink([[x - hw, top + 30 * s], [x - hw, top - 20 * s], [x + hw, top - 20 * s], [x + hw, top + 30 * s], [x - hw, top + 30 * s]], 1, C.fg, 2.5, a);
  ink([[x - hw - 4 * s, top - 20 * s], [x, top - 40 * s], [x + hw + 4 * s, top - 20 * s]], 1, C.fg, 2.5, a);
  glow(x, top + 5 * s, (26 + 80 * open) * s, a * (0.25 + 0.75 * open), C.alt);
  // the shutter: a dark plate over the window while the lantern is closed
  if (open < 0.98) {
    ctx.save();
    ctx.globalAlpha = a * (1 - open);
    ctx.fillStyle = C.bg2;
    ctx.fillRect(x - hw + 2, top - 18 * s, 2 * hw - 4, 46 * s);
    ctx.restore();
  }
}

/** A telescope tube seen from the side, eyepiece at (x, y), pointing along angle (radians). */
export function telescope(x: number, y: number, len: number, angle: number, a = 1): void {
  if (a <= 0.002) return;
  const c = Math.cos(angle), s = Math.sin(angle), nx = -s, ny = c;
  const w0 = 9, w1 = 15;
  const p = (u: number, v: number): [number, number] => [x + c * u + nx * v, y + s * u + ny * v];
  ink([p(0, -w0), p(len, -w1), p(len, w1), p(0, w0), p(0, -w0)], 1, C.fg, 2, a);
  ink([p(len * 0.62, -w1 - 3), p(len * 0.62, w1 + 3)], 1, C.fg2, 1.5, a);
  rule(x + 0.4 * len * c, y + 0.4 * len * s + 14, x + 0.4 * len * c, y + 70, C.fg2, a, 1.5);
}

/** A plane mirror: a short bright face with hatching behind it; angle is the face's direction. */
export function mirror(x: number, y: number, len: number, angle: number, a = 1): void {
  if (a <= 0.002) return;
  const c = Math.cos(angle), s = Math.sin(angle);
  const ax = x - (c * len) / 2, ay = y - (s * len) / 2, bx = x + (c * len) / 2, by = y + (s * len) / 2;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = C.accent2;
  ctx.shadowColor = C.accent;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.restore();
  const nx = s * 10, ny = -c * 10;
  for (let i = 0; i <= 6; i++) {
    const u = i / 6, px = lerp(ax, bx, u), py = lerp(ay, by, u);
    rule(px, py, px + nx - c * 6, py + ny - s * 6, C.fg2, a * 0.7, 1);
  }
}

/** A toothed wheel seen face on: n teeth, turned by angle; teeth drawn as notches on the rim. */
export function wheel(cx: number, cy: number, r: number, n: number, angle: number, a = 1, col = C.fg): void {
  if (a <= 0.002) return;
  const depth = Math.max(5, r * 0.09), shown = Math.min(n, 120);
  const pts: [number, number][] = [];
  for (let i = 0; i < shown; i++) {
    const t0 = angle + (i / shown) * TAU, t1 = angle + ((i + 0.5) / shown) * TAU, t2 = angle + ((i + 1) / shown) * TAU;
    pts.push([cx + Math.cos(t0) * r, cy + Math.sin(t0) * r], [cx + Math.cos(t1) * r, cy + Math.sin(t1) * r]);
    pts.push([cx + Math.cos(t1) * (r - depth), cy + Math.sin(t1) * (r - depth)], [cx + Math.cos(t2) * (r - depth), cy + Math.sin(t2) * (r - depth)]);
  }
  pts.push(pts[0]);
  ink(pts, 1, col, 1.6, a);
  ink(circlePts(cx, cy, r * 0.18, 36), 1, C.fg2, 1.5, a);
  for (let i = 0; i < 6; i++) {
    const t = angle + (i / 6) * TAU;
    rule(cx + Math.cos(t) * r * 0.18, cy + Math.sin(t) * r * 0.18, cx + Math.cos(t) * (r - depth - 4), cy + Math.sin(t) * (r - depth - 4), C.fg2, a * 0.7, 1.2);
  }
}

/** A large mono number, centred, with optional per-character alpha (k: 0..1 how many characters are lit). */
export function bigNumber(s: string, x: number, y: number, size: number, a = 1, col = C.fg, k = 1): void {
  if (a <= 0.002) return;
  const chars = [...s], n = chars.length;
  const cw = size * 0.6;
  const x0 = x - (cw * n) / 2;
  chars.forEach((ch, i) => {
    const ai = a * sstep(i / n, (i + 1) / n, k);
    if (ai <= 0.002 || ch === ' ') return;
    text(ch, x0 + cw * (i + 0.5), y, { font: F.mono, size, color: col, alpha: ai, align: 'center' });
  });
}

/** A labelled dimension line between two x positions at height y, with end ticks. */
export function dimension(x0: number, x1: number, y: number, s: string, a = 1, k = 1): void {
  if (a <= 0.002) return;
  const xe = lerp(x0, x1, eout(clamp(k)));
  rule(x0, y - 10, x0, y + 10, C.fg2, a, 1.5);
  rule(x0, y, xe, y, C.fg2, a, 1.5);
  if (k >= 0.99) rule(x1, y - 10, x1, y + 10, C.fg2, a, 1.5);
  text(s, (x0 + x1) / 2, y + 40, { font: F.body, size: 26, color: C.fg2, alpha: a * sstep(0.6, 1, k), align: 'center' });
}

/** The page's source line: small mono capitals at the top right, under the chapter label. */
export function source(s: string, a = 1): void {
  label(s, W - M, 196, a, C.muted, 20, 'right');
}
