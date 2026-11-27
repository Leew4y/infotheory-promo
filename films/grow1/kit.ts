/**
 * Drawing pieces of 《长高一倍，体重变几倍？》 (pilot short 1 of the route 「离谱但精确」, narrator 核算员; brief:
 * films/grow1/docs/pilot_short_1.md): the grid paper, the "你" figure (a solid silhouette or a
 * line drawing, two poses), the height ruler whose ticks are recomputed from the camera scale, the day counter, the
 * 「算」 tag, the oblique cube / cross-section / weights diagrams, the vertical pressure gauge, the end card and the
 * tail card (核算单). Everything takes an alpha and draws nothing when it is about 0.
 *
 * Look: paper-dawn's paper with a fixed square grid on it, ink (C.fg, C.fg2, C.muted) and one red, C.accent (the
 * same red the vertical composer uses for the 「假设」 stamp in the band). Numbers in F.math (lining figures).
 *
 * Delivered only as a vertical cut: the 1920x1080 picture is scaled to 1080x608 at y = 610 of a 1080x1920 page, the
 * band above it and the captions below it come from the composer (tools/grow1/vertical.py). So:
 * picture text >= 46 px (notes >= 34 px), nothing right of x = 1653 (Douyin's buttons), nothing in the top and bottom
 * 60 px; pic() enforces this for every text it draws (it throws, so a frame that breaks it fails to render).
 */
import { ctx, text, measure, rgba, C, F, clamp, lerp, sstep, eout, mulberry } from '../../engine';

export type P = [number, number];

/** Spread into the scene: no fade through paper, no engine camera (the kit zooms its own geometry, text keeps its size). */
export const STILL = { fi: 0, fo: 0, cam: (): { z: number } => ({ z: 1 }) };

/** Where picture text may go: x 96 .. 1653, y 60 .. 1020. */
export const SAFE = { x0: 96, x1: 1653, y0: 60, y1: 1020 };

// ------------------------------------------------------------------------------------------------ the grid paper

/**
 * The squared paper, fixed on the picture (it never moves or zooms; the ruler carries the scale): vertical lines at
 * x = x0 + pitch * i, horizontal lines at y = y0 + pitch * j (picture px), every `major`-th line (i or j divisible by
 * 5) heavier. Colour C.rule (#C9C4B8) at alpha minorA / majorA, widths minorW / majorW px, drawn over the style's
 * paper (background()) and under everything else. In the vertical page (scale 0.5625, picture at y = 610) the pitch
 * is 36 px: lines at page x = 36 i and page y = 610 + 36 j, majors at page x = 180 i and page y = 610 + 180 j.
 * The ground line of the figures (GROUND, y 960) lies on a major line.
 */
export const GRID = { pitch: 64, major: 5, x0: 0, y0: 0, minorW: 1.6, majorW: 2.6, minorA: 0.55, majorA: 0.95 };

