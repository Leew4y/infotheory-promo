// The whole short (lines s1-1 .. s1-11; brief D:/demo/.cache/market-research/route/pilot_short_1.md). Drawn for the
// vertical cut (the picture is scaled to 1080 x 608 in the middle of a phone screen; the band above it holds the
// 「假设」 stamp, the premise and the name plate, set by the composer): picture text >= 46 px, nothing right of
// x = 1653. Frame 0 is complete: grid paper, the counter 「第 0 天」, the question 「体重变几倍？」, the 1.7 m "你"
// silhouette with its ruler and height mark. No fade in, no engine camera: the kit zooms its own geometry (px per metre
// `s`), so text keeps its size.
//
// Zones: top left the counter and the weight line (question, then 体重 ×N = …「算」); the stage (ground y 960): the
// reference "你" (line drawing) at x 330 from day 1, the grown "你" (silhouette) at x 790, the ruler at x 1000; right
// the small diagrams (x 1150 .. 1500) and the pressure gauge (x 1590 .. 1632).
//
// Beats (scene clock = film clock; times from voParts, checked against the lock's speech spans and, inside a span,
// against the line's energy envelope: D:/demo/.cache/grow1-tools/envelope.py):
//  s1-1 你每天长高一倍。我算过了。 frame 0 as above; on 我算过了 a red pen underlines 变几倍？.
//  stamp 1 (STAMP[0], in the silence between s1-1 and s1-2): 「第 1 天」 pressed in, the silhouette grows to 3.4 m while
//       the camera pulls back (px per metre 353 -> 212; the ruler's ticks recomputed), an outline copy of the 1.7 m "你"
//       slides left and stays as the reference.
//  s1-2 体重 8 倍 -> 变几倍？ gives way to ×8; 560 公斤 -> 「= 560 公斤」 with 「算」; then a unit cube appears and doubles
//       on 长 (up), 宽 (right), 厚 (into the paper): 2×2×2 = 8 cubes, 「2×2×2 = 8」 on 各翻一倍.
//  s1-3 截面 -> the cube gives way to one cell of cross-section (「截面」); 宽 -> 2 cells; 厚 -> 2×2; 4 倍 -> 「×4」.
//  s1-4 8 倍的体重 -> 8 weights over the cells; 压在 -> they fall, 2 on each cell; 每平方厘米 -> one cell outlined red and
//       the gauge (「每平方厘米」, 「今天 = 1」) comes in; 扛两倍 -> the pointer rises to 2, 「×2」.
//  s1-5 再翻一倍 -> the stage clears while it is said (diagrams, 体重 ×8 = 560 公斤, the 3.4 m mark, the gauge's ×2
//       label); the stamp lands in the pause after the phrase: 「第 2 天」, 6.8 m.
//  s1-6 64 倍 -> 体重 ×64; 4.48 吨 -> 「= 4.48 吨」「算」; 每平方厘米 -> the gauge heading washes red and, left of the
//       gauge, what it divides: 体重 ×64 over 截面 ×16; 4 倍 -> pointer 4.
//  s1-7 / s1-8 the same for day 3 (再翻一倍 clears day 2's lines, fraction, mark and label): 13.6 m; 512 倍 -> ×512
//       and 体重 ×512 over 截面 ×64; 35.84 吨; 8 倍 -> pointer 8.
//  s1-9 说回你 -> the silhouette, counter, weight line and ruler go; the camera returns to the 1.7 m "你" (centre stage,
//       600 px), the pointer back to 1.
//  s1-10 两倍 -> pointer 2; 就是今天的你 -> 「今天的你」; 背着另一个你 -> a second "你" drops onto its shoulders (「1 个」);
//       8 倍 -> pointer 8; 背着七个 -> six more drop, the camera pulls back to fit the column of eight (「7 个」). Line
//       drawings, all the same figure, no face, the carrier upright and unchanged.
//  s1-11 正片里 -> the end card 「正片：《假如你每天长高一倍》」 (no date); gauge and column stay.
//  tail (1.5 s after the voice): everything fades in 0.2 s and the tail card 核算单 comes in at once (all rows within
//       0.4 s), so it stands still for about a second.
// Sound cues (scene sfx, exported by --cues into cues.json; D:/demo/.cache/grow1-tools/sfx_cues.py turns that into
// sfx_cues.json): 'stamp' on each counter step, 'gauge' where the pointer arrives (the next frame after the spoken
// number ends), 'end' when the tail card comes in.
import { background, narratedScene, ctx, C, F, clamp, lerp, sstep, eio, eout, ein, vo, voParts, type Sfx } from '../../../engine';
import lock from '../narration.lock.json';
import {
  STILL, grid, pic, picW, calcTag, person, column, RIDE, GROUND, ruler, RULER, heightMark, counter, COUNTER,
  ob, box, cubes, weight, gauge, endCard, tailCard, type Obl,
} from '../kit';

