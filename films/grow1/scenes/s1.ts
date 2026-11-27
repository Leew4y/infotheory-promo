// The whole short, v2 (brief films/grow1/docs/pilot_short_1_v2.md: its 配音定稿 table, 11 lines). Drawn for the vertical
// cut (the picture is scaled to 1080 x 608 in the middle of a phone screen; the band above it holds the 「假设」 stamp,
// the three premise lines and the name plate, set by the composer): picture text >= 46 px, nothing right of x = 1653,
// nothing in the top and bottom 60 px. No fade in, no engine camera: the kit zooms its own geometry (px per metre `s`),
// so text keeps its size.
//
// Zones (frame px): A, x 128..520: the counter, the weight line (体重 ×N, = mass 「算」), under it the cube and the
// cross-section with the weights (day 1) or 「= 64 个你」/「= 512 个你」 and the crowd (days 2, 3). The building, x 590..850
// (a cutaway, 3 m floors in world metres, its width fixed); the grown silhouette right outside it on the same ground;
// D, right of the silhouette: the head readout (height, 「头顶：N 楼」) and the clothes label; the gauge x 1590..1632.
// During g5b a close-up panel (x 520..1540) magnifies the 5th-floor window: the head top with its whorl above the sill,
// the neighbour with the watering can and 「……」. From s1-10's 两倍 the picture is v1's ending: today's "你" carrying
// one, then seven; after g9's question the comment card, on 正片里算 the end card; the tail card 核算单.
//
// Beats (scene clock = film clock; from voParts, the lock's speech spans and, inside a span, the line's energy envelope:
// tools/grow1/envelope.py). Stamps sit in the silences: day 1 after s1-1, day 2 right after s1-4's 扛两倍 (so day 2,
// told only on screen, stands for about 2 s, through both 再翻一倍), day 3 after s1-7. Bubble pops and gauge ticks also
// sit in silences (the sound never covers a syllable): 「？」 after g1, 「！」 between s1-5 and s1-7, 「……」 in g5b's pause.
import { background, narratedScene, ctx, C, F, clamp, lerp, sstep, eio, eout, ein, vo, voParts, type Sfx } from '../../../engine';
import lock from '../narration.lock.json';
import {
  STILL, grid, pic, picW, calcTag, person, column, RIDE, GROUND, counter, COUNTER, GRID,
  ob, box, cubes, weight, gauge, endCard, tailCard, commentCard, type Obl,
  IDENT, type View, building, floorOf, FLOOR_M, SILL_M, table, bowl, book, potAndCan, bubble, whorl, shirtSeams, crowd,
  windowView, rubberStamp,
} from '../kit';

// ------------------------------------------------------------------------------------------------ numbers (literal)

/** Per day: the counter digit, the grown figure's height label, the floor its head is in, the weight line. */
const DAY = ['0', '1', '2', '3'];
const HEIGHT = ['1.7 米', '3.4 米', '6.8 米', '13.6 米'];
const HEAD_FLOOR = [1, 2, 3, 5];
const TIMES = ['', '×8', '×64', '×512'];
const MASS = ['', '= 560 公斤', '= 4.48 吨', '= 35.84 吨'];
/** Weight as people (days 2 and 3) and the clothes sewn from n × n shirts (面积按平方). */
const PEOPLE = ['', '', '= 64 个你', '= 512 个你'];
const SHIRTS = ['', '4 件拼 1 件', '16 件拼 1 件', '64 件拼 1 件'];
const SEAMS = [1, 2, 4, 8];
/** Day 3: what the gauge divides (weight over cross-section), left of it (the tail card's rows ③ and ④). */
const FRAC: [string, string] = ['体重 ×512', '截面 ×64'];
/** World heights (m) and the grown figure's settled screen height (px) per day: day 1 shows 2 floors, day 2 three,
 *  day 3 five (the 15 m roof below y 60). */
const HW = [1.7, 3.4, 6.8, 13.6];
const HS = [600, 450, 600, 760];
const SCALE = HW.map((h, i) => HS[i] / h);
for (let d = 0; d < 4; d++) {
  if (floorOf(HW[d]) !== HEAD_FLOOR[d]) throw new Error(`grow1: ${HW[d]} m is not in floor ${HEAD_FLOOR[d]}`);
  if (Math.abs(HW[d] - 1.7 * 2 ** d) > 1e-9) throw new Error(`grow1: day ${d} height`);
}
/** The grown figure never gets taller than this on screen while the camera catches up (head at y >= 100). */
const CAP = 860;
/** Size of the weight line's first row (体重 变几倍？ / 体重 ×N). */
const QS = 76;
/** The building (frame px) and where the figures stand: the grown "你" right outside its right wall; the 1.7 m reference
 *  (from day 1) inside the 1 楼 door; the neighbours by the right wall. */
