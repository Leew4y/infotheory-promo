// 7. Chapter 07: Michelson between Mount Wilson and Mount San Antonio (Astrophys. J. 65, 1927, assisted by F. Pearson).
// Light leaves an eight-sided rotating mirror on Mount Wilson, crosses about 35 km (35 385.5 m between the survey
// bench marks, p. 13) to a mirror on Mount San Antonio and comes back; at 528 turns a second the octagon turns one
// eighth of a turn while the light is away, so the next face stands where the first one stood and catches it (p. 3);
// the result, 299 796 km/s (p. 1). The mirror's turning and the light's travel are drawn slowed down, on one clock:
// a flash leaves as a face points at the far mountain and returns as the next face arrives. Only some flashes are
// drawn, so that during the second caption one flash goes out and comes back on its own and the catching face lights up.
import { ctx, text, label, ink, circlePts, arrow, statement, background, C, F, scene, clamp, sstep, win, bars, W, TAU } from '../../../engine';
import { beam, pulse, glow, mirror, dimension, bigNumber, source } from '../kit';

const BASE = 850;
/** Mount Wilson (left) and the higher Mount San Antonio (right), as outlines on the ground line. */
const WIL: [number, number][] = [[190, BASE], [262, 802], [322, 786], [404, 728], [480, 690], [545, 720], [615, 762], [700, 810], [800, BASE]];
const SAN: [number, number][] = [[1070, BASE], [1160, 792], [1245, 734], [1330, 682], [1400, 638], [1450, 618], [1505, 644], [1580, 702], [1650, 770], [1730, BASE]];
/** The shaded (right) flank of each mountain: from the peak down a ridge line. */
const WIL_RIDGE: [number, number][] = [[480, 690], [528, 768], [585, BASE]];
const SAN_RIDGE: [number, number][] = [[1450, 618], [1496, 716], [1548, BASE]];
/** Near station: the octagon on Mount Wilson; far station: a mirror on Mount San Antonio. */
const SX = 480, SY = 670, SR = 16;
const S: [number, number] = [SX + SR * Math.cos(TAU / 16), SY];
const R: [number, number] = [1446, 590];
const BEAM_ANG = Math.atan2(R[1] - S[1], R[0] - S[0]);
/** The inset: the octagon enlarged, joined to the station by a thin leader. */
const IX = 700, IY = 470, RING = 118, OCT = 90;
const FACE = OCT * Math.cos(TAU / 16);
/** One eighth of a turn takes T seconds on screen; the light's round trip takes the same T. */
const T = 1.7, T0 = 7.4;
const OMEGA = TAU / 8 / T;
/** Flashes drawn: each leaves when a face points at the far mountain (angle 0 mod 1/8 turn). None leaves at 5.7 or
 *  9.1, so the flash sent at T0 by face 0 is not met by another on its way and returns alone at T0 + T. */
const EMIT = [2.3, 4.0, T0];
/** Octagon angle: a steady turn, face 0 pointing at the far mountain at T0. */
const ang = (lt: number) => OMEGA * (lt - T0);

/** A regular octagon of circumradius r turned by a; face k faces direction a + k/8 turn. Face 0 in amber when marked;
 *  face 7 (the one that stands at face 0's starting direction after 1/8 turn) in cyan when `caught`. */
function octagon(cx: number, cy: number, r: number, a: number, alpha: number, w: number, mark = 0, caught = 0): void {
  if (alpha <= 0.002) return;
  const v = (k: number): [number, number] => [cx + Math.cos(a + ((k - 0.5) * TAU) / 8) * r, cy + Math.sin(a + ((k - 0.5) * TAU) / 8) * r];
  const pts: [number, number][] = [];
  for (let k = 0; k <= 8; k++) pts.push(v(k));
  ink(pts, 1, C.fg, w, alpha);
  if (mark > 0.002) ink([v(0), v(1)], 1, C.alt, w + 1.5, alpha * mark);
  if (caught > 0.002) ink([v(7), v(8)], 1, C.accent, w + 1.5, alpha * caught);
}