// ------------------------------------------------------------------------------------------------ numbers (literal)

/** Per day: the counter digit, the grown figure's height label, the weight line. */
const DAY = ['0', '1', '2', '3'];
const HEIGHT = ['1.7 米', '3.4 米', '6.8 米', '13.6 米'];
const TIMES = ['', '×8', '×64', '×512'];
const MASS = ['', '= 560 公斤', '= 4.48 吨', '= 35.84 吨'];
/** Days 2 and 3: the weight over the cross-section, beside the gauge (the brief's 核算单 rows ② and ③). */
const FRAC: [string, string][] = [['体重 ×64', '截面 ×16'], ['体重 ×512', '截面 ×64']];
/** World heights (m) and the grown figure's settled screen height (px) per day. */
const HW = [1.7, 3.4, 6.8, 13.6];
const HS = [600, 720, 760, 800];
const SCALE = HW.map((h, i) => HS[i] / h);
/** The grown figure never gets taller than this on screen while the camera catches up (head at y >= 100). */
const CAP = 860;

/** Size of the weight line's first row (体重 变几倍？ / 体重 ×N). */
const QS = 76;
/** Stage x positions: the reference "你" (and, from 说回你, the column), the grown silhouette. */
const REF_X = 300, GROWN_X = 720, TOWER_X = REF_X;
/** Bottom figure of the column: 600 px alone, 560 with one rider, 225 with seven (the column's top stays below y 95
 *  while the riders drop in). */
const TOWER_H = [600, 560, 225];
/** How far above its seat a rider starts its drop (height units), and how long the drop takes (s). */
const DROP = 0.15, DROP_T = 0.3;

// ------------------------------------------------------------------------------------------------ beats

interface Beats {
  q: number; stamp: number[]; x8: number; kg: number; cube: number; L: number; Wd: number; D: number; all: number;
  sec: number; w2: number; d2: number; x4: number; wts: number; fall: number; cm: number; carry2: number;
  again2: number; x64: number; t448: number; cm2: number; x4b: number; again3: number; x512: number; t3584: number;
  x8b: number; back: number; two: number; you: number; one: number; eight: number; seven: number; card: number; tail: number;
}
let B: Beats;
/** The two 再翻一倍 (s1-5, s1-7): the stage clears while each is said, before its stamp. */
let AGAIN: [number, number];

/** Frame-exact time (30 fps): the nearest frame, or the next one (for a cue that must not move ahead of a pause). */
const fr = (t: number): number => Math.round(t * 30) / 30;
const frUp = (t: number): number => Math.ceil(t * 30 - 1e-6) / 30;
/** When the tail card starts after the voice ends (s). */
const CARD_IN = 0.14;
/** Where speech span k of a line starts (scene seconds), from the lock's spans (pauses measured on the committed audio). */
const LOCK = (lock as unknown as { lines: Record<string, { duration: number; spans: [number, number][] }> }).lines;
const span = (id: string, k: number): number => vo(id) + LOCK[id].spans[k][0];
/** Where speech span k of a line ends (scene seconds). */
const spanEnd = (id: string, k: number): number => vo(id) + LOCK[id].spans[k][1];