const BX0 = 590, BX1 = 850;
const grownX = (gh: number): number => BX1 + 0.168 * gh + 16;
const REF_IN = BX1 - 50;
interface Neighbour { floor: number; x: number; h: number; text: string }
const NB: Neighbour[] = [
  { floor: 2, x: BX1 - 112, h: 1.7, text: '？' },
  { floor: 3, x: BX1 - 112, h: 1.25, text: '！' },
  { floor: 5, x: BX1 - 60, h: 1.7, text: '……' },
];
/** The column of s1-10 (v1's ending): the bottom figure 600 px alone, 560 with one rider, 225 with seven. */
const TOWER_X = 300;
const TOWER_H = [600, 560, 225];
const DROP = 0.15, DROP_T = 0.3;
/**
 * The hook cut (built with VITE_GROW1_HOOK=1; the plain v2 build is unchanged): a cold open. From frame 0 to HOOK_HOLD
 * the picture is day 3's result (the building, the 13.6 m silhouette beside it with its whorl and 8 x 8 seams, 「第 3 天」
 * 「头顶到 5 楼」), then it rewinds to day 0 by HOOK_END (the counter ticking 3-2-1-0, a rewind mark), before 我算过了.
 * Picture only: the voice, the timeline, the captions and the sound are v2's.
 */
const HOOK = import.meta.env.VITE_GROW1_HOOK === '1';
const HOOK_HOLD = 1.2, HOOK_END = 1.7;
/** 1 while the cold open shows day 3, easing to 0 (day 0) by HOOK_END; always 0 in the plain build. */
const hookK = (lt: number): number => (HOOK ? 1 - eio(clamp((lt - HOOK_HOLD) / (HOOK_END - HOOK_HOLD))) : 0);

/** The close-up of the 5th-floor window (a front view from inside): the panel, px per metre, the floor's y, the
 *  window's centre x, the neighbour's x. */
const PANEL = { x0: 128, y0: 80, x1: 1640, y1: 1000 };
const CLOSE = { s: 400, floor: 975, cx: 1080, nb: 470 };

// ------------------------------------------------------------------------------------------------ beats

interface Beats {
  q: number; stamp: number[]; h34: number; top2: number; pop2: number;
  x8: number; kg: number; cube: number; L: number; Wd: number; D: number; all: number;
  sec: number; w2: number; d2: number; x4: number; wts: number; fall: number; cm: number; r2: number; carry2: number;
  again2: number; pop3: number; again3: number;
  x512: number; t3584: number; cm3: number; x8s: number; r8: number;
  top5: number; close: number; pop5: number; sorry: number; apol: number;
  col: number; two: number; two2: number; you: number; one: number; eight: number; eight2: number; seven: number;
  ask: number; bone: number; cant: number; card: number; tail: number;
}
let B: Beats;

/** Frame-exact time (30 fps): the nearest frame, or the next one (for a cue that must not move ahead of a pause). */
const fr = (t: number): number => Math.round(t * 30) / 30;
const frUp = (t: number): number => Math.ceil(t * 30 - 1e-6) / 30;
/** When the tail card starts after the voice ends (s). */
const CARD_IN = 0.14;
/** Where speech span k of a line starts / ends (scene seconds), from the lock's spans (pauses measured on the audio). */
const LOCK = (lock as unknown as { lines: Record<string, { duration: number; spans: [number, number][] }> }).lines;
const span = (id: string, k: number): number => vo(id) + LOCK[id].spans[k][0];
const spanEnd = (id: string, k: number): number => vo(id) + LOCK[id].spans[k][1];