export function grid(a = 1): void {
  if (a <= 0.002) return;
  ctx.save();
  ctx.strokeStyle = C.rule;
  for (const major of [false, true]) {
    ctx.globalAlpha = a * (major ? GRID.majorA : GRID.minorA);
    ctx.lineWidth = major ? GRID.majorW : GRID.minorW;
    ctx.beginPath();
    for (let i = 0; GRID.x0 + i * GRID.pitch <= 1920; i++) {
      if ((i % GRID.major === 0) !== major) continue;
      const x = GRID.x0 + i * GRID.pitch;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1080);
    }
    for (let j = 0; GRID.y0 + j * GRID.pitch <= 1080; j++) {
      if ((j % GRID.major === 0) !== major) continue;
      const y = GRID.y0 + j * GRID.pitch;
      ctx.moveTo(0, y);
      ctx.lineTo(1920, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ text

const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef\u2460-\u24ff]/;

export interface PicOpts {
  size?: number;
  a?: number;
  color?: string;
  align?: CanvasTextAlign;
  weight?: number;
  font?: string;
  ls?: number;
  /** Small print (34 px allowed); otherwise 46 px is the floor. */
  note?: boolean;
}

/**
 * Picture text. Default 46 px in F.math (lining figures; CJK falls back to Noto Serif SC), ink. Throws when the text
 * is smaller than 46 px (34 px for a note) or, while visible, leaves the safe area (x 96 .. 1653, y 60 .. 1020) after
 * the current transform, so every rendered frame checks the picture's text rules.
 */
export function pic(s: string, x: number, y: number, o: PicOpts = {}): void {
  const a = o.a ?? 1;
  if (a <= 0.002 || !s) return;
  const size = o.size ?? 46;
  const font = o.font ?? F.math;
  const weight = o.weight ?? 400;
  const t = ctx.getTransform();
  const sc = Math.hypot(t.a, t.b);
  if (size * sc < (o.note ? 34 : 46) - 0.01) throw new Error(`grow1 kit: "${s}" at ${(size * sc).toFixed(1)} px (floor ${o.note ? 34 : 46})`);
  if (a > 0.02) {
    ctx.save();
    ctx.font = `${weight} ${size}px ${font}`;
    if (o.ls) ctx.letterSpacing = `${o.ls}px`;
    ctx.textAlign = o.align ?? 'left';
    const m = ctx.measureText(s);
    ctx.restore();
    const xs = [x - m.actualBoundingBoxLeft, x + m.actualBoundingBoxRight], ys = [y - m.actualBoundingBoxAscent, y + m.actualBoundingBoxDescent];
    for (const px of xs) for (const py of ys) {
      const q = t.transformPoint(new DOMPoint(px, py));
      if (q.x < SAFE.x0 - 0.5 || q.x > SAFE.x1 + 0.5 || q.y < SAFE.y0 - 0.5 || q.y > SAFE.y1 + 0.5)
        throw new Error(`grow1 kit: "${s}" leaves the safe area at (${q.x.toFixed(0)}, ${q.y.toFixed(0)})`);
    }
  }
  text(s, x, y, { font, size, weight, color: o.color ?? C.fg, alpha: a, align: o.align, ls: o.ls });
}

/** Width of picture text (F.math unless given). */
export const picW = (s: string, size = 46, weight = 400, font = F.math, ls = 0): number => measure(s, size, font, weight, ls);

/** A colour between two palette colours (C.* hex values) at k in [0, 1]: one draw in the mixed colour. */
export function mix(from: string, to: string, k: number): string {
  const u = clamp(k);
  if (!/^#[0-9a-f]{6}$/i.test(from) || !/^#[0-9a-f]{6}$/i.test(to)) return u < 0.5 ? from : to;
  const p = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const a = p(from), b = p(to);
  return '#' + a.map((c, i) => Math.round(lerp(c, b[i], u)).toString(16).padStart(2, '0')).join('');
}

/**
 * The 「算」 tag after a computed number: 算 (46 px, C.fg2) in a thin ink frame, its left edge at x, its text on
 * baseline y. Returns the x where the tag ends.
 */
export function calcTag(x: number, y: number, a = 1, size = 46): number {
  if (a <= 0.002) return x;
  const pad = size * 0.2, w = size + 2 * pad;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = C.fg2;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y - size * 0.92 - pad * 0.5, w, size * 1.06 + pad);
  ctx.restore();
  pic('算', x + w / 2, y - size * 0.02, { size, a, color: C.fg2, align: 'center', font: F.body, weight: 500 });
  return x + w;
}

// ------------------------------------------------------------------------------------------------ the figure

/** Ground line of the figures (a major grid line). */
export const GROUND = 960;

// Right half of the body outline, height 1 from the soles (y up), x from the body's axis; the head is a separate
// circle (HEAD). The standing figure is UPPER + LEGS. A rider (a "你" sitting on the shoulders of the one below, for the
// column of s1-10) is RIDER_TORSO plus separate arms and legs, so a column draws in layers (column()): a rider's torso
// behind its carrier's head, its arms and legs in front of the carrier.
const UPPER: P[] = [
  [0.0, 0.872], [0.026, 0.872], [0.031, 0.856], [0.062, 0.843], [0.106, 0.833], [0.136, 0.819], [0.153, 0.79],
  [0.16, 0.72], [0.165, 0.62], [0.168, 0.52], [0.166, 0.468], [0.155, 0.443], [0.14, 0.448], [0.132, 0.48],
  [0.127, 0.56], [0.122, 0.65], [0.117, 0.722], [0.11, 0.746], [0.102, 0.728], [0.097, 0.65], [0.093, 0.58],
  [0.097, 0.51],
];
const LEGS: P[] = [
  [0.096, 0.42], [0.089, 0.3], [0.081, 0.15], [0.075, 0.062], [0.083, 0.026], [0.088, 0.004], [0.062, 0.0],
  [0.025, 0.0], [0.023, 0.062], [0.025, 0.15], [0.028, 0.3], [0.022, 0.42], [0.01, 0.468], [0.0, 0.476],
];
// A rider's torso (no arms; closed at the seat), and its arm and leg (right side; mirrored), drawn in front of its
// carrier: the hands hold the sides of the carrier's head, the thighs come forward round the carrier's neck and the
// shins point forward and down (foreshortened), the feet resting on the carrier's chest.
const RIDER_TORSO: P[] = [
  [0.0, 0.872], [0.026, 0.872], [0.031, 0.856], [0.062, 0.843], [0.106, 0.833], [0.136, 0.819], [0.148, 0.795],
  [0.14, 0.76], [0.112, 0.74], [0.102, 0.72], [0.097, 0.65], [0.093, 0.58], [0.097, 0.51], [0.095, 0.47],
  [0.06, 0.452], [0.0, 0.45],
];
const RIDER_ARM: P[] = [
  [0.118, 0.818], [0.142, 0.817], [0.157, 0.796], [0.168, 0.75], [0.18, 0.688], [0.178, 0.655], [0.16, 0.625],
  [0.125, 0.595], [0.102, 0.578], [0.096, 0.55], [0.08, 0.53], [0.064, 0.54], [0.062, 0.565], [0.072, 0.588],
  [0.1, 0.612], [0.128, 0.64], [0.14, 0.67], [0.136, 0.72], [0.126, 0.77], [0.118, 0.795],
];
const RIDER_LEG: P[] = [
  [0.03, 0.478], [0.09, 0.492], [0.135, 0.478], [0.162, 0.455], [0.172, 0.425], [0.165, 0.39], [0.148, 0.355],
  [0.142, 0.33], [0.138, 0.305], [0.112, 0.3], [0.1, 0.315], [0.104, 0.34], [0.118, 0.37], [0.126, 0.405],
  [0.112, 0.432], [0.07, 0.442], [0.03, 0.448],
];
/** Head: centre height and radius (height units). */
const HEAD = { y: 0.94, r: 0.06 };
/** How much higher each rider sits than the figure under it (height units): its seat (0.45) on the carrier's shoulders (0.835). */
export const RIDE = 0.385;

function chaikin(pts: P[], n = 2): P[] {
  let p = pts;
  for (let k = 0; k < n; k++) {
    const q: P[] = [];
    for (let i = 0; i < p.length; i++) {
      const [ax, ay] = p[i], [bx, by] = p[(i + 1) % p.length];
      q.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    p = q;
  }
  return p;
}
const mirrored = (right: P[]): P[] => [...right, ...right.slice(1, -1).reverse().map(([x, y]) => [-x, y] as P)];
const STAND = chaikin(mirrored([...UPPER, ...LEGS]));
const SEATED = chaikin(mirrored(RIDER_TORSO));
const flip = (pts: P[]): P[] => pts.map(([x, y]) => [-x, y] as P);
const LEG_R = chaikin(RIDER_LEG), LEG_L = flip(LEG_R), ARM_R = chaikin(RIDER_ARM), ARM_L = flip(ARM_R);

export interface PersonOpts {
  /** 'solid': the silhouette (ink fill); 'line': a line drawing (paper fill, ink outline). */
  look?: 'solid' | 'line';
  a?: number;
  color?: string;
}
function shape(paths: P[][], head: boolean, cx: number, footY: number, h: number, o: PersonOpts): void {
  const a = o.a ?? 1;
  if (a <= 0.002 || h < 2) return;
  const look = o.look ?? 'solid', col = o.color ?? C.fg;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.beginPath();
  for (const pts of paths) {
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * h, footY - y * h) : ctx.moveTo(cx + x * h, footY - y * h)));
    ctx.closePath();
  }
  if (head) {
    ctx.moveTo(cx + HEAD.r * h, footY - HEAD.y * h);
    ctx.arc(cx, footY - HEAD.y * h, HEAD.r * h, 0, Math.PI * 2);
  }
  if (look === 'solid') {
    ctx.fillStyle = col;
    ctx.fill();
  } else {
    ctx.fillStyle = C.bg;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = clamp(h * 0.0065, 2.4, 3.6);
    ctx.strokeStyle = col;
    ctx.stroke();
  }
  ctx.restore();
}
/** A standing "你" on (cx, footY), h px tall (soles to the top of the head). Neutral: no face, no strain. */
export function person(cx: number, footY: number, h: number, o: PersonOpts = {}): void {
  shape([STAND], true, cx, footY, h, o);
}
/** Half-width of a figure h px tall, at its widest (the hands; a rider's feet reach 0.178). */
export const personHalfW = (h: number): number => h * 0.168;

