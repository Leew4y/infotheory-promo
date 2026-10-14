// 5. Chapter 05: Foucault's rotating mirror (Comptes rendus 55, 1862, p. 502: by multiple reflections the line of
// the experiment went from 4 to 20 m; "in round numbers, 298 millions" of metres a second; corrections should not
// exceed 500 000 m; p. 796: 298 000 km a second). A small mirror spins; the light goes out along a path folded by a row
// of concave mirrors and comes back; the mirror has turned a little meanwhile, so the returning light lands beside the
// source. Drawn in slow motion with the turn exaggerated; the mirrors are a sketch, not Foucault's layout; no turn rate.
import { ctx, text, ink, arrow, dot, rule, statement, background, C, scene, sstep, win, bars, W, TAU } from '../../../engine';
import { beam, pulse, glow, mirror, bigNumber, source } from '../kit';

type P = [number, number];
const unit = (x: number, y: number): P => {
  const l = Math.hypot(x, y);
  return [x / l, y / l];
};

const Y = 640, TOP = 450, BOT = 770;
const S: P = [420, Y], R: P = [720, Y];
/** The light's way out: source, spinning mirror, then concave mirrors alternately top and bottom; the last one sends it back. */
const PATH: P[] = [S, R, [900, TOP], [1080, BOT], [1260, TOP], [1440, BOT], [1620, TOP]];
const SEG = PATH.slice(1).map((p, i) => Math.hypot(p[0] - PATH[i][0], p[1] - PATH[i][1]));
const CUM = SEG.reduce<number[]>((acc, l) => [...acc, acc[acc.length - 1] + l], [0]);
const OUT = CUM[CUM.length - 1];
const BACK = OUT - SEG[0];
/** Where the returning light lands: beside the source (drawn offset, exaggerated). */
const S2: P = [S[0], Y - 90];
const LAST = Math.hypot(S2[0] - R[0], S2[1] - R[1]);
/** Drawn light speed (px per second of slow motion) and when the pulse leaves the source. */
const V = 1600, T0 = 2.8;
const T1 = T0 + SEG[0] / V; // the pulse meets the spinning mirror on the way out
const T2 = T0 + (OUT + BACK) / V; // and again on the way back
const TEND = T2 + LAST / V; // the returning light lands

// The spinning mirror's angle (kit mirror(): face normal (-sin, cos)). At T1 its normal bisects the incoming and the
// outgoing beam; by T2 it has turned by DELTA, which is what sends the returning beam to S2 instead of S.
const DOUT = unit(PATH[2][0] - R[0], PATH[2][1] - R[1]);
const N0 = unit(DOUT[0] - 1, DOUT[1]);
const DB = unit(S2[0] - R[0], S2[1] - R[1]);
const N2 = unit(DB[0] + DOUT[0], DB[1] + DOUT[1]);
const PHI0 = Math.atan2(-N0[0], N0[1]);
const DELTA = Math.atan2(N2[1], N2[0]) - Math.atan2(N0[1], N0[0]);
/** Drawn turn rate (rad/s): fast at first, then slow motion from 1.9-2.7 s so the turn during one round trip is DELTA. */
const WS = DELTA / (T2 - T1), WF = 2 * TAU;
const omega = (t: number) => WS + (WF - WS) * (1 - sstep(1.9, 2.7, t));
const phiAt = (t: number) => {
  let s = 0;
  const n = 80;
  for (let i = 0; i < n; i++) s += omega(T1 + ((i + 0.5) / n) * (t - T1)) * ((t - T1) / n);
  return PHI0 + s;
};

/** A concave mirror at (x, y) facing the unit normal n: a bright arc, hatching behind it, a glow when light hits. */
function concave(x: number, y: number, n: P, a: number, hit: number): void {
  if (a <= 0.002) return;
  const RC = 240, span = Math.asin(56 / RC), cx = x + n[0] * RC, cy = y + n[1] * RC, base = Math.atan2(-n[1], -n[0]);
  const pts: P[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = base - span + (2 * span * i) / 16;
    pts.push([cx + Math.cos(t) * RC, cy + Math.sin(t) * RC]);
  }
  glow(x, y, 46, a * 0.6 * hit, C.accent2);
  ctx.save();
  ctx.shadowColor = C.accent;
  ctx.shadowBlur = 10;
  ink(pts, 1, C.accent2, 3.5, a);
  ctx.restore();
  for (let i = 0; i <= 16; i += 2) {
    const [px, py] = pts[i], [ux, uy] = unit(px - cx, py - cy);
    rule(px, py, px + ux * 11 - uy * 5, py + uy * 11 + ux * 5, C.fg2, a * 0.7, 1);
  }
}

/** The turning direction: an arc under the mirror with an arrow head (clockwise, as the mirror turns). */
function spinArrow(x: number, y: number, r: number, a: number): void {
  if (a <= 0.002) return;
  const pts: P[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = (0.22 + (0.56 * i) / 24) * Math.PI;
    pts.push([x + Math.cos(t) * r, y + Math.sin(t) * r]);
  }
  ink(pts, 1, C.fg2, 2, a);
  const [p, q] = [pts[pts.length - 2], pts[pts.length - 1]];
  arrow(p[0], p[1], q[0], q[1], C.fg2, a, 2, 14);
}