function beats(): Beats {
  const [, l1b] = voParts('s1-1', ['你每天长高一倍。', '我算过了。']);
  // g1 is one speech span; its envelope (envelope.py g1) has 三点四米 from 0.65 s and, after a pause at 1.53-1.56 s,
  // 头顶到了二楼 from 1.62 s; 二楼 from about 2.25 s
  const g1 = vo('g1');
  const [l2a, l2b, l2c] = voParts('s1-2', ['体重 8 倍，', '560 公斤。', '长、', '宽、', '厚，', '各翻一倍。']);
  // voParts shifts 宽 and 厚 one pause early; the lock has a span for each word (as v1): take the spans
  const [l2d, l2e, l2f] = [span('s1-2', 3), span('s1-2', 4), span('s1-2', 5)];
  const [l3a, l3b, , l3d, l3e] = voParts('s1-3', ['截面只算', '宽', '和', '厚：', '4 倍。']);
  const [l4a, l4b, l4c, l4d] = voParts('s1-4', ['8 倍的体重，', '压在 4 倍的截面上：', '每平方厘米，', '扛两倍。']);
  const [l8a, l8b, l8c, l8d] = voParts('s1-8b', ['512 倍，', '35.84 吨。', '每平方厘米，', '8 倍。']);
  const [g5a, g5b, g5c] = voParts('g5b', ['头顶到了 5 楼。', '5 楼的邻居，', '我替你道过歉了。']);
  const [lAa, lAb, lAc, lAd, lAe] = voParts('s1-10', ['两倍，', '就是今天的你，', '背着另一个你。', '8 倍，', '背着七个。']);
  const [, , , l9d] = voParts('g9', ['第几天，', '骨头', '扛不住？', '正片里算。']);
  return {
    q: l1b,
    stamp: [fr(spanEnd('s1-1', 1) + 0.12), fr(spanEnd('s1-4', 3) + 0.03), fr(spanEnd('s1-7', 0) + 0.03)],
    h34: g1 + 0.66, top2: g1 + 1.62, pop2: frUp(spanEnd('g1', 0) + 0.04),
    x8: l2a, kg: l2b, cube: l2b + 0.55, L: l2c, Wd: l2d, D: l2e, all: l2f,
    // s1-3 (v1's take): 宽 from the start of span 1, 厚 from 0.57 s into it (envelope.py s1-3)
    sec: l3a, w2: Math.max(l3b, span('s1-3', 1)), d2: Math.max(l3d, span('s1-3', 1) + 0.57), x4: l3e,
    wts: l4a, fall: l4b, cm: l4c, carry2: l4d,
    // the ×2 pointer rises in the pause before 扛两倍 (the pause after it holds the day-2 stamp)
    r2: frUp(spanEnd('s1-4', 2) + 0.03),
    again2: vo('s1-5'), pop3: frUp(spanEnd('s1-5', 0) + 0.04), again3: vo('s1-7'),
    x512: l8a, t3584: l8b, cm3: l8c, x8s: Math.max(l8d, span('s1-8b', 3)), r8: frUp(spanEnd('s1-8b', 3) + 0.03),
    top5: g5a, close: spanEnd('g5b', 0) - 0.12, pop5: fr((spanEnd('g5b', 0) + span('g5b', 1)) / 2),
    // 「已道歉」 lands once 我替你道过歉了 has been said (its sound in the pause after); the close-up stays a little into
    // s1-10 so the stamp can be seen, then the column comes in
    sorry: Math.max(g5c, span('g5b', 2)), apol: frUp(spanEnd('g5b', 2) + 0.04),
    col: vo('s1-10') + 0.35, two: lAa, two2: frUp(spanEnd('s1-10', 0) + 0.03), you: lAb, one: lAc, eight: lAd,
    eight2: frUp(spanEnd('s1-10', 3) + 0.03), seven: lAe,
    // the comment card once the question has been asked (after 扛不住？), the end card on 正片里算
    ask: fr(spanEnd('g9', 2) + 0.06), bone: span('g9', 1), cant: span('g9', 2), card: l9d,
    tail: vo('g9') + LOCK['g9'].duration,
  };
}

// ------------------------------------------------------------------------------------------------ the camera

/** px per metre and the grown figure's world height at time lt (days 0..3). */
function cam(lt: number): { s: number; hw: number; day: number; since: number } {
  const k = hookK(lt);
  if (k > 0) return { s: SCALE[0] * Math.pow(SCALE[3] / SCALE[0], k), hw: HW[0] * Math.pow(HW[3] / HW[0], k), day: 0, since: Infinity };
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

/** How present day d's items are at lt: in from t0 (fade 0.25 s), out on the next stamp (0.25 s). */
function dayA(d: number, t0: number, lt: number, fade = 0.25): number {
  const gone = d < 3 ? sstep(B.stamp[d], B.stamp[d] + 0.25, lt) : 0;
  return sstep(t0, t0 + fade, lt) * (1 - gone);
}

// ------------------------------------------------------------------------------------------------ diagrams (zone A)

const CUBE: Obl = { x: 150, y: 880, u: 100 };
/** The cross-section is seen more from above than the cube, so each cell's stack of weights stands clear of the others. */
const TILE: Obl = { x: 150, y: 880, u: 110, dy: 0.58 };
const SLAB = 0.16;
/** g9's bone cell (one cell of the cross-section, right of the column). */
const BONE: Obl = { x: 1130, y: 925, u: 110, dy: 0.58 };
/** Weight width (px), stack step (px) and how high the weights hover before they fall (px). */
const WW = 64, WSTEP = 44, HOVER = 140;
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
  const [lx, ly] = ob(CUBE, 1 + kW, 0.5 + 0.5 * kL, 1 + kD);
  pic('长', lx + 16, ly + 20, { size: 56, a: a * sstep(B.L, B.L + 0.3, lt), font: F.body, weight: 600 });
  const [wx, wy] = ob(CUBE, 0.5 + 0.5 * kW, 0, 0);
  pic('宽', wx, wy + 64, { size: 56, a: a * sstep(B.Wd, B.Wd + 0.3, lt), font: F.body, weight: 600, align: 'center' });
  const [dx, dy] = ob(CUBE, 1 + kW, 0, 0.5 + 0.5 * kD);
  pic('厚', dx + 22, dy + 44, { size: 56, a: a * sstep(B.D, B.D + 0.3, lt), font: F.body, weight: 600 });
  const [px, py] = ob(CUBE, 1, 2, 2);
  pic('2×2×2 = 8', px, py - 30, { size: 64, a: a * sstep(B.all, B.all + 0.3, lt), weight: 600, align: 'center' });
}