/**
 * A column of "你" (line drawings): the standing figure on (cx, GROUND) h px tall and `riders` figures each sitting on
 * the shoulders of the one below. riders[k] (k = 0 the lowest rider) = { a: alpha, drop: how far above its seat it
 * still is, px }. Layers: from the top down, each rider's torso, then its carrier's body over it (the carrier's head
 * in front of the rider's seat), then the rider's legs and arms over the carrier (feet on its chest, hands on its head).
 */
export function column(cx: number, h: number, riders: { a: number; drop: number }[], a = 1): void {
  const foot = (k: number) => GROUND - (k + 1) * RIDE * h - (riders[k]?.drop ?? 0);
  const n = riders.length;
  const opt = (k: number): PersonOpts => ({ look: 'line', a: a * (k < 0 ? 1 : riders[k].a) });
  for (let k = n - 1; k >= 0; k--) {
    if (k === n - 1) shape([SEATED], true, cx, foot(k), h, opt(k));
    // the carrier of rider k: rider k - 1, or the standing figure
    if (k > 0) shape([SEATED], true, cx, foot(k - 1), h, opt(k - 1));
    else shape([STAND], true, cx, GROUND, h, opt(-1));
    shape([LEG_R, LEG_L], false, cx, foot(k), h, opt(k));
    shape([ARM_R, ARM_L], false, cx, foot(k), h, opt(k));
  }
  if (!n) shape([STAND], true, cx, GROUND, h, opt(-1));
}

// ------------------------------------------------------------------------------------------------ the ruler

/** The height ruler: a vertical line at x, from GROUND up to top, ticks to its left, numbers (metres) to its right. */
export const RULER = { x: 920, top: 150, unitY: 112 };

/** Seconds-free ruler: `s` px per metre. Tick steps 0.5 / 1 / 2 / 4 m, the one whose spacing is 120-170 px leads. */
export function ruler(s: number, a = 1, avoidY: number | null = null): void {
  if (a <= 0.002) return;
  const x = RULER.x, span = GROUND - RULER.top;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = C.fg;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(x, GROUND);
  ctx.lineTo(x, RULER.top);
  ctx.stroke();
  ctx.restore();
  // every tick value once, with the largest alpha any step gives it (labels are never drawn twice)
  const ticks = new Map<number, { major: number; minor: number }>();
  for (const st of [0.5, 1, 2, 4, 8]) {
    const sp = st * s;
    const lab = sstep(118, 168, sp), min = sstep(36, 64, sp / 2);
    for (let k = 1; k * st * s <= span + 0.5; k++) {
      const v = +(k * st).toFixed(2), e = ticks.get(v) ?? { major: 0, minor: 0 };
      e.major = Math.max(e.major, lab);
      ticks.set(v, e);
    }
    for (let k = 1; (k - 0.5) * st * s <= span + 0.5; k++) {
      const v = +((k - 0.5) * st).toFixed(2), e = ticks.get(v) ?? { major: 0, minor: 0 };
      e.minor = Math.max(e.minor, min);
      ticks.set(v, e);
    }
  }
  for (const [v, e] of ticks) {
    const y = GROUND - v * s;
    if (y < RULER.top - 0.5) continue;
    const big = e.major, small = Math.max(e.minor, big);
    if (small > 0.002) {
      ctx.save();
      ctx.globalAlpha = a * small;
      ctx.strokeStyle = C.fg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - lerp(14, 26, big), y);
      ctx.stroke();
      ctx.restore();
    }
    const keep = avoidY === null ? 1 : sstep(44, 64, Math.abs(y - avoidY));
    const la = a * big * keep;
    if (la > 0.002 && y > RULER.top + 30) pic(Number.isInteger(v) ? String(v) : v.toFixed(1), x + 16, y + 16, { a: la, color: C.fg2 });
  }
  pic('米', x + 16, RULER.unitY, { a, color: C.fg2, font: F.body });
}

/**
 * A figure's height marked on the ruler: a dashed line from the top of its head (x0 .. RULER.x) and the label right
 * of the ruler at that height. Returns nothing; the caller passes y to ruler() as avoidY so tick numbers give way.
 */