function beats(): Beats {
  const [, l1b] = voParts('s1-1', ['你每天长高一倍。', '我算过了。']);
  const [l2a, l2b, l2c] = voParts('s1-2', ['体重 8 倍，', '560 公斤。', '长、', '宽、', '厚，', '各翻一倍。']);
  // voParts matches 宽 to no pause (5.70 s) and shifts 厚 and 各翻一倍 one pause early; the lock has a speech span
  // for each word (长 5.34, 宽 5.98, 厚 6.62, 各翻一倍 7.09 s), the envelope agrees: take the spans
  const [l2d, l2e, l2f] = [span('s1-2', 3), span('s1-2', 4), span('s1-2', 5)];
  const [l3a, l3b, , l3d, l3e] = voParts('s1-3', ['截面只算', '宽', '和', '厚：', '4 倍。']);
  const [l4a, l4b, l4c, l4d] = voParts('s1-4', ['8 倍的体重，', '压在 4 倍的截面上：', '每平方厘米，', '扛两倍。']);
  const [l5a] = voParts('s1-5', ['再翻一倍。']);
  const [l6a, l6b, l6c, l6d] = voParts('s1-6', ['64 倍，', '4.48 吨。', '每平方厘米，', '4 倍。']);
  const [l7a] = voParts('s1-7', ['再翻一倍。']);
  const [l8a, l8b, l8c] = voParts('s1-8', ['512 倍，', '35.84 吨。', '8 倍。']);
  const [l9a] = voParts('s1-9', ['说回你。']);
  const [lAa, lAb, lAc, lAd, lAe] = voParts('s1-10', ['两倍，', '就是今天的你，', '背着另一个你。', '8 倍，', '背着七个。']);
  const [lBa] = voParts('s1-11', ['正片里，接着往下算。']);
  return {
    q: l1b,
    // the stamps sit in the silences after 我算过了 (speech to 2.35 s, s1-2 from 2.81 s) and after each 再翻一倍
    // (speech to 17.77 / 23.51 s, the next line from 18.18 / 23.92 s), frame-exact: 2.50, 17.87, 23.60 s
    stamp: [fr(spanEnd('s1-1', 1) + 0.15), fr(spanEnd('s1-5', 0) + 0.09), fr(spanEnd('s1-7', 0) + 0.09)],
    x8: l2a, kg: l2b, cube: l2b + 0.55, L: l2c, Wd: l2d, D: l2e, all: l2f,
    // 宽 and 厚 of s1-3 share one speech span (9.35-10.10 s): the envelope (envelope.py s1-3) has 宽 from its start,
    // 和 from 0.33 s and 厚 from 0.57 s into it (9.92 s)
    sec: l3a, w2: Math.max(l3b, span('s1-3', 1)), d2: Math.max(l3d, span('s1-3', 1) + 0.57), x4: l3e,
    wts: l4a, fall: l4b, cm: l4c, carry2: l4d,
    again2: l5a, x64: l6a, t448: l6b,
    // 每平方厘米 of s1-6 starts inside the span 19.26-21.43 s: the envelope (envelope.py s1-6) has a short pause after 吨
    // and 每 (its m) from 1.19 s into the span (20.45 s)
    cm2: Math.max(l6c, span('s1-6', 1) + 1.19), x4b: l6d,
    again3: l7a, x512: l8a, t3584: l8b, x8b: l8c,
    back: l9a, two: lAa, you: lAb, one: lAc, eight: lAd, seven: lAe, card: lBa,
    // the tail card: when the last line ends (34.98 s)
    tail: vo('s1-11') + LOCK['s1-11'].duration,
  };
}

// ------------------------------------------------------------------------------------------------ the camera

/** px per metre and the grown figure's world height at time lt (days 0..3, before 说回你). */
function cam(lt: number): { s: number; hw: number; day: number; since: number } {
  let s = SCALE[0], hw = HW[0], day = 0, since = Infinity;
  for (let n = 1; n <= 3; n++) {
    const ts = B.stamp[n - 1];
    if (lt < ts) break;
    day = n;
    since = lt - ts;
    const g = eout(clamp(since / 0.6));
    hw = HW[n - 1] * Math.pow(2, g);
    const r = SCALE[n] / SCALE[n - 1];
    const eased = eio(clamp((since - 0.1) / 0.9));
    const need = (Math.log(HW[n - 1] * SCALE[n - 1]) + g * Math.LN2 - Math.log(CAP)) / -Math.log(r);
    s = SCALE[n - 1] * Math.pow(r, clamp(Math.max(eased, need)));
  }
  return { s, hw, day, since };
}

// ------------------------------------------------------------------------------------------------ diagrams

const CUBE: Obl = { x: 1060, y: 830, u: 140 };
/** The cross-section is seen more from above than the cube, so each cell's stack of weights stands clear of the others. */
const TILE: Obl = { x: 1060, y: 830, u: 150, dy: 0.58 };
const SLAB = 0.16;
/** Weight width (px), stack step (px) and how high the weights hover before they fall (px). */
const WW = 76, WSTEP = 52, HOVER = 230;
/** The 8 weights: cell (i, k) and level m; m = 0 fall first. */
const WEIGHTS: [number, number, number][] = [
  [0, 1, 0], [1, 1, 0], [0, 0, 0], [1, 0, 0], [0, 1, 1], [1, 1, 1], [0, 0, 1], [1, 0, 1],
];