/** One cell of the bone's cross-section doubling on 宽 and 厚, then the weights falling onto the 2×2 cells. */
function tileDiagram(lt: number, a: number): void {
  if (a <= 0.002) return;
  const kW = eio(clamp((lt - B.w2) / 0.4)), kD = eio(clamp((lt - B.d2) / 0.4));
  const hi = sstep(B.cm, B.cm + 0.3, lt);
  const cells: [number, number, number][] = [[0, 0, 1], [kW, 0, sstep(B.w2, B.w2 + 0.05, lt)], [0, kD, sstep(B.d2, B.d2 + 0.05, lt)], [kW, kD, sstep(B.d2, B.d2 + 0.05, lt)]];
  const ap = a * sstep(B.sec + 0.28, B.sec + 0.55, lt);
  for (const [x, z, k] of cells.filter((q) => q[2] > 0).sort((p, q) => q[1] - p[1] || p[0] - q[0])) {
    box(TILE, x, 0, z, 1, SLAB, 1, { a: ap * k, top: C.bg2 });
  }
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
  // 「骨头截面」: the picture says once what the cross-section is of (g9 asks when the bones give out)
  pic('骨头截面', TILE.x, 948, { size: 56, a: ap, font: F.body, weight: 600 });
  pic('×4', TILE.x + picW('骨头截面', 56, 600, F.body) + 16, 948, { size: 56, a: ap * sstep(B.x4, B.x4 + 0.25, lt), weight: 600 });
  const wa = a * sstep(B.wts, B.wts + 0.35, lt);
  if (wa <= 0.002) return;
  const order = WEIGHTS.map((w, j) => ({ w, j })).sort((p, q) => q.w[1] - p.w[1] || p.w[2] - q.w[2] || p.w[0] - q.w[0]);
  for (const { w: [i, k, m], j } of order) {
    const t0 = B.fall + 0.1 + j * 0.085, p = clamp((lt - t0) / 0.34);
    const lift = (1 - p * p) * HOVER + (1 - eout(clamp((lt - B.wts) / 0.5))) * 24;
    const [x, y] = ob(TILE, i + 0.5, SLAB, k + 0.5);
    weight(x, y - m * WSTEP - lift, WW, wa);
  }
}

// ------------------------------------------------------------------------------------------------ the gauge