export function heightMark(x0: number, y: number, label: string, a = 1, labelA = 1, color = C.fg): void {
  if (a <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(RULER.x - 4, y);
  ctx.stroke();
  ctx.restore();
  pic(label, RULER.x + 16, y + 20, { size: 60, a: a * labelA, color, weight: 600 });
}

// ------------------------------------------------------------------------------------------------ the counter

export const COUNTER = { x: 128, y: 214, size: 128 };
/**
 * 「第 n 天」, large, top left of the picture. `dt`: seconds since the last stamp (Infinity: none): the counter is
 * pressed in (drawn 1.16x and settling to 1x in 0.18 s, as a stamp lands) and the new number is red, going back to
 * ink in 1.2 s.
 */
export function counter(n: string, dt: number, a = 1): void {
  if (a <= 0.002) return;
  const { x, y, size } = COUNTER;
  const press = dt >= 0 ? 1 + 0.16 * (1 - eout(clamp(dt / 0.18))) : 1;
  const red = dt >= 0 ? 1 - sstep(0.5, 1.2, dt) : 0;
  const w1 = picW('第', size, 600, F.body), gap = size * 0.2, wn = picW('0', size, 600) * Math.max(1, n.length);
  const total = w1 + gap + wn + gap + picW('天', size, 600, F.body);
  ctx.save();
  const cx = x + total / 2, cy = y - size * 0.4;
  ctx.translate(cx, cy);
  ctx.scale(press, press);
  ctx.translate(-cx, -cy);
  pic('第', x, y, { size, a, weight: 600, font: F.body });
  pic(n, x + w1 + gap + wn / 2, y, { size, a, weight: 600, align: 'center', color: mix(C.fg, C.accent, red) });
  pic('天', x + w1 + gap + wn + gap, y, { size, a, weight: 600, font: F.body });
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ oblique diagrams

/** Oblique projection of the small diagrams: x right, y up, z into the paper (up and to the right on screen). */
export interface Obl { x: number; y: number; u: number; /** screen rise per unit of depth (default 0.32) */ dy?: number }
const DEPTH_DX = 0.5;
export const ob = (o: Obl, x: number, y: number, z: number): P => [o.x + (x + z * DEPTH_DX) * o.u, o.y - (y + z * (o.dy ?? 0.32)) * o.u];

function poly(pts: P[], fill: string | null, stroke: string | null, lw: number, a: number): void {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
  ctx.restore();
}

export interface BoxOpts { a?: number; lw?: number; top?: string; side?: string; front?: string; edge?: string; topEdge?: string }
/** A box (x, y, z) .. (x + w, y + h, z + d) with its three visible faces: front paper, top and side in ink tones. */
export function box(o: Obl, x: number, y: number, z: number, w: number, h: number, d: number, b: BoxOpts = {}): void {
  const a = b.a ?? 1;
  if (a <= 0.002) return;
  const lw = b.lw ?? 2.4, edge = b.edge ?? C.fg;
  const f = (px: number, py: number, pz: number) => ob(o, px, py, pz);
  const front = [f(x, y, z), f(x + w, y, z), f(x + w, y + h, z), f(x, y + h, z)];
  const top = [f(x, y + h, z), f(x + w, y + h, z), f(x + w, y + h, z + d), f(x, y + h, z + d)];
  const side = [f(x + w, y, z), f(x + w, y, z + d), f(x + w, y + h, z + d), f(x + w, y + h, z)];
  poly(front, b.front ?? C.bg, null, lw, a);
  poly(top, C.bg, null, lw, a);
  poly(top, b.top ?? rgba(C.fg2, 0.1), null, lw, a);
  poly(side, C.bg, null, lw, a);
  poly(side, b.side ?? rgba(C.fg2, 0.26), null, lw, a);
  poly(front, null, edge, lw, a);
  poly(side, null, edge, lw, a);
  poly(top, null, b.topEdge ?? edge, lw, a);
}

/**
 * Unit cubes at fractional positions (each [x, y, z, alpha]), drawn back to front (far z first, then low y, then
 * left x), so cubes sliding out of each other overlap correctly.
 */
export function cubes(o: Obl, list: [number, number, number, number][], a = 1): void {
  const sorted = [...list].sort((p, q) => q[2] - p[2] || p[1] - q[1] || p[0] - q[0]);
  for (const [x, y, z, k] of sorted) box(o, x, y, z, 1, 1, 1, { a: a * k });
}

/** A weight (砝码): bottom centre (x, y), w px wide: a solid ink trapezoid with a ring handle. */
export function weight(x: number, y: number, w: number, a = 1, edge: string | null = null): void {
  if (a <= 0.002) return;
  const h = w * 0.56, tw = w * 0.7;
  const body: P[] = [[x - w / 2, y], [x + w / 2, y], [x + tw / 2, y - h], [x - tw / 2, y - h]];
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = C.fg;
  ctx.lineWidth = Math.max(2, w * 0.07);
  ctx.beginPath();
  ctx.arc(x, y - h - w * 0.1, w * 0.13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  poly(body, C.fg, edge, 2.6, a);
  // a thin paper line across the body: reads as cast metal, not a hole
  ctx.save();
  ctx.globalAlpha = a * 0.5;
  ctx.strokeStyle = C.bg;
  ctx.lineWidth = Math.max(1, w * 0.035);
  ctx.beginPath();
  ctx.moveTo(x - tw * 0.42, y - h * 0.72);
  ctx.lineTo(x + tw * 0.42, y - h * 0.72);
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ the pressure gauge

/** The vertical gauge: bar x0..x1, value 0 at y0 (the ground), 8 at y8; heading above, labels to its left. */
export const GAUGE = { x0: 1590, x1: 1632, y0: GROUND, y8: 336, head: 290, max: 8 };
export const gaugeY = (v: number): number => lerp(GAUGE.y0, GAUGE.y8, v / GAUGE.max);

/**
 * The pressure gauge 「每平方厘米」: a bar with a tick at every unit (the one at 1 longer, labelled 「今天 = 1」), filled
 * in red from 0 to `v` with a red pointer; the pointer's label 「×N」 (N the value it has reached: `label`) left of it.
 * `hi` (0..1) washes the heading red (when the voice names it).
 */
export function gauge(v: number, label: string | null, a = 1, labelA = 1, hi = 0): void {
  if (a <= 0.002) return;
  const { x0, x1, y0 } = GAUGE, yv = gaugeY(v);
  ctx.save();
  ctx.globalAlpha = a;
  // fill, then the bar outline and the unit ticks
  ctx.fillStyle = C.accent;
  ctx.fillRect(x0, yv, x1 - x0, y0 - yv);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.strokeStyle = C.fg;
  ctx.lineWidth = 2.6;
  ctx.strokeRect(x0, GAUGE.y8, x1 - x0, y0 - GAUGE.y8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let k = 1; k <= GAUGE.max; k++) {
    const y = gaugeY(k), len = k === 1 || k === 2 || k === 4 || k === 8 ? 18 : 10;
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 - len, y);
  }
  ctx.stroke();
  // the pointer: a red triangle left of the bar
  ctx.fillStyle = C.accent;
  ctx.beginPath();
  ctx.moveTo(x0 - 4, yv);
  ctx.lineTo(x0 - 30, yv - 15);
  ctx.lineTo(x0 - 30, yv + 15);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  pic('每平方厘米', GAUGE.x1 + 6, GAUGE.head, { size: 50, a, align: 'right', font: F.body, weight: 600, color: mix(C.fg, C.accent, hi) });
  pic('今天 = 1', x0 - 40, gaugeY(1) + 17, { a, align: 'right', color: C.fg2 });
  if (label) pic(label, x0 - 40, yv + 22, { size: 64, a: a * labelA * sstep(1.25, 1.55, v), align: 'right', color: C.accent, weight: 600 });
}

// ------------------------------------------------------------------------------------------------ cards

/** The end card: 「正片：《假如你每天长高一倍》」 in a thin ink frame with a red edge; (x, y): its text's start and baseline. */
export function endCard(x: number, y: number, a = 1): void {
  if (a <= 0.002) return;
  const s = '正片：《假如你每天长高一倍》', size = 64;
  const w = picW(s, size, 600, F.body);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = C.bg;
  ctx.fillRect(x - 26, y - size - 22, w + 52, size + 50);
  ctx.strokeStyle = C.fg;
  ctx.lineWidth = 2.6;
  ctx.strokeRect(x - 26, y - size - 22, w + 52, size + 50);
  ctx.fillStyle = C.accent;
  ctx.fillRect(x - 26, y - size - 22, 10, size + 50);
  ctx.restore();
  pic(s, x, y, { size, a, weight: 600, font: F.body });
}

/**
 * The tail card's rows (v2, pilot_short_1_v2.md "尾卡"): [text, continuation?]. Row ① is set on two lines; its first
 * line drops the ；(on screen the line break is the pause), the second is indented to the text after ①.
 */
export const LEDGER: [string, string?][] = [
  ['① 假设：每天长高一倍，形状不变', '今天 1.7 米、70 公斤；一层楼按 3 米算'],
  ['② 身高 3.4、6.8、13.6 米 → 头顶 2、3、5 楼（算）'],
  ['③ 体重 ×8、×64、×512（算）'],
  ['④ 截面 ×4、×16、×64（算）'],
  ['⑤ 每平方厘米 = ③ ÷ ④：×2、×4、×8（算）'],
];
/** The tail card (核算单); u: seconds since it starts (rows come in 0.04 s apart, each in 0.22 s). Rows 58 px (33 px
 *  tall in the vertical page). */
export function tailCard(u: number): void {
  if (u <= 0) return;
  const x = 136, size = 58, step = 86;
  const row = (i: number) => eout(clamp((u - i * 0.04) / 0.22));
  pic('核算单', x, 158, { size: 72, a: row(0), weight: 700, font: F.body, ls: 6 });
  ctx.save();
  ctx.globalAlpha = row(0);
  ctx.fillStyle = C.accent;
  ctx.fillRect(x, 190, 240 * eout(clamp(u / 0.35)), 6);
  ctx.restore();
  let y = 286;
  LEDGER.forEach(([s, more], i) => {
    pic(s, x, y, { size, a: row(i + 1), color: C.fg });
    if (more) {
      y += step;
      pic(more, x + picW('① ', size), y, { size, a: row(i + 1), color: C.fg });
    }
    y += step;
  });
  pic('有错，评论区见', x, y - 6, { size: 46, a: row(6), color: C.muted, font: F.body });
}

/** The comment card 「你押第几天？」 (route.md section 5: only after the question has been asked): a comment bubble with
 *  a thin ink frame and a tail at its lower left; (x, y): its text's start and baseline; u: seconds since it came. */
export function commentCard(x: number, y: number, u: number, a = 1): void {
  if (a <= 0.002 || u <= 0) return;
  const s = '你押第几天？', size = 64, w = picW(s, size, 600, F.body);
  const k = 0.9 + 0.1 * eout(clamp(u / 0.2));
  const x0 = x - 30, y0 = y - size - 24, bw = w + 60, bh = size + 54;
  ctx.save();
  ctx.translate(x0, y0 + bh);
  ctx.scale(k, k);
  ctx.translate(-x0, -(y0 + bh));
  ctx.globalAlpha = a;
  ctx.fillStyle = C.bg;
  ctx.strokeStyle = C.fg;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(x0, y0, bw, bh, 18);
  ctx.moveTo(x0 + 34, y0 + bh);
  ctx.lineTo(x0 + 22, y0 + bh + 30);
  ctx.lineTo(x0 + 66, y0 + bh);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  pic(s, x0 + (x - x0) * k, y0 + bh + (y - y0 - bh) * k, { size: size * k < 46 ? 46 : size * k, a, weight: 600, font: F.body });
}

// ------------------------------------------------------------------------------------------------ v2: the building

/**
 * The picture's base layout is in frame px: the building's x fixed (a diagram: its width does not follow the camera),
 * heights from metres (y = ground - m * s). A View maps base px to the screen: identity in the main view, a
 * magnification about a focus point in the close-up of the 5th-floor window. Lengths scale by v.z; line widths and
 * text sizes do not (so the close-up keeps thin ink lines and the picture's text sizes).
 */
export interface View { x: (bx: number) => number; y: (by: number) => number; z: number }
export const IDENT: View = { x: (b) => b, y: (b) => b, z: 1 };
export const zoomView = (fx: number, fy: number, px: number, py: number, z: number): View =>
  ({ x: (b) => px + (b - fx) * z, y: (b) => py + (b - fy) * z, z });

/** The building (pilot_short_1_v2.md "楼"): floors of 3 m (the band's 一层楼按 3 米算), five floors and a roof; on the
 *  right wall a door on 1 楼 (2.1 m) and a window on every other floor, sill 0.9 m, top 2.4 m above its floor. */
export const FLOOR_M = 3, FLOORS = 5, SILL_M = 0.9, WIN_TOP_M = 2.4, DOOR_M = 2.1;
/** The floor (1 = 1 楼) that a height h (m) above the ground is in. */
export const floorOf = (h: number): number => Math.floor(h / FLOOR_M) + 1;

export interface BuildingOpts {
  x0: number; x1: number; ground: number; s: number; v: View; a: number;
  /** above this screen y the building's lines fade out (it goes on above the picture); -Infinity: no fade */
  fadeTop?: number;
  /** floor labels' alpha; the floor drawn red (the head's floor) and how red */
  labelA?: number; hiFloor?: number; hiA?: number;
  /** where a floor label may go (screen px): its whole box must pass */
  room?: (x0: number, y0: number, x1: number, y1: number) => boolean;
}
/** The cutaway (a dollhouse section, line drawing): slabs, walls, the door, the windows, the roof, 「N 楼」 at the top
 *  left of each floor. */
export function building(o: BuildingOpts): void {
  const { x0, x1, ground, s, v, a } = o;
  if (a <= 0.002) return;
  const fade = o.fadeTop ?? -Infinity;
  const Y = (m: number) => v.y(ground - m * s), X = v.x;
  const ink = (alpha: number): string | CanvasGradient => {
    if (!Number.isFinite(fade)) return rgba(C.fg, alpha);
    const g = ctx.createLinearGradient(0, fade, 0, fade + 90);
    g.addColorStop(0, rgba(C.fg, 0));
    g.addColorStop(1, rgba(C.fg, alpha));
    return g;
  };
  const top = FLOORS * FLOOR_M;
  const slab = Math.min(16, Math.max(7, 0.22 * s * v.z));
  ctx.save();
  ctx.globalAlpha = a;
  // slabs (floors 2..FLOORS and the roof) as a light band between two ink lines
  ctx.fillStyle = ink(0.14);
  for (let k = 1; k <= FLOORS; k++) {
    const y = Y(k * FLOOR_M);
    ctx.fillRect(X(x0), y - slab, X(x1) - X(x0), slab);
  }
  ctx.strokeStyle = ink(1);
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (let k = 1; k <= FLOORS; k++) {
    const y = Y(k * FLOOR_M);
    ctx.moveTo(X(x0), y); ctx.lineTo(X(x1), y);
    ctx.moveTo(X(x0), y - slab); ctx.lineTo(X(x1), y - slab);
  }
  // the roof's parapet
  const yr = Y(top) - slab;
  ctx.moveTo(X(x0) - 10 * v.z, yr); ctx.lineTo(X(x1) + 10 * v.z, yr);
  // left wall: solid; right wall: the door on 1 楼, a window on each floor above
  ctx.moveTo(X(x0), Y(0)); ctx.lineTo(X(x0), yr);
  ctx.moveTo(X(x1), Y(DOOR_M));
  for (let k = 2; k <= FLOORS; k++) {
    const f = (k - 1) * FLOOR_M;
    ctx.lineTo(X(x1), Y(f + SILL_M));
    ctx.moveTo(X(x1), Y(f + WIN_TOP_M));
  }
  ctx.lineTo(X(x1), yr);
  ctx.stroke();
  // the door's lintel, the windows' sills (out past the wall) and lintels, the glass as a thin line
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(X(x1) - 14 * v.z, Y(DOOR_M)); ctx.lineTo(X(x1) + 4 * v.z, Y(DOOR_M));
  for (let k = 2; k <= FLOORS; k++) {
    const f = (k - 1) * FLOOR_M;
    ctx.moveTo(X(x1) - 16 * v.z, Y(f + SILL_M)); ctx.lineTo(X(x1) + 12 * v.z, Y(f + SILL_M));
    ctx.moveTo(X(x1) - 10 * v.z, Y(f + WIN_TOP_M)); ctx.lineTo(X(x1) + 6 * v.z, Y(f + WIN_TOP_M));
  }
  ctx.stroke();
  ctx.strokeStyle = typeof ink(1) === 'string' ? rgba(C.fg2, 0.7) : ink(0.7);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let k = 2; k <= FLOORS; k++) {
    const f = (k - 1) * FLOOR_M;
    ctx.moveTo(X(x1), Y(f + SILL_M)); ctx.lineTo(X(x1), Y(f + WIN_TOP_M));
  }
  ctx.stroke();
  ctx.restore();
  // 「N 楼」 at the top left of each floor (below its ceiling, or at the top of the picture when the ceiling is above it)
  const la = (o.labelA ?? 1) * a;
  if (la <= 0.002) return;
  for (let k = 1; k <= FLOORS; k++) {
    const yFloor = Y((k - 1) * FLOOR_M), yCeil = Y(k * FLOOR_M);
    const y = Math.max(yCeil + 64, 150), x = X(x0) + 16;
    const w = picW(`${k} 楼`, 56, 600, F.body);
    if (y > yFloor - 60 || y < 112 || y > 1010) continue;  // only where the floor's own room shows under the label
    if (o.room && !o.room(x, y - 46, x + w, y + 6)) continue;
    const hi = k === o.hiFloor ? (o.hiA ?? 0) : 0;
    pic(`${k} 楼`, x, y, { size: 56, a: la, weight: 600, font: F.body, color: mix(C.fg2, C.accent, hi) });
  }
}

/** A table (top 0.75 m) from x0 to x1 standing on the floor at base y `floor`; returns the top's base y. */
export function table(x0: number, x1: number, floor: number, s: number, v: View, a: number, topM = 0.75): number {
  const top = floor - topM * s;
  if (a <= 0.002) return top;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = C.fg;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(v.x(x0), v.y(top)); ctx.lineTo(v.x(x1), v.y(top));
  ctx.moveTo(v.x(x0 + 0.06 * s), v.y(top)); ctx.lineTo(v.x(x0 + 0.06 * s), v.y(floor));
  ctx.moveTo(v.x(x1 - 0.06 * s), v.y(top)); ctx.lineTo(v.x(x1 - 0.06 * s), v.y(floor));
  ctx.stroke();
  ctx.restore();
  return top;
}

/** A bowl of noodles with chopsticks on a table top (base px): bottom centre (x, y). */
export function bowl(x: number, y: number, s: number, v: View, a: number): void {
  if (a <= 0.002) return;
  const r = 0.09 * s * v.z, X = v.x(x), Y = v.y(y);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = C.bg;
  ctx.strokeStyle = C.fg;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(X - r, Y - r * 0.9);
  ctx.quadraticCurveTo(X - r, Y, X, Y);
  ctx.quadraticCurveTo(X + r, Y, X + r, Y - r * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(X - r * 0.2, Y - r * 0.8); ctx.lineTo(X + r * 0.9, Y - r * 2.4);
  ctx.moveTo(X + r * 0.05, Y - r * 0.8); ctx.lineTo(X + r * 1.2, Y - r * 2.2);
  ctx.stroke();
  ctx.restore();
}

/** An open exercise book on a desk top (base px): bottom centre (x, y). */
export function book(x: number, y: number, s: number, v: View, a: number): void {
  if (a <= 0.002) return;
  const w = 0.16 * s * v.z, X = v.x(x), Y = v.y(y);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = C.fg;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(X - w, Y - w * 0.12); ctx.lineTo(X, Y); ctx.lineTo(X + w, Y - w * 0.12);
  ctx.moveTo(X, Y); ctx.lineTo(X, Y - w * 0.1);
  ctx.stroke();
  ctx.restore();
}

/** A flower pot on the window sill (base px): bottom centre (x, y), and a watering can held at (hx, hy), its spout
 *  towards the pot. */
export function potAndCan(x: number, y: number, hx: number, hy: number, s: number, v: View, a: number): void {
  if (a <= 0.002) return;
  const u = s * v.z, X = v.x(x), Y = v.y(y), HX = v.x(hx), HY = v.y(hy);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = C.bg;
  ctx.strokeStyle = C.fg;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // the pot and two leaves
  ctx.beginPath();
  ctx.moveTo(X - 0.08 * u, Y - 0.14 * u); ctx.lineTo(X + 0.08 * u, Y - 0.14 * u);
  ctx.lineTo(X + 0.06 * u, Y); ctx.lineTo(X - 0.06 * u, Y); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(X, Y - 0.14 * u); ctx.quadraticCurveTo(X - 0.02 * u, Y - 0.3 * u, X - 0.1 * u, Y - 0.34 * u);
  ctx.moveTo(X, Y - 0.14 * u); ctx.quadraticCurveTo(X + 0.04 * u, Y - 0.26 * u, X + 0.11 * u, Y - 0.28 * u);
  ctx.stroke();
  // the can: a body, a handle on its left (in the hand), a spout to the right and up
  const bw = 0.2 * u, bh = 0.16 * u;
  ctx.beginPath();
  ctx.rect(HX - bw * 0.1, HY - bh * 0.5, bw, bh);
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(HX + bw * 0.9, HY); ctx.lineTo(HX + bw * 1.7, HY - bh * 0.7);
  ctx.moveTo(HX - bw * 0.1, HY - bh * 0.3); ctx.quadraticCurveTo(HX - bw * 0.35, HY, HX - bw * 0.1, HY + bh * 0.3);
  ctx.stroke();
  ctx.restore();
}

/** A neighbour's speech bubble with 「？」「！」「……」 (no faces: the bubble is the reaction): centre (x, y) on screen, its
 *  tail to (tx, ty); u: seconds since it popped (it pops from 60 % to full in 0.18 s). */
export function bubble(x: number, y: number, s: string, tx: number, ty: number, u: number, a = 1): void {
  if (a <= 0.002 || u < 0) return;
  const k = 0.6 + 0.4 * eout(clamp(u / 0.18));
  const size = 76, w = Math.max(116, picW(s, size, 700, F.body) + 52) * k, h = 104 * k;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = C.bg;
  ctx.strokeStyle = C.fg;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // the tail: a small wedge from the bubble's rim towards (tx, ty)
  const ang = Math.atan2(ty - y, tx - x), bx = x + Math.cos(ang) * w * 0.42, by = y + Math.sin(ang) * h * 0.42;
  const ex = bx + (tx - bx) * 0.5, ey = by + (ty - by) * 0.5, nx = -Math.sin(ang) * 9 * k, ny = Math.cos(ang) * 9 * k;
  ctx.beginPath();
  ctx.moveTo(bx + nx, by + ny); ctx.lineTo(ex, ey); ctx.lineTo(bx - nx, by - ny);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  pic(s, x, y + size * 0.36 * k, { size: Math.max(46, size * k), a, weight: 700, font: F.body, align: 'center' });
}

/** The hair whorl (发旋) on top of a solid head: a paper-coloured spiral, centre (x, y), radius r (screen px). */
export function whorl(x: number, y: number, r: number, a = 1): void {
  if (a <= 0.002 || r < 3) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = C.bg;
  ctx.lineWidth = Math.max(1.6, r * 0.14);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const t = i / 60, ang = -Math.PI / 2 + t * Math.PI * 3.4, rr = r * (0.12 + 0.88 * t);
    const px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr * 0.7;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

/** Seams of a shirt sewn from n × n shirts (衣服按面积 ×4、×16、×64): paper-coloured lines over the torso of a standing
 *  silhouette (person() on (cx, footY), h px), clipped to its outline; k (0..1) draws them in. */
export function shirtSeams(cx: number, footY: number, h: number, n: number, a = 1, k = 1): void {
  if (a <= 0.002 || n < 2 || k <= 0) return;
  ctx.save();
  ctx.beginPath();
  STAND.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * h, footY - y * h) : ctx.moveTo(cx + x * h, footY - y * h)));
  ctx.closePath();
  ctx.clip();
  const x0 = cx - 0.098 * h, x1 = cx + 0.098 * h, y0 = footY - 0.84 * h, y1 = footY - 0.47 * h;
  ctx.globalAlpha = a;
  ctx.strokeStyle = C.bg;
  ctx.lineWidth = clamp(h * 0.0075, 2.2, 4.2);
  ctx.beginPath();
  for (let i = 1; i < n; i++) {
    const x = lerp(x0, x1, i / n), y = lerp(y0, y1, i / n);
    ctx.moveTo(x, y0); ctx.lineTo(x, lerp(y0, y1, k));
    ctx.moveTo(x0, y); ctx.lineTo(lerp(x0, x1, k), y);
  }
  // the hem
  ctx.moveTo(x0, y1); ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

/** A sheet of tiny "你" (solid silhouettes), cols × rows, top left (x0, top), each h px tall, steps dx / dy; `n` must
 *  equal cols × rows (the brief's 64 / 512 个你); k (0..1) fills them in row by row. Returns the number drawn. */
export function crowd(x0: number, top: number, cols: number, rows: number, n: number, h: number, dx: number, dy: number, a = 1, k = 1): number {
  if (cols * rows !== n) throw new Error(`grow1 kit: crowd ${cols} x ${rows} is not ${n}`);
  if (a <= 0.002 || k <= 0) return 0;
  const shown = Math.round(n * clamp(k));
  for (let i = 0; i < shown; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    person(x0 + dx * (c + 0.5), top + dy * r + h, h, { a });
  }
  return shown;
}

/**
 * The close-up of v2 (g5b): the 5th floor seen from inside, facing its window (a front view, s px per metre, the floor
 * at `floor`): the wall, the window from the sill (0.9 m) up, a flower pot on the sill; outside, filling the bottom of the
 * window, the top of the grown head (13.6 m tall: its top 0.7 m above the sill, radius 0.06 of its height) with its
 * whorl; inside, the neighbour (a line drawing, 1.7 m) holding the watering can. Pure line drawing on paper; nothing
 * broken. Returns where the neighbour's head top is (for the bubble).
 */
export function windowView(x0: number, x1: number, floor: number, s: number, cx: number, nbX: number, a = 1): { hx: number; hy: number } {
  const sill = floor - SILL_M * s, wl = cx - 0.75 * s, wr = cx + 0.75 * s;
  const headR = 0.06 * 13.6 * s, headTop = sill - (13.6 - 12.9) * s, hcy = headTop + headR;
  ctx.save();
  ctx.globalAlpha = a;
  // outside, through the window: the head's top, only above the sill and inside the frame
  ctx.save();
  ctx.beginPath();
  ctx.rect(wl, -10000, wr - wl, sill + 10000);
  ctx.clip();
  ctx.fillStyle = C.fg;
  ctx.beginPath();
  ctx.arc(cx, hcy, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  whorl(cx + 0.04 * headR, headTop + 0.3 * headR, 0.24 * headR, a);
  // the window: frame, a transom high up, the sill board with its edge, two glints on the glass
  ctx.strokeStyle = C.fg;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(wl, -10); ctx.lineTo(wl, sill);
  ctx.moveTo(wr, -10); ctx.lineTo(wr, sill);
  ctx.moveTo(wl, sill - 1.15 * s); ctx.lineTo(wr, sill - 1.15 * s);
  ctx.stroke();
  ctx.fillStyle = C.bg;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.rect(wl - 0.08 * s, sill, wr - wl + 0.16 * s, 0.07 * s);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = rgba(C.fg2, 0.45);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [gx, gy] of [[wl + 0.2 * s, sill - 1.45 * s], [wr - 0.35 * s, sill - 1.3 * s]]) {
    ctx.moveTo(gx, gy); ctx.lineTo(gx + 0.16 * s, gy - 0.16 * s);
    ctx.moveTo(gx + 0.06 * s, gy + 0.05 * s); ctx.lineTo(gx + 0.2 * s, gy - 0.09 * s);
  }
  ctx.stroke();
  // the floor and its skirting
  ctx.strokeStyle = C.fg;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0, floor); ctx.lineTo(x1, floor);
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x0, floor - 0.1 * s); ctx.lineTo(x1, floor - 0.1 * s);
  ctx.stroke();
  ctx.restore();
  // the neighbour, the pot on the sill, the can in hand (its spout towards the pot)
  const h = 1.7 * s;
  person(nbX, floor, h, { look: 'line', a });
  potAndCan(wl + 0.22 * s, sill, nbX + 0.21 * h, floor - 0.5 * h, s, IDENT, a);
  return { hx: nbX, hy: floor - h };
}