/** The cube that doubles along 长 (up), 宽 (right) and 厚 (into the paper). */
function cubeDiagram(lt: number, a: number): void {
  if (a <= 0.002) return;
  const kL = eio(clamp((lt - B.L) / 0.45)), kW = eio(clamp((lt - B.Wd) / 0.45)), kD = eio(clamp((lt - B.D) / 0.45));
  const list: [number, number, number, number][] = [];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) {
    const on = (j ? sstep(B.L, B.L + 0.05, lt) : 1) * (i ? sstep(B.Wd, B.Wd + 0.05, lt) : 1) * (k ? sstep(B.D, B.D + 0.05, lt) : 1);
    if (on <= 0) continue;
    list.push([i * kW, j * kL, k * kD, on]);
  }
  const rise = (1 - eout(clamp((lt - B.cube) / 0.4))) * 14;
  ctx.save();
  ctx.translate(0, rise);
  cubes(CUBE, list, a * sstep(B.cube, B.cube + 0.3, lt));
  ctx.restore();
  // axis labels as each axis doubles; the product when the voice says 各翻一倍
  const [lx, ly] = ob(CUBE, 1 + kW, 0.5 + 0.5 * kL, 1 + kD);
  pic('长', lx + 20, ly + 20, { size: 56, a: a * sstep(B.L, B.L + 0.3, lt), font: F.body, weight: 600 });
  const [wx, wy] = ob(CUBE, 0.5 + 0.5 * kW, 0, 0);
  pic('宽', wx, wy + 68, { size: 56, a: a * sstep(B.Wd, B.Wd + 0.3, lt), font: F.body, weight: 600, align: 'center' });
  const [dx, dy] = ob(CUBE, 1 + kW, 0, 0.5 + 0.5 * kD);
  pic('厚', dx + 30, dy + 44, { size: 56, a: a * sstep(B.D, B.D + 0.3, lt), font: F.body, weight: 600 });
  const [px, py] = ob(CUBE, 1, 2, 2);
  pic('2×2×2 = 8', px, py - 34, { size: 64, a: a * sstep(B.all, B.all + 0.3, lt), weight: 600, align: 'center' });
}

