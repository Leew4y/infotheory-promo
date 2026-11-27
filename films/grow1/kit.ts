/**
 * Drawing pieces of 《长高一倍，体重变几倍？》 (pilot short 1 of the route 「离谱但精确」, narrator 核算员; brief:
 * D:/demo/.cache/market-research/route/pilot_short_1.md): the grid paper, the "你" figure (a solid silhouette or a
 * line drawing, two poses), the height ruler whose ticks are recomputed from the camera scale, the day counter, the
 * 「算」 tag, the oblique cube / cross-section / weights diagrams, the vertical pressure gauge, the end card and the
 * tail card (核算单). Everything takes an alpha and draws nothing when it is about 0.
 *
 * Look: paper-dawn's paper with a fixed square grid on it, ink (C.fg, C.fg2, C.muted) and one red, C.accent (the
 * same red the vertical composer uses for the 「假设」 stamp in the band). Numbers in F.math (lining figures).
 *
 * Delivered only as a vertical cut: the 1920x1080 picture is scaled to 1080x608 at y = 610 of a 1080x1920 page, the
 * band above it and the captions below it come from the composer (D:/demo/.cache/grow1-tools/vertical.py). So:
 * picture text >= 46 px (notes >= 34 px), nothing right of x = 1653 (Douyin's buttons), nothing in the top and bottom
 * 60 px; pic() enforces this for every text it draws (it throws, so a frame that breaks it fails to render).
 */
import { ctx, text, measure, rgba, C, F, clamp, lerp, sstep, eout } from '../../engine';

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

/** The tail card's rows (the brief's 2-second version of the 核算单). */
export const LEDGER = [
  '① 假设：每天长高一倍，形状不变；今天 1.7 米、70 公斤',
  '② 体重 ×8、×64、×512（算）',
  '③ 截面 ×4、×16、×64（算）',
  '④ 每平方厘米 = ② ÷ ③：×2、×4、×8（算）',
];
/** The tail card (核算单, the brief's 2-second version); u: seconds since it starts (rows come in 0.04 s apart, each in 0.22 s). */
export function tailCard(u: number): void {
  if (u <= 0) return;
  const x = 136;
  const row = (i: number) => eout(clamp((u - i * 0.04) / 0.22));
  pic('核算单', x, 196, { size: 72, a: row(0), weight: 700, font: F.body, ls: 6 });
  ctx.save();
  ctx.globalAlpha = row(0);
  ctx.fillStyle = C.accent;
  ctx.fillRect(x, 226, 240 * eout(clamp(u / 0.35)), 6);
  ctx.restore();
  LEDGER.forEach((s, i) => pic(s, x, 336 + i * 116, { size: 58, a: row(i + 1), color: C.fg }));
  pic('有错，评论区见', x, 336 + 4 * 116 + 36, { size: 46, a: row(5), color: C.muted, font: F.body });
}