/** A rubber stamp (as 「假设」 in the band): red frame and text, turned `deg` degrees, worn ink; centre (x, y); u:
 *  seconds since it landed (it lands from 1.3x to full size in 0.12 s). */
export function rubberStamp(s: string, x: number, y: number, size: number, deg: number, u: number, a = 1): void {
  if (a <= 0.002 || u < 0) return;
  const k = 1 + 0.3 * (1 - eout(clamp(u / 0.12)));
  const ls = size * 0.15, padX = size * 0.3, padY = size * 0.2, frame = Math.max(4, size * 0.09);
  const tw = picW(s, size, 800, F.body, ls) - ls;
  const w = tw + 2 * padX + 2 * frame, h = size * 1.08 + 2 * padY + 2 * frame;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.scale(k, k);
  ctx.globalAlpha = a * 0.93;
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = frame;
  ctx.beginPath();
  ctx.roundRect(-w / 2 + frame / 2, -h / 2 + frame / 2, w - frame, h - frame, frame);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.scale(k, k);
  pic(s, 0, size * 0.36, { size, weight: 800, font: F.body, color: C.accent, align: 'center', ls, a: a * 0.93 });
  const rnd = mulberry(20261128);
  ctx.fillStyle = C.bg;
  for (let i = 0; i < 220; i++) {
    const fx = (rnd() - 0.5) * w, fy = (rnd() - 0.5) * h, fr = 0.6 + rnd() * rnd() * 3.2;
    ctx.globalAlpha = a * (0.25 + 0.55 * rnd());
    ctx.beginPath();
    ctx.ellipse(fx, fy, fr * 1.6, fr, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