scene({
  name: 'foucault', kind: 'page', dur: bars(5), mb: 3, chapter: 5, ch: ['转镜', 'The rotating mirror'],
  subs: [
    [1, 6.5, '1862 年，傅科用一面高速旋转的小镜子，靠多次反射把光路延长到 20 米。', 'In 1862 Foucault used a small spinning mirror and folded the light path to 20 metres.'],
    [7, 13, '他得到每秒 29.8 万千米，说这是取整的数，修正不会超过 500 千米。', 'He got 298 000 kilometres a second, a round number, he said, with corrections under 500 kilometres.'],
  ],
  sfx: [[0.1, 'page'], [1.0, 'tick'], [2.8, 'tone', { midi: 62 }], [5.35, 'tone', { midi: 69 }], [7.9, 'chime', { midi: 74 }]],
  draw(lt) {
    background();
    statement('20 米就够了', 'Twenty metres are enough', lt);
    const a = sstep(0.8, 1.4, lt);
    const ad = a * (1 - sstep(7.2, 7.8, lt));
    const D = V * (lt - T0); // how far the pulse has gone along the whole trip, out and back
    // the source: a screen with a slit, lit from behind
    rule(S[0], Y - 150, S[0], Y - 14, C.fg2, ad, 3);
    rule(S[0], Y + 14, S[0], Y + 80, C.fg2, ad, 3);
    glow(S[0], Y, 40, ad * sstep(2.1, 2.7, lt), C.alt);
    text('光源', S[0] - 34, Y + 10, { size: 30, color: C.fg2, alpha: ad, align: 'right' });
    // the spinning mirror: fast at first, then slow motion; a faint copy where it stood when the light left
    mirror(R[0], R[1], 130, PHI0, ad * 0.4 * sstep(T1 + 0.4, T1 + 1.0, lt));
    mirror(R[0], R[1], 130, phiAt(lt), ad);
    dot(R[0], R[1], 6, C.fg, ad);
    spinArrow(R[0], R[1], 80, ad * 0.8);
    text('转镜', R[0], Y + 128, { size: 30, color: C.fg2, alpha: ad, align: 'center' });
    text('慢放 · 转角放大', R[0], Y + 170, { size: 24, color: C.fg2, alpha: ad * sstep(2.0, 2.6, lt), align: 'center' });
    text('转过一点', R[0] + 92, Y + 36, { size: 26, color: C.fg2, alpha: ad * sstep(T2 - 0.1, T2 + 0.4, lt) });
    // the concave mirrors, each facing between the beams it joins; the last one faces back
    for (let i = 2; i < PATH.length; i++) {
      const [x, y] = PATH[i], prev = PATH[i - 1], next = PATH[i + 1];
      const up = unit(prev[0] - x, prev[1] - y);
      const n = next ? unit(up[0] + unit(next[0] - x, next[1] - y)[0], up[1] + unit(next[0] - x, next[1] - y)[1]) : up;
      const hit = Math.max(Math.exp(-(((D - CUM[i]) / 90) ** 2)), Math.exp(-(((D - (2 * OUT - CUM[i])) / 90) ** 2)));
      concave(x, y, n, ad * sstep(1.8 + 0.12 * (i - 2), 2.4 + 0.12 * (i - 2), lt), hit);
    }
    text('凹面镜', 1260, TOP - 62, { size: 30, color: C.fg2, alpha: ad * sstep(2.3, 2.9, lt), align: 'center' });
    // the light out along the fold and back; from the spinning mirror on, the folded path is the 20 m
    const hl = win(lt, 4.0, 6.0, 0.5, 0.8);
    for (let i = 0; i < SEG.length; i++) {
      const [p, q] = [PATH[i], PATH[i + 1]];
      beam(p[0], p[1], q[0], q[1], (D - CUM[i]) / SEG[i], ad * (i ? 0.5 + 0.4 * hl : 0.5), C.accent, 2.4);
      pulse(p[0], p[1], q[0], q[1], (D - CUM[i]) / SEG[i], ad, C.accent2, 70 / SEG[i]);
      if (i) pulse(q[0], q[1], p[0], p[1], (D - 2 * OUT + CUM[i + 1]) / SEG[i], ad, C.accent2, 70 / SEG[i]);
    }
    text('光路 20 米', 1260, BOT + 88, { size: 36, weight: 500, color: C.accent, alpha: ad * sstep(4.1, 4.7, lt), align: 'center' });
    // back at the spinning mirror, which has turned a little: the light leaves at a slant and lands beside the source
    beam(R[0], R[1], S2[0], S2[1], (D - OUT - BACK) / LAST, ad * 0.75, C.accent, 2.4);
    pulse(R[0], R[1], S2[0], S2[1], (D - OUT - BACK) / LAST, ad, C.accent2, 70 / LAST);
    glow(S2[0], S2[1], 40, ad * sstep(TEND - 0.05, TEND + 0.3, lt), C.accent2);
    text('回光偏开一点', S[0] - 34, S2[1] + 10, { size: 30, color: C.accent, alpha: ad * sstep(TEND + 0.1, TEND + 0.6, lt), align: 'right' });
    // the result
    const ar = sstep(7.8, 8.5, lt);
    bigNumber('298 000', W / 2, 560, 150, ar, C.fg);
    text('千米 / 秒', W / 2, 640, { size: 34, color: C.fg2, alpha: ar, align: 'center' });
    text('取整的数', W / 2, 745, { size: 40, weight: 500, color: C.accent, alpha: sstep(9.3, 10.0, lt), align: 'center' });
    text('修正不超过 500 千米 / 秒', W / 2, 810, { size: 34, color: C.fg2, alpha: sstep(10.8, 11.5, lt), align: 'center' });
    source('1862 · Comptes rendus 55 · pp. 502, 796', sstep(1.4, 2.0, lt));
  },
});