/** A mountain: a dark fill, hatching on the shaded flank, the outline inked in to fraction k. */
function mountain(pts: [number, number][], ridge: [number, number][], k: number, a: number): void {
  if (a <= 0.002 || k <= 0) return;
  const af = a * sstep(0.5, 1, k);
  if (af > 0.002) {
    ctx.save();
    ctx.globalAlpha = af * 0.85;
    ctx.fillStyle = C.bg2;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    // hatching between the ridge and the right slope
    const peak = pts.findIndex(([x, y]) => x === ridge[0][0] && y === ridge[0][1]);
    const flank = [...pts.slice(peak), ...ridge.slice().reverse()];
    ctx.beginPath();
    flank.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = af * 0.3;
    ctx.strokeStyle = C.fg2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 300; x < 1900; x += 13) {
      ctx.moveTo(x, 560);
      ctx.lineTo(x - 300, 860);
    }
    ctx.stroke();
    ctx.restore();
  }
  ink(ridge, sstep(0.4, 1, k), C.fg2, 1.5, a * 0.6);
  ink(pts, k, C.fg2, 2.6, a);
}

scene({
  name: 'michelson', kind: 'page', dur: bars(5), mb: 3, chapter: 7, ch: ['两座山', 'Two mountains'],
  subs: [
    [1, 6, '1926 年，迈克耳孙让光在两座山之间往返：威尔逊山到圣安东尼奥山，约 35 千米。', 'In 1926 Michelson sent light between two mountains, Mount Wilson and Mount San Antonio, about 35 kilometres apart.'],
    [6.5, 13, '八面转镜每秒 528 圈，转过 1/8 圈正好接住回来的光：每秒 299 796 千米。', 'An eight-sided mirror at 528 turns a second turned one eighth while the light went and came back: 299 796 kilometres a second.'],
  ],
  sfx: [[0.1, 'page'], [2.3, 'tick'], [6.6, 'tone', { midi: 62 }], [9.1, 'tick'], [11.4, 'chime', { midi: 74 }]],
  draw(lt) {
    background();
    statement('拉长到 35 千米', 'Stretched to 35 kilometres', lt);
    const a = sstep(0.6, 1.2, lt);
    const out = sstep(10.6, 11.1, lt);
    const aD = a * (1 - out);
    // the two mountains, dimmed (not removed) under the result
    const km = clamp((lt - 0.7) / 1.4);
    const aM = a * (1 - 0.72 * out);
    mountain(WIL, WIL_RIDGE, km, aM);
    mountain(SAN, SAN_RIDGE, clamp((lt - 0.9) / 1.4), aM);
    ink([[180, BASE], [1750, BASE]], 1, C.rule, 1.5, aM);
    // names inside the outlines
    const an = sstep(1.7, 2.3, lt) * (1 - out);
    text('威尔逊山', 425, 806, { size: 30, weight: 500, color: C.fg, alpha: an, align: 'center' });
    label('Mount Wilson', 425, 842, an, C.fg2, 27, 'center');
    text('圣安东尼奥山', 1360, 770, { size: 30, weight: 500, color: C.fg, alpha: an, align: 'center' });
    label('Mount San Antonio', 1350, 806, an, C.fg2, 27, 'center');
    // stations: the octagon on Mount Wilson (small), the mirror on Mount San Antonio
    const as = sstep(1.4, 2.0, lt) * aD;
    octagon(SX, SY, SR, ang(lt), as, 2.2);
    ink([[SX - 14, SY + 19], [SX + 14, SY + 19]], 1, C.fg2, 2, as);
    mirror(R[0] + 5, R[1], 58, BEAM_ANG + Math.PI / 2, as);
    // the light path, drawn by the first flash, then flashes out and back
    beam(S[0], S[1], R[0], R[1], clamp((lt - EMIT[0]) / (T / 2)), aD * 0.5, C.accent, 2.2);
    let flashS = 0, flashR = 0;
    for (const tk of EMIT) {
      pulse(S[0], S[1], R[0], R[1], (lt - tk) / (T / 2), aD);
      pulse(R[0], R[1], S[0], S[1], (lt - tk - T / 2) / (T / 2), aD);
      flashR = Math.max(flashR, win(lt, tk + T / 2 - 0.08, tk + T / 2 + 0.35, 0.08, 0.3));
      flashS = Math.max(flashS, win(lt, tk - 0.1, tk + 0.3, 0.1, 0.25), win(lt, tk + T - 0.1, tk + T + 0.3, 0.1, 0.25));
    }
    glow(R[0], R[1], 34, aD * 0.8 * flashR, C.accent2);
    glow(S[0], S[1], 26, aD * 0.8 * flashS * sstep(EMIT[0] - 0.1, EMIT[0], lt), C.accent2);
    // the distance, over the light path
    const adim = a * (1 - sstep(6.0, 6.5, lt));
    const kd = clamp((lt - 3.3) / 1.0);
    dimension(SX, 1450, 520, '', adim * sstep(0, 0.1, kd), kd);
    text('约 35 千米', (SX + 1450) / 2, 496, { size: 38, weight: 500, color: C.fg, alpha: adim * sstep(0.6, 1, kd), align: 'center' });

    // the inset: the octagon enlarged
    const ai = sstep(6.3, 6.9, lt) * (1 - out);
    const lead = Math.atan2(SY - IY, SX - IX);
    ink(circlePts(IX, IY, RING, 96), 1, C.fg2, 1.5, ai * 0.55);
    ink([[IX + Math.cos(lead) * RING, IY + Math.sin(lead) * RING], [SX - Math.cos(lead) * 24, SY - Math.sin(lead) * 24]], 1, C.fg2, 1.5, ai * 0.55, [6, 7]);
    const th = ang(lt);
    // spokes and hub, then the faces; face 0 (amber) is the one that sends the flash at T0
    for (let k = 0; k < 8; k++) {
      const t = th + ((k + 0.5) * TAU) / 8;
      ink([[IX + Math.cos(t) * 14, IY + Math.sin(t) * 14], [IX + Math.cos(t) * (OCT - 4), IY + Math.sin(t) * (OCT - 4)]], 1, C.fg2, 1.2, ai * 0.45);
    }
    ink(circlePts(IX, IY, 13, 36), 1, C.fg2, 1.8, ai);
    // face 0 is marked until the catch; then face 7, now where face 0 stood, lights briefly as the flash returns
    const mark = sstep(6.8, 7.2, lt) * (1 - sstep(T0 + T, T0 + T + 0.3, lt));
    const caught = win(lt, T0 + T - 0.1, T0 + T + 0.5, 0.1, 0.25);
    octagon(IX, IY, OCT, th, ai, 3.5, mark, caught);
    // the short stretch of light path inside the inset, with the flashes leaving and returning
    beam(IX + FACE, IY, IX + RING, IY, 1, ai * 0.5, C.accent, 2.2);
    let flashI = 0;
    for (const tk of EMIT) {
      pulse(IX + FACE, IY, IX + RING, IY, (lt - tk) / 0.2, ai, undefined, 0.3);
      pulse(IX + RING, IY, IX + FACE, IY, (lt - tk - T + 0.2) / 0.2, ai, undefined, 0.3);
      flashI = Math.max(flashI, win(lt, tk - 0.12, tk + 0.35, 0.12, 0.3), win(lt, tk + T - 0.12, tk + T + 0.35, 0.12, 0.3));
    }
    glow(IX + FACE, IY, 40, ai * 0.9 * flashI, C.accent2);
    // one eighth of a turn while the light is away: the arc follows face 0 from T0 to T0 + T
    const aa = ai * sstep(7.3, 7.5, lt) * sstep(0.06, 0.2, ang(lt));
    const sweep = clamp(ang(lt), 0, TAU / 8);
    if (aa > 0.002 && sweep > 0.02) {
      const pts = circlePts(IX, IY, OCT + 14, 48, 0).slice(0, Math.max(2, Math.round((48 * sweep) / TAU) + 1));
      pts[pts.length - 1] = [IX + Math.cos(sweep) * (OCT + 14), IY + Math.sin(sweep) * (OCT + 14)];
      ink(pts, 1, C.alt, 2.5, aa);
      const [px, py] = pts[pts.length - 2], [qx, qy] = pts[pts.length - 1];
      arrow(px, py, qx, qy, C.alt, aa, 2.5, 12);
    }
    text('1/8 圈', 838, 566, { font: F.mono, size: 36, weight: 500, color: C.alt, alpha: ai * sstep(8.4, 9.0, lt) });
    // what it is and how fast it turns
    text('八面转镜', 548, 432, { size: 32, weight: 600, color: C.fg, alpha: ai, align: 'right' });
    text('528 圈 / 秒', 548, 498, { font: F.mono, size: 44, color: C.accent, alpha: ai * sstep(6.7, 7.3, lt), align: 'right' });

    // the result
    const ar = sstep(11.1, 11.7, lt);
    bigNumber('299 796', W / 2, 560, 150, ar, C.fg, clamp((lt - 11.1) / 0.9));
    text('km / s', W / 2, 650, { font: F.mono, size: 44, color: C.accent, alpha: sstep(11.8, 12.4, lt), align: 'center' });
    source('1927 · Astrophys. J. 65 · pp. 1, 3, 13', sstep(1.4, 2.0, lt));
  },
});