/** One cell of cross-section doubling on 宽 and 厚, then the weights falling onto the 2×2 cells. */
function tileDiagram(lt: number, a: number): void {
  if (a <= 0.002) return;
  const kW = eio(clamp((lt - B.w2) / 0.4)), kD = eio(clamp((lt - B.d2) / 0.4));
  const hi = sstep(B.cm, B.cm + 0.3, lt);
  const cells: [number, number, number][] = [[0, 0, 1], [kW, 0, sstep(B.w2, B.w2 + 0.05, lt)], [0, kD, sstep(B.d2, B.d2 + 0.05, lt)], [kW, kD, sstep(B.d2, B.d2 + 0.05, lt)]];
  // in once the cube has gone (its labels and 截面 share the space below)
  const ap = a * sstep(B.sec + 0.28, B.sec + 0.55, lt);
  for (const [x, z, k] of cells.filter((q) => q[2] > 0).sort((p, q) => q[1] - p[1] || p[0] - q[0])) {
    box(TILE, x, 0, z, 1, SLAB, 1, { a: ap * k, top: C.bg2 });
  }
  // 每平方厘米: the front left cell's top outlined red
  if (hi > 0.002) {
    const pts = [ob(TILE, 0, SLAB, 0), ob(TILE, 1, SLAB, 0), ob(TILE, 1, SLAB, 1), ob(TILE, 0, SLAB, 1)];
    ctx.save();
    ctx.globalAlpha = ap * hi;
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  pic('截面', TILE.x, 912, { size: 60, a: ap, font: F.body, weight: 600 });
  pic('×4', TILE.x + picW('截面', 60, 600, F.body) + 18, 912, { size: 60, a: ap * sstep(B.x4, B.x4 + 0.25, lt), weight: 600 });
  // the weights: hover in from 8 倍的体重, fall on 压在 (gravity, one after another), back cells first
  const wa = a * sstep(B.wts, B.wts + 0.35, lt);
  if (wa <= 0.002) return;
  const order = WEIGHTS.map((w, j) => ({ w, j })).sort((p, q) => q.w[1] - p.w[1] || p.w[2] - q.w[2] || p.w[0] - q.w[0]);
  for (const { w: [i, k, m], j } of order) {
    const t0 = B.fall + 0.1 + j * 0.085, p = clamp((lt - t0) / 0.34);
    const lift = (1 - p * p) * HOVER + (1 - eout(clamp((lt - B.wts) / 0.5))) * 30;
    const [x, y] = ob(TILE, i + 0.5, SLAB, k + 0.5);
    weight(x, y - m * WSTEP - lift, WW, wa);
  }
}

// ------------------------------------------------------------------------------------------------ the gauge

/** Pointer moves: [start, end, from, to]. */
function gaugeMoves(): [number, number, number, number][] {
  return [
    // each rise starts on the spoken number and arrives just after it is said (in the pause), where the 'gauge' cue sits
    [B.carry2 + 0.15, spanEnd('s1-4', 3) + 0.03, 1, 2],
    [B.x4b, spanEnd('s1-6', 2) + 0.03, 2, 4],
    [B.x8b, spanEnd('s1-8', 2) + 0.03, 4, 8],
    [B.back + 0.1, B.back + 0.75, 8, 1],
    [B.two + 0.05, spanEnd('s1-10', 0) + 0.05, 1, 2],
    [B.eight + 0.02, spanEnd('s1-10', 3) + 0.03, 2, 8],
  ];
}
const GAUGE_LABEL: Record<number, string> = { 2: '×2', 4: '×4', 8: '×8' };
function gaugeState(lt: number): { v: number; label: string | null; la: number } {
  let v = 1, label: string | null = null, la = 0, arrived = -Infinity;
  for (const [t0, t1, from, to] of gaugeMoves()) {
    if (lt < t0) break;
    v = lerp(from, to, eio(clamp((lt - t0) / (t1 - t0))));
    label = GAUGE_LABEL[to] ?? null;
    la = sstep(t1 - 0.12, t1 + 0.1, lt);
    arrived = t1;
  }
  // a new day makes the reading stale: its label goes on 再翻一倍 and comes back with the new value (so ×2 never
  // stands beside day 2's 体重 ×64 over 截面 ×16)
  for (const ts of [B.again2, B.again3]) if (ts > arrived && lt >= ts) la *= 1 - sstep(ts, ts + 0.3, lt);
  return { v, label, la };
}

// ------------------------------------------------------------------------------------------------ the scene

const S = narratedScene({
  name: 's1', kind: 'page', lead: 0, gap: 0.35, tail: 1.5, ...STILL,
  draw(lt) {
    background();
    grid();
    const out = 1 - sstep(B.tail, B.tail + 0.2, lt);
    // 说回你: the hypothetical leaves the picture
    const back = sstep(B.back, B.back + 0.35, lt);

    // ---- the camera and the figures
    const c = cam(lt);
    const zin = eio(clamp((lt - B.back) / 0.9));
    const s = lt < B.back ? c.s : SCALE[3] * Math.pow(SCALE[0] / SCALE[3], zin);
    const refH = HW[0] * s;
    // the reference: an outline copy that leaves the silhouette at stamp 1 and stays at REF_X; on 说回你 it moves to
    // centre stage and becomes the bottom of the column
    const leave = eio(clamp((lt - B.stamp[0] - 0.05) / 0.9));
    const refX = lerp(lerp(GROWN_X, REF_X, leave), TOWER_X, zin);
    // the column: the bottom figure's screen height, 600 px after 说回你, a little less as the first rider comes (背着另一个你),
    // then pulled back on 8 倍 so the six more riders of 背着七个 fit
    const z2 = eio(clamp((lt - B.one) / 0.5)), z8 = eio(clamp((lt - B.eight - 0.02) / 0.8));
    const tH = lt < B.back + 0.9 ? refH : Math.exp(lerp(lerp(Math.log(TOWER_H[0]), Math.log(TOWER_H[1]), z2), Math.log(TOWER_H[2]), z8));
    const riders: { a: number; drop: number }[] = [];
    for (let k = 0; k < 7; k++) {
      const t0 = k === 0 ? B.one + 0.05 : B.seven + 0.02 + (k - 1) * 0.11, p = clamp((lt - t0) / DROP_T);
      if (p <= 0) break;
      riders.push({ a: sstep(0, 0.3, p), drop: (1 - ein(p)) * DROP * tH });
    }
    if (lt >= B.stamp[0]) {
      if (riders.length) column(TOWER_X, tH, riders, out);
      else person(refX, GROUND, tH, { look: 'line', a: out });
      // its height label, until 说回你
      const ra = sstep(B.stamp[0] + 0.7, B.stamp[0] + 1.0, lt) * (1 - back) * out;
      pic('1.7 米', refX, GROUND - refH - 22, { a: ra, align: 'center', color: C.fg2 });
    }
    // the grown silhouette (frame 0: the only figure)
    const gh = c.hw * s, ga = (1 - sstep(B.back, B.back + 0.28, lt)) * out;
    person(GROWN_X, GROUND, gh, { look: 'solid', a: ga });
    // its height on the ruler, once it has settled after each stamp
    const n = c.day, settle = n === 0 ? 1 : sstep(B.stamp[n - 1] + 0.95, B.stamp[n - 1] + 1.25, lt);
    const markA = settle * (n === 1 || n === 2 ? 1 - sstep(AGAIN[n - 1], AGAIN[n - 1] + 0.35, lt) : 1) * (1 - sstep(B.back, B.back + 0.1, lt)) * out;
    const markY = GROUND - gh;
    heightMark(GROWN_X + gh * 0.06, markY, HEIGHT[n], markA);
    ruler(s, (1 - back) * out, markA > 0.05 ? markY : null);
    // the ground line under the stage
    ctx.save();
    ctx.globalAlpha = out;
    ctx.strokeStyle = C.fg;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(128, GROUND);
    ctx.lineTo(RULER.x + 110, GROUND);
    ctx.stroke();
    ctx.restore();

    // ---- the column of "你" (s1-10): the bracket beside the riders and their count
    if (lt >= B.one) {
      const k7 = sstep(B.seven + 0.75, B.seven + 0.95, lt);
      const top = GROUND - tH * (1 + (k7 > 0.5 ? 7 : 1) * RIDE);
      const bot = GROUND - tH * 0.835;
      const bx = TOWER_X + tH * 0.18 + 26;
      const ba = sstep(B.one + 0.35, B.one + 0.65, lt) * out * (1 - sstep(B.seven, B.seven + 0.15, lt) * (1 - k7));
      if (ba > 0.002) {
        ctx.save();
        ctx.globalAlpha = ba;
        ctx.strokeStyle = C.fg2;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(bx - 12, top);
        ctx.lineTo(bx, top);
        ctx.lineTo(bx, bot);
        ctx.lineTo(bx - 12, bot);
        ctx.stroke();
        ctx.restore();
        pic(k7 > 0.5 ? '7 个' : '1 个', bx + 18, (top + bot) / 2 + 18, { size: 60, a: ba, weight: 600 });
      }
    }
    // 就是今天的你: the label right of the bottom figure, at its hips (below the bracket, which starts at its shoulders)
    const ya = sstep(B.you, B.you + 0.3, lt) * out;
    pic('今天的你', TOWER_X + tH * 0.18 + 28, GROUND - tH * 0.36 + 18, { size: 54, a: ya, font: F.body, weight: 600 });

    // ---- the counter and the weight line (top left), until 说回你
    const ta = (1 - back) * out;
    counter(DAY[c.day], c.since, ta);
    const qa = ta * (1 - sstep(B.x8 - 0.01, B.x8, lt));
    const W0 = picW('体重', QS, 600, F.body);
    // 体重 stays; it is off only between 再翻一倍 and the voice's next 体重 ×N
    const off = (k: number, t1: number) => (lt < AGAIN[k - 1] || lt >= t1 ? 1 : 1 - sstep(AGAIN[k - 1], AGAIN[k - 1] + 0.4, lt));
    pic('体重', COUNTER.x, 330, { size: QS, a: ta * off(1, B.x64) * off(2, B.x512), weight: 600, font: F.body });
    pic('变几倍？', COUNTER.x + W0, 330, { size: QS, a: qa, weight: 600, font: F.body });
    // 我算过了: a red pen under 变几倍？
    const pen = eout(clamp((lt - B.q) / 0.45));
    if (pen > 0 && qa > 0.002) {
      const x0 = COUNTER.x + W0 + 4, x1 = x0 + picW('变几倍？', QS, 600, F.body) - 22;
      ctx.save();
      ctx.globalAlpha = qa;
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, 356);
      ctx.lineTo(lerp(x0, x1, pen), 356 + 3 * pen);
      ctx.stroke();
      ctx.restore();
    }
    // the answer per day: 体重 ×N on the voice's number, = mass 「算」 on its mass; both go on the next 再翻一倍
    for (let d = 1; d <= 3; d++) {
      const tN = [B.x8, B.x64, B.x512][d - 1], tM = [B.kg, B.t448, B.t3584][d - 1];
      const gone = d < 3 ? 1 - sstep(AGAIN[d - 1], AGAIN[d - 1] + 0.4, lt) : 1;
      const na = ta * sstep(tN, tN + 0.2, lt) * gone;
      if (na > 0.002) pic(TIMES[d], COUNTER.x + W0 + 22, 330 - (1 - eout(clamp((lt - tN) / 0.3))) * 10, { size: QS, a: na, weight: 600 });
      const ma = ta * sstep(tM, tM + 0.25, lt) * gone;
      if (ma > 0.002) {
        const x = COUNTER.x, y = 428 - (1 - eout(clamp((lt - tM) / 0.3))) * 10;
        pic(MASS[d], x, y, { size: 64, a: ma });
        calcTag(x + picW(MASS[d], 64) + 18, y, ma);
      }
    }

    // ---- the diagrams (right), from 560 公斤 to the first 再翻一倍
    const da = (1 - sstep(B.again2, B.again2 + 0.5, lt)) * out;
    cubeDiagram(lt, da * (1 - sstep(B.sec, B.sec + 0.3, lt)));
    if (lt >= B.sec) tileDiagram(lt, da);

    // ---- days 2 and 3: what the gauge divides (weight over cross-section), left of it, from the voice's 每平方厘米
    // (day 2) and 512 倍 (day 3) to the next 再翻一倍 / 说回你
    for (let d = 2; d <= 3; d++) {
      const t0 = d === 2 ? B.cm2 : B.x512, t1 = d === 2 ? B.again3 : B.back;
      const fa = sstep(t0, t0 + 0.3, lt) * (1 - sstep(t1, t1 + 0.2, lt)) * out;
      if (fa <= 0.002) continue;
      const [num, den] = FRAC[d - 2], fx = 1408, w = Math.max(picW(num, 60, 600), picW(den, 60, 600));
      pic(num, fx, 568, { size: 60, a: fa, weight: 600, align: 'right' });
      ctx.save();
      ctx.globalAlpha = fa;
      ctx.strokeStyle = C.fg;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(fx - w - 10, 598);
      ctx.lineTo(fx + 6, 598);
      ctx.stroke();
      ctx.restore();
      pic(den, fx, 664, { size: 60, a: fa, weight: 600, align: 'right' });
    }

    // ---- the gauge, from 每平方厘米 (s1-4) to the end
    const g = gaugeState(lt);
    const hi = sstep(B.cm, B.cm + 0.2, lt) * (1 - sstep(B.cm + 0.8, B.cm + 1.3, lt)) + sstep(B.cm2, B.cm2 + 0.2, lt) * (1 - sstep(B.cm2 + 0.8, B.cm2 + 1.3, lt));
    gauge(g.v, g.label, sstep(B.cm, B.cm + 0.35, lt) * out, g.la, hi);

    // ---- s1-11: the end card; the tail: 核算单
    endCard(620, 560 + (1 - eout(clamp((lt - B.card) / 0.4))) * 10, sstep(B.card, B.card + 0.35, lt) * out);
    tailCard(lt - B.tail - CARD_IN);
  },
});

B = beats();
AGAIN = [B.again2, B.again3];
// the beat table, for the check tools (D:/demo/.cache/grow1-tools/probe.ts); nothing reads it while drawing
(globalThis as unknown as { __beats: Beats }).__beats = B;
// sound cues on the same beats: the three counter steps, each pointer arrival, the tail card
const cues: Sfx[] = [
  ...B.stamp.map((t): Sfx => [t, 'stamp']),
  ...gaugeMoves().filter(([, , , to]) => to > 1).map(([, t1]): Sfx => [frUp(t1), 'gauge']),
  [frUp(B.tail + CARD_IN), 'end'],
];
S.sfx = cues;