/** Pointer moves: [start, end, from, to]. Each rise sits in a pause, where its ticks sound. Day 2's ×4 is silent. */
function gaugeMoves(): [number, number, number, number][] {
  return [
    [B.r2, B.r2 + 0.26, 1, 2],
    [B.stamp[1] + 0.7, B.stamp[1] + 1.0, 2, 4],
    // 8 倍 (s1-8b): from the word, arriving in the pause after it, where the ticks are
    [B.x8s, B.r8 + 0.14, 4, 8],
    // while the close-up hides it, back to today's 1
    [B.close + 0.5, B.close + 0.6, 8, 1],
    // the ending (brief: "你"背着一个 -> ×2, 叠到 7 个 -> ×8): ×2 as the first rider lands (silent: inside speech), ×8
    // from 8 倍 to the pause after it (ticks there)
    [B.one + 0.05, B.one + 0.4, 1, 2],
    [B.eight, B.eight2 + 0.12, 2, 8],
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
  // a new day makes the reading stale: its label goes with the stamp and comes back with the new value
  for (const ts of [B.stamp[1], B.stamp[2]]) if (ts > arrived && lt >= ts) la *= 1 - sstep(ts, ts + 0.25, lt);
  return { v, label, la };
}

// ------------------------------------------------------------------------------------------------ the world

/** The building, the neighbours, the reference and the grown silhouette, through a view (main or close-up). */
function world(lt: number, v: View, a: number, c: { s: number; hw: number; day: number; since: number }, close: boolean, labelA = 1): void {
  // (close: the earlier section close-up; the close-up is now windowView, in the scene)
  if (a <= 0.002) return;
  const s = c.s, gh = c.hw * s, gx = grownX(gh);
  const Yb = (m: number) => GROUND - m * s;
  // the building: its lines fade out at the top of the picture while it goes on above it; once its roof is in the
  // picture (day 3) nothing fades
  const roof = Yb(15);
  const fadeTop = close ? -Infinity : 60 - 95 * clamp((roof - 60) / 60);
  const inPanel = (x0: number, y0: number, x1: number, y1: number) =>
    x0 >= PANEL.x0 + 12 && x1 <= PANEL.x1 - 12 && y0 >= PANEL.y0 + 12 && y1 <= PANEL.y1 - 12;
  building({ x0: BX0, x1: BX1, ground: GROUND, s, v, a, fadeTop, labelA, room: close ? inPanel : undefined });
  // neighbours: a line drawing each, 1.7 m (the kid 1.25 m) in world metres, with a prop; shown once wholly in the
  // picture (they come in from the top while the camera pulls back)
  for (const nb of NB) {
    const floorY = Yb((nb.floor - 1) * FLOOR_M), h = nb.h * s, headY = v.y(floorY - h);
    const na = a * (close ? 1 : sstep(70, 130, headY - 20));
    if (na <= 0.002) continue;
    if (nb.floor === 2) {
      const top = table(BX0 + 36, BX1 - 150, floorY, s, v, na);
      bowl((BX0 + 36 + BX1 - 150) / 2, top, s, v, na);
    } else if (nb.floor === 3) {
      const top = table(BX0 + 36, BX1 - 150, floorY, s, v, na, 0.7);
      book((BX0 + 36 + BX1 - 150) / 2, top, s, v, na);
    }
    person(v.x(nb.x), v.y(floorY), h * v.z, { look: 'line', a: na });
    if (nb.floor === 5) potAndCan(BX1 - 14, Yb(4 * FLOOR_M + SILL_M), nb.x + 0.2 * h, floorY - 0.52 * h, s, v, na);
  }
  // the reference: an outline copy that leaves the silhouette at the day-1 stamp and walks in at the 1 楼 door
  if (lt >= B.stamp[0]) {
    const leave = eio(clamp((lt - B.stamp[0] - 0.05) / 0.9));
    person(v.x(lerp(gx, REF_IN, leave)), v.y(GROUND), HW[0] * s * v.z, { look: 'line', a });
  }
  // the grown silhouette, its shirt's seams, the whorl on day 3
  person(v.x(gx), v.y(GROUND), gh * v.z, { look: 'solid', a });
  const d = c.day, sa = d ? a * seamsA(lt, d) : 0;
  if (sa > 0.002) shirtSeams(v.x(gx), v.y(GROUND), gh * v.z, SEAMS[d], sa, seamsK(lt, d));
  const hk = hookK(lt);
  if (hk > 0.002) {
    shirtSeams(v.x(gx), v.y(GROUND), gh * v.z, 8, a * hk, 1);
    const r = 0.06 * gh * v.z;
    whorl(v.x(gx), v.y(GROUND - 0.94 * gh) - 0.6 * r, 0.4 * r, a * hk);
  }
  if (d === 3) {
    const r = 0.06 * gh * v.z;
    whorl(v.x(gx), v.y(GROUND - 0.94 * gh) - 0.6 * r, 0.4 * r, a * sstep(B.stamp[2] + 0.6, B.stamp[2] + 0.9, lt));
  }
}
/** The seams: day 1 in on 长 and 宽 (s1-2), days 2 and 3 once the figure has grown; out with the next stamp. */
function seamsA(lt: number, d: number): number {
  return dayA(d, d === 1 ? B.L : B.stamp[d - 1] + 0.7, lt);
}
function seamsK(lt: number, d: number): number {
  return d === 1 ? eio(clamp((lt - B.L) / (B.Wd + 0.3 - B.L))) : eio(clamp((lt - B.stamp[d - 1] - 0.7) / 0.4));
}

/** When the bubble of a floor's neighbour pops (its day, then out with the next stamp). */
function bubbleState(lt: number, floor: number): { u: number; a: number } {
  if (floor === 2) return { u: lt - B.pop2, a: dayA(1, B.pop2, lt, 0.01) };
  if (floor === 3) return { u: lt - B.stamp[1] - 0.6, a: dayA(2, B.stamp[1] + 0.6, lt, 0.01) };
  return { u: lt - B.pop5, a: sstep(B.pop5, B.pop5 + 0.01, lt) };
}

// ------------------------------------------------------------------------------------------------ the scene

const S = narratedScene({
  name: 's1', kind: 'page', lead: 0, gap: 0.2, tail: 1.5, ...STILL,
  // g5b's captions are the scene's own (below): one per phrase, each from where it is spoken, so the line's last phrase
  // (the punchline) is not on screen before it is said
  shown: ['g5b'],
  draw(lt) {
    background();
    grid();
    const out = 1 - sstep(B.tail, B.tail + 0.2, lt);
    // the main view leaves on s1-10's 两倍 (the column of "你" comes in); the close-up covers it during g5b
    // (and it stays hidden once the close-up panel is opaque, so nothing shows through while the panel fades out)
    const mv = (1 - sstep(B.col, B.col + 0.3, lt)) * (1 - sstep(B.close + 0.3, B.close + 0.33, lt)) * out;
    const closeA = sstep(B.close, B.close + 0.3, lt) * (1 - sstep(B.col, B.col + 0.3, lt)) * out;
    const c = cam(lt);
    const s = c.s, gh = c.hw * s, gx = grownX(gh), d = c.day;

    // ---- the world: building, neighbours, figures, on the ground line
    world(lt, IDENT, mv, c, false, 1 - closeA);
    ctx.save();
    ctx.globalAlpha = mv;
    ctx.strokeStyle = C.fg;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(BX0 - 40, GROUND);
    ctx.lineTo(1300, GROUND);
    ctx.stroke();
    ctx.restore();
    // the neighbours' bubbles (main view): 「？」 on day 1, 「！」 on day 2
    for (const nb of NB.slice(0, 2)) {
      const b = bubbleState(lt, nb.floor);
      if (b.a <= 0.002 || mv <= 0.002) continue;
      const head = GROUND - ((nb.floor - 1) * FLOOR_M + nb.h) * s;
      const txt = nb.floor === 2 && lt >= B.carry2 ? '？？' : nb.text;
      bubble(nb.x + 30, head - 70, txt, nb.x + 6, head - 6, b.u, b.a * mv);
    }

    // ---- zone D: the head readout (height, 头顶：N 楼) and the clothes label, right of the silhouette
    const rx = gx + 0.168 * gh + 28, headY = GROUND - gh;
    const hA = (d === 0 ? 1 - sstep(0, 0.25, hookK(lt)) : dayA(d, B.stamp[d - 1] + 0.6, lt)) * mv * (1 - closeA);
    const hT = d === 1 ? B.h34 : d === 0 ? 0 : B.stamp[d - 1] + 0.6;
    const ha = hA * sstep(hT, hT + 0.2, lt);
    if (ha > 0.002) {
      ctx.save();
      ctx.globalAlpha = ha;
      ctx.strokeStyle = C.fg;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(gx + 0.07 * gh, headY);
      ctx.lineTo(rx - 12, headY);
      ctx.stroke();
      ctx.restore();
      pic(HEIGHT[d], rx, headY + 22, { size: 66, a: ha, weight: 600 });
    }
    if (d > 0) {
      const tT = [0, B.top2, B.stamp[1] + 0.6, B.top5][d];
      const ta2 = dayA(d, tT, lt, 0.2) * mv * (1 - closeA);
      // day 3: a line lower, clear of the gauge's heading (its head is near the top of the picture)
      pic(`头顶：${HEAD_FLOOR[d]} 楼`, rx, headY + (d === 3 ? 236 : 146), { size: 70, a: ta2, weight: 700, font: F.body });
      const ca = dayA(d, d === 1 ? B.all : B.stamp[d - 1] + (d === 2 ? 1.0 : 0.85), lt) * mv * (1 - closeA);
      if (ca > 0.002) {
        const cy = GROUND - 0.5 * gh;
        pic('衣服', rx, cy, { size: 58, a: ca, weight: 600, font: F.body });
        pic(SHIRTS[d], rx, cy + 70, { size: 58, a: ca, weight: 600 });
      }
    }

    // ---- zone A: the counter and the weight line (covered by the close-up)
    const ta = mv * (1 - closeA);
    const hk = hookK(lt);
    counter(hk > 0 ? String(Math.round(3 * hk)) : DAY[d], c.since, ta);
    const qOff = 1 - sstep(0.2, 0.4, hk);
    const qa = ta * (1 - sstep(B.x8 - 0.01, B.x8, lt)) * qOff;
    if (hk > 0.002) {
      pic('头顶到 5 楼', COUNTER.x, 336, { size: 84, a: ta * sstep(0.6, 0.8, hk), weight: 700, font: F.body });
      // the rewind mark: two red triangles pointing back, while the picture rewinds
      const rw = Math.sin(Math.PI * clamp((lt - HOOK_HOLD) / (HOOK_END - HOOK_HOLD)));
      if (rw > 0.002) {
        ctx.save();
        ctx.globalAlpha = rw * ta;
        ctx.fillStyle = C.accent;
        for (const x0 of [548, 516]) {
          ctx.beginPath();
          ctx.moveTo(x0 + 30, 150); ctx.lineTo(x0, 180); ctx.lineTo(x0 + 30, 210); ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }
    const W0 = picW('体重', QS, 600, F.body);
    pic('体重', COUNTER.x, 330, { size: QS, a: ta * qOff, weight: 600, font: F.body });
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
    // the answer per day: 体重 ×N, = mass 「算」 (day 2 only on screen: s1-6 is not spoken), = N 个你 with the crowd
    const st = B.stamp;
    const tN = [0, B.x8, st[1] + 0.75, B.x512], tM = [0, B.kg, st[1] + 0.9, B.t3584], tP = [0, 0, st[1] + 1.0, B.t3584 + 0.55];
    for (let k = 1; k <= 3; k++) {
      const na = ta * dayA(k, tN[k], lt, 0.2);
      if (na > 0.002) pic(TIMES[k], COUNTER.x + W0 + 22, 330 - (1 - eout(clamp((lt - tN[k]) / 0.3))) * 10, { size: QS, a: na, weight: 600 });
      const ma = ta * dayA(k, tM[k], lt);
      if (ma > 0.002) {
        const x = COUNTER.x, y = 428 - (1 - eout(clamp((lt - tM[k]) / 0.3))) * 10;
        pic(MASS[k], x, y, { size: 64, a: ma });
        calcTag(x + picW(MASS[k], 64) + 18, y, ma);
      }
      if (k >= 2) {
        const pa = ta * dayA(k, tP[k], lt);
        if (pa > 0.002) {
          pic(PEOPLE[k], COUNTER.x, 520, { size: 56, a: pa, weight: 600, font: F.body });
          const fill = eio(clamp((lt - tP[k]) / (k === 2 ? 0.35 : 0.6)));
          if (k === 2) crowd(COUNTER.x + 4, 552, 8, 8, 64, 30, 26, 34, pa, fill);
          else {
            // 512 = 8 blocks of day 2's 64 (8 x 8 each), 4 across, 2 down
            let n = 0;
            for (let b = 0; b < 8; b++) n += crowd(COUNTER.x + (b % 4) * 90, 552 + Math.floor(b / 4) * 136, 8, 8, 64, 13, 9.5, 15, pa, clamp(fill * 8 - b));
            if (fill >= 1 && n !== 512) throw new Error(`grow1: ${n} 个你, not 512`);
          }
        }
      }
    }
    // the diagrams (zone A, day 1): the cube from 560 公斤, the cross-section from 截面, both out with the day-2 stamp
    const da = (1 - sstep(st[1], st[1] + 0.25, lt)) * out;
    cubeDiagram(lt, da * (1 - sstep(B.sec, B.sec + 0.3, lt)));
    if (lt >= B.sec) tileDiagram(lt, da);

    // ---- day 3: what the gauge divides, left of it, from 每平方厘米
    const fa = sstep(B.cm3, B.cm3 + 0.3, lt) * mv * (1 - closeA);
    if (fa > 0.002) {
      const [num, den] = FRAC, fx = 1520, w = Math.max(picW(num, 60, 600), picW(den, 60, 600));
      pic(num, fx, 730, { size: 60, a: fa, weight: 600, align: 'right' });
      ctx.save();
      ctx.globalAlpha = fa;
      ctx.strokeStyle = C.fg;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(fx - w - 10, 760);
      ctx.lineTo(fx + 6, 760);
      ctx.stroke();
      ctx.restore();
      pic(den, fx, 826, { size: 60, a: fa, weight: 600, align: 'right' });
    }

    // ---- the close-up (g5b): the 5th floor from inside, facing its window; outside, filling the bottom of the window,
    // the top of the grown head with its whorl (13.6 m: 0.7 m above the 12.9 m sill); the neighbour with the watering
    // can; 「……」 in the pause; after 我替你道过歉了 a red 「已道歉」 stamp on the glass
    if (closeA > 0.002) {
      ctx.save();
      ctx.globalAlpha = closeA;
      ctx.fillStyle = C.bg;
      ctx.beginPath();
      ctx.roundRect(PANEL.x0, PANEL.y0, PANEL.x1 - PANEL.x0, PANEL.y1 - PANEL.y0, 10);
      ctx.fill();
      ctx.clip();
      // the paper's grid, magnified 2.5 times: a close-up
      const pitch = GRID.pitch * 2.5;
      ctx.strokeStyle = C.rule;
      ctx.lineWidth = GRID.minorW;
      ctx.globalAlpha = closeA * GRID.minorA;
      ctx.beginPath();
      for (let x = PANEL.x0 + pitch / 2; x < PANEL.x1; x += pitch) { ctx.moveTo(x, PANEL.y0); ctx.lineTo(x, PANEL.y1); }
      for (let y = PANEL.y0 + pitch / 2; y < PANEL.y1; y += pitch) { ctx.moveTo(PANEL.x0, y); ctx.lineTo(PANEL.x1, y); }
      ctx.stroke();
      ctx.globalAlpha = 1;
      const nb = windowView(PANEL.x0, PANEL.x1, CLOSE.floor, CLOSE.s, CLOSE.cx, CLOSE.nb, closeA);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = closeA;
      ctx.strokeStyle = C.fg;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(PANEL.x0, PANEL.y0, PANEL.x1 - PANEL.x0, PANEL.y1 - PANEL.y0, 10);
      ctx.stroke();
      ctx.restore();
      pic('5 楼', PANEL.x0 + 32, PANEL.y0 + 80, { size: 60, a: closeA, weight: 600, font: F.body });
      const b = bubbleState(lt, 5);
      bubble(nb.hx + 80, nb.hy - 92, NB[2].text, nb.hx + 22, nb.hy - 12, b.u, b.a * closeA);
      rubberStamp('已道歉', CLOSE.cx + 170, 240, 96, -8, lt - B.apol, closeA * sstep(B.apol, B.apol + 0.01, lt));
    }

    // ---- the column of "你" (s1-10, v1's ending): today's "你", one rider on 背着另一个你, seven on 背着七个
    const colA = sstep(B.col + 0.05, B.col + 0.35, lt) * out;
    if (colA > 0.002) {
      const z2 = eio(clamp((lt - B.one) / 0.5)), z8 = eio(clamp((lt - B.eight - 0.02) / 0.8));
      const tH = Math.exp(lerp(lerp(Math.log(TOWER_H[0]), Math.log(TOWER_H[1]), z2), Math.log(TOWER_H[2]), z8));
      const riders: { a: number; drop: number }[] = [];
      for (let k = 0; k < 7; k++) {
        const t0 = k === 0 ? B.one + 0.05 : B.seven + 0.02 + (k - 1) * 0.11, p = clamp((lt - t0) / DROP_T);
        if (p <= 0) break;
        riders.push({ a: sstep(0, 0.3, p), drop: (1 - ein(p)) * DROP * tH });
      }
      if (riders.length) column(TOWER_X, tH, riders, colA);
      else person(TOWER_X, GROUND, tH, { look: 'line', a: colA });
      ctx.save();
      ctx.globalAlpha = colA;
      ctx.strokeStyle = C.fg;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(128, GROUND);
      ctx.lineTo(1030, GROUND);
      ctx.stroke();
      ctx.restore();
      const a1 = sstep(B.one + 0.35, B.one + 0.65, lt) * colA * (1 - sstep(B.seven, B.seven + 0.15, lt));
      const a7 = sstep(B.seven + 0.75, B.seven + 0.95, lt) * colA;
      const bot = GROUND - tH * 0.835, bx = TOWER_X + tH * 0.18 + 26;
      for (const [cnt, ba] of [[1, a1], [7, a7]] as const) {
        if (ba <= 0.002) continue;
        const top = GROUND - tH * (1 + cnt * RIDE);
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
        pic(cnt === 7 ? '7 个' : '1 个', bx + 18, (top + bot) / 2 + 18, { size: 60, a: ba, weight: 600 });
      }
      const ya = sstep(B.you, B.you + 0.3, lt) * colA;
      pic('今天的你', TOWER_X + tH * 0.18 + 28, GROUND - tH * 0.36 + 18, { size: 54, a: ya, font: F.body, weight: 600 });
    }

    // ---- g9 (第几天，骨头扛不住？): one cell of bone cross-section (day 1's block) carrying 8 weights, as the gauge and
    // the column say (today's 1, times 8); on 扛不住 a red 「？」 beside the stack. Nothing breaks.
    const ba = sstep(B.bone, B.bone + 0.25, lt) * out;
    if (ba > 0.002) {
      box(BONE, 0, 0, 0, 1, SLAB, 1, { a: ba, top: C.bg2 });
      const [cx, cy] = ob(BONE, 0.5, SLAB, 0.5);
      for (let m = 0; m < 8; m++) {
        const t0 = B.bone + 0.08 + m * 0.07, p = clamp((lt - t0) / 0.2);
        if (p <= 0) break;
        weight(cx, cy - m * 30 - (1 - p * p) * 60, 46, ba * sstep(0, 0.3, p));
      }
      pic('骨头截面', BONE.x - 10, 1004, { size: 52, a: ba, weight: 600, font: F.body });
      const qa = sstep(B.cant + 0.35, B.cant + 0.45, lt) * out;
      if (qa > 0.002) {
        const k = 1 + 0.3 * (1 - eout(clamp((lt - B.cant - 0.35) / 0.15)));
        // beside the stack's top, under where the end card comes in
        pic('？', cx + 62, 706, { size: 96 * k, a: qa, weight: 700, font: F.body, color: C.accent });
      }
    }

    // ---- the gauge, from 每平方厘米 (s1-4); hidden by the close-up; back with the column
    const g = gaugeState(lt);
    const hi = sstep(B.cm, B.cm + 0.2, lt) * (1 - sstep(B.cm + 0.8, B.cm + 1.3, lt)) + sstep(B.cm3, B.cm3 + 0.2, lt) * (1 - sstep(B.cm3 + 0.8, B.cm3 + 1.3, lt));
    const gA = lt < B.col ? sstep(B.cm, B.cm + 0.35, lt) * (1 - sstep(B.close, B.close + 0.3, lt)) : sstep(B.col + 0.05, B.col + 0.35, lt);
    gauge(g.v, g.label, gA * out, g.la, hi);

    // ---- g9: the comment card after the question, the end card on 正片里算; the tail: 核算单
    endCard(620, 560 + (1 - eout(clamp((lt - B.card) / 0.4))) * 10, sstep(B.card, B.card + 0.35, lt) * out);
    tailCard(lt - B.tail - CARD_IN);
    // 「你押第几天？」 under the 核算单, once g9 has been said, to the end
    const cu = lt - B.tail - CARD_IN - 0.25;
    commentCard(166, 948, cu, sstep(0, 0.15, cu));
    endCard(720, 948, sstep(0, 0.2, cu));
  },
});

B = beats();
// the beat table, for the check tools (tools/grow1/probe.ts); nothing reads it while drawing
(globalThis as unknown as { __beats: Beats }).__beats = B;
// sound cues on the same beats: the stamps by day, the gauge's rises (day 2's ×4 is silent: no pause of its own),
// the bubbles' pops, the tail card
const cues: Sfx[] = [
  // day 3's sound 8 ms after its frame: s1-7's last syllable ends 20 ms before the frame, the measurement wants more
  [B.stamp[0], 'stamp', { day: 1 }], [B.stamp[1], 'stamp', { day: 2 }], [B.stamp[2] + 0.008, 'stamp', { day: 3 }],
  [B.r2, 'gauge', { dur: 0.24 }], [B.r8, 'gauge', { dur: 0.12 }], [B.eight2, 'gauge', { dur: 0.08 }],
  // day 2's 「！」 has no pause of its own (it comes with 头顶：3 楼 while 再翻一倍 is said): no pop
  [B.pop2, 'pop'], [B.pop5, 'pop'],
  // 「已道歉」: a stamp sound (day 1's) in the pause after g5b; `extra`: not a counter step
  [B.apol, 'stamp', { day: 1, extra: 1 }],
  [frUp(B.tail + CARD_IN), 'end'],
];
S.sfx = cues;
// g5b's captions (the line is `shown`: the engine gives it none): 头顶到了 5 楼 through the pause, then 5 楼的邻居, then
// the punchline from where it is spoken, the English split the same way (so it does not give the punchline away)
S.subs.push(
  [B.top5, span('g5b', 1), '头顶到了 5 楼', 'Your head reaches the fifth floor.'],
  [span('g5b', 1), B.sorry, '5 楼的邻居', 'The neighbour on the fifth floor:'],
  [B.sorry, vo('s1-10'), '我替你道过歉了', 'I have apologised to them for you.'],
);
S.subs.sort((p, q) => p[0] - q[0]);
