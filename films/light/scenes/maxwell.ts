// 6. Chapter 06: electricity and magnetism. A bench of electrical instruments drawn as plain lines, with no light in it,
// stands for Weber and Kohlrausch's 1856 ratio of two electrical units (Annalen 99, pp. 10-25). Maxwell turned it into
// the speed of electromagnetic waves, 310 740 000 m/s (Phil. Trans. 155, 1865, p. 499); a card sets it beside
// Foucault's optical 298 000 km/s (Comptes rendus 55, 1862, p. 796), two bars from zero; then the 1862 inference that
// light is an undulation of the medium of electric and magnetic phenomena (Phil. Mag. 4th ser. 23, p. 22). Maxwell's
// own conversion of Fizeau's value is not shown.
import { ctx, text, label, rule, ink, circle, dot, hatch, arrow, rollNumber, statement, background, C, F, scene, clamp, lerp, eout, eio, sstep, bars, TAU } from '../../../engine';
import { bigNumber, source } from '../kit';

type Pt = [number, number];
/** Where the bench is drawn: its local (0, 0), the middle of the table top, lands at (ox, oy), scaled by s. */
interface Place { ox: number; oy: number; s: number }

// bench geometry in local units (y down): a charged jar with a ball on a rod, a coil, a dial with a needle
const JX = -440, JW = 80, JH = 200, SV = -330, SR = 28;
const CL = 100, CV = -150, CR = 72, CN = 9;
const GX = 430, GV = -40, GR = 150;
const HELIX: Pt[] = Array.from({ length: CN * 24 + 1 }, (_, i) => {
  const f = i / (CN * 24), th = Math.PI + f * CN * TAU;
  return [-CL + 2 * CL * f + 10 * Math.sin(th), CV + CR * Math.cos(th)];
});
const WIRE_IN: Pt[] = [[JX + SR, SV], [-CL, SV], [-CL, CV - CR]];
const WIRE_OUT: Pt[] = [[CL, CV - CR], [CL, SV], [GX - 90, SV], [GX - 90, -230]];
/** The discharge's three legs and their time windows (scene seconds): ball to coil, through the coil, coil to dial. */
const LEGS: [Pt[], number, number][] = [[WIRE_IN, 3.7, 4.0], [HELIX, 4.0, 4.5], [WIRE_OUT, 4.5, 4.85]];
const ARRIVE = 4.85;

/** The point at fraction f of a polyline's length. */
function along(pts: Pt[], f: number): Pt {
  const seg = [0];
  for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = clamp(f) * seg[seg.length - 1];
  for (let i = 1; i < pts.length; i++) {
    if (seg[i] >= L) {
      const g = (L - seg[i - 1]) / (seg[i] - seg[i - 1] || 1);
      return [lerp(pts[i - 1][0], pts[i][0], g), lerp(pts[i - 1][1], pts[i][1], g)];
    }
  }
  return pts[pts.length - 1];
}

/** Where the charge is at scene time t, each leg timed on its own; null before it leaves the ball or after it reaches the dial. */
function chargeAt(t: number): Pt | null {
  for (const [pts, t0, t1] of LEGS) if (t > t0 && t <= t1) return along(pts, (t - t0) / (t1 - t0));
  return null;
}

/** Needle angle (radians from upright): still, then one throw as the charge arrives, dying away. */
const needle = (lt: number) => {
  const t = lt - ARRIVE;
  return t <= 0 ? 0 : 0.8 * Math.exp(-t / 1.4) * Math.sin((t / 1.5) * TAU);
};

/** The electrical bench: line art only, no lamp and no glow anywhere on it. */
function bench(lt: number, a: number, p: Place): void {
  if (a <= 0.002) return;
  const m = ([u, v]: Pt): Pt => [p.ox + u * p.s, p.oy + v * p.s];
  const mm = (q: Pt[]) => q.map(m);
  const lw = (w: number) => w * (0.7 + 0.3 * p.s);
  const kT = clamp((lt - 0.8) / 0.7), kJ = clamp((lt - 1.0) / 1.3), kC = clamp((lt - 1.4) / 1.5), kG = clamp((lt - 1.8) / 1.3), kW = clamp((lt - 2.6) / 0.9);
  // the table
  ink(mm([[-660, 0], [660, 0]]), kT, C.fg2, lw(2.5), a);
  ink(mm([[-660, 12], [660, 12]]), kT, C.rule, lw(2), a);
  ink(mm([[-610, 12], [-610, 90]]), kT, C.rule, lw(2.5), a);
  ink(mm([[610, 12], [610, 90]]), kT, C.rule, lw(2.5), a);
  // the return wire along the back of the table, from the dial to the jar's outer coating
  ink(mm([[GX - 140, -24], [JX + JW, -24]]), kW, C.fg2, lw(1.8), a * 0.7);
  // the jar: glass, lid, a coating on its lower part, a rod up to a ball
  ink(mm([[JX - JW, -JH], [JX - JW, -12], [JX - JW + 12, 0], [JX + JW - 12, 0], [JX + JW, -12], [JX + JW, -JH]]), kJ, C.fg, lw(3), a);
  ink(mm([[JX - JW - 10, -JH], [JX + JW + 10, -JH]]), kJ, C.fg, lw(5), a);
  const [fx0, fy0] = m([JX - JW + 7, -JH * 0.6]), [fx1, fy1] = m([JX + JW - 7, -6]);
  hatch(() => ctx.rect(fx0, fy0, fx1 - fx0, fy1 - fy0), C.fg2, a * 0.4 * sstep(0.5, 1, kJ), 9 * p.s + 3, -Math.PI / 4, 1.2);
  ink(mm([[JX - JW + 7, -6], [JX - JW + 7, -JH * 0.6], [JX + JW - 7, -JH * 0.6], [JX + JW - 7, -6]]), kJ, C.fg2, lw(1.5), a);
  ink(mm([[JX, -JH], [JX, SV + SR]]), kJ, C.fg, lw(3), a);
  const [sx, sy] = m([JX, SV]);
  circle(sx, sy, SR * p.s, kJ, C.fg, lw(3), a);
  // its charge: small amber plus signs round the ball, gone when it discharges
  const aq = a * sstep(2.8, 3.3, lt) * (1 - sstep(3.7, 4.1, lt));
  for (const deg of [-165, -120, -75, -30, 150]) {
    const r = (SR + 26) * p.s, c = (deg * Math.PI) / 180, x = sx + Math.cos(c) * r, y = sy + Math.sin(c) * r, h = 9 * p.s + 2;
    rule(x - h, y, x + h, y, C.alt, aq, lw(2.5));
    rule(x, y - h, x, y + h, C.alt, aq, lw(2.5));
  }
  // the coil: two cheeks standing on the table and the winding between them
  ink(mm([[-120, -240], [-120, 0]]), kC, C.fg2, lw(4), a);
  ink(mm([[120, -240], [120, 0]]), kC, C.fg2, lw(4), a);
  ink(mm(HELIX), kC, C.fg, lw(2), a);
  // the dial: a case, a scale, a needle on a pivot
  ink(mm([[GX - 140, 0], [GX - 140, -218], [GX - 128, -230], [GX + 128, -230], [GX + 140, -218], [GX + 140, 0]]), kG, C.fg, lw(3), a);
  const arc: Pt[] = [];
  for (let i = 0; i <= 60; i++) {
    const c = ((-150 + 2 * i) * Math.PI) / 180;
    arc.push([GX + Math.cos(c) * GR, GV + Math.sin(c) * GR]);
  }
  ink(mm(arc), kG, C.fg2, lw(2), a);
  for (let d = -150; d <= -30; d += 10) {
    const c = (d * Math.PI) / 180, r0 = d === -90 ? GR - 24 : GR - 14;
    ink(mm([[GX + Math.cos(c) * r0, GV + Math.sin(c) * r0], [GX + Math.cos(c) * GR, GV + Math.sin(c) * GR]]), 1, C.fg2, lw(2), a * sstep(0.6, 1, kG));
  }
  const th = -Math.PI / 2 + needle(lt), an = a * sstep(0.7, 1, kG);
  ink(mm([[GX, GV], [GX + Math.cos(th) * (GR - 20), GV + Math.sin(th) * (GR - 20)]]), 1, C.fg, lw(3.5), an);
  const [px, py] = m([GX, GV]);
  dot(px, py, 8 * p.s, C.fg, an);
  // the wires from the ball through the coil to the dial
  ink(mm(WIRE_IN), kW, C.fg2, lw(2), a);
  ink(mm(WIRE_OUT), kW, C.fg2, lw(2), a);
  // the discharge: amber charge runs from the ball through the coil to the dial (no glow: this is not light);
  // the path it has covered stays amber until the needle has thrown, so the run through the coil reads as one motion
  const at = a * 0.8 * (1 - sstep(5.0, 5.7, lt));
  for (const [pts, t0, t1] of LEGS) ink(mm(pts), (lt - t0) / (t1 - t0), C.alt, lw(2.5), at);
  for (let i = 4; i >= 0; i--) {
    const q = chargeAt(lt - i * 0.03);
    if (!q) continue;
    const [x, y] = m(q);
    dot(x, y, (i === 0 ? 10 : 8 - i) * p.s + 1, C.alt, a * (i === 0 ? 1 : 0.75 - i * 0.12));
  }
}

/** A horizontal bar from x0, hatched inside, outlined; `lit` adds the glow the film gives to light. */
function bar(x0: number, y: number, len: number, h: number, col: string, a: number, lit: boolean): void {
  if (a <= 0.002 || len <= 1) return;
  hatch(() => ctx.rect(x0, y, len, h), col, a * 0.45, 10, -Math.PI / 4, 1.4);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = col;
  ctx.lineWidth = 2.5;
  if (lit) {
    ctx.shadowColor = col;
    ctx.shadowBlur = 14;
  }
  ctx.strokeRect(x0, y, len, h);
  ctx.restore();
}

/** A travelling transverse wave in the light's cyan, drawn up to fraction k from the left, tapered at both ends. */
function wave(x0: number, x1: number, y: number, amp: number, lam: number, phase: number, k: number, a: number): void {
  if (a <= 0.002 || k <= 0) return;
  const pts: Pt[] = [];
  for (let i = 0; i <= 300; i++) {
    const x = lerp(x0, x1, i / 300), env = sstep(x0, x0 + 120, x) * (1 - sstep(x1 - 120, x1, x));
    pts.push([x, y - amp * env * Math.sin(((x - x0) / lam) * TAU - phase)]);
  }
  ctx.save();
  ctx.shadowColor = C.accent;
  ctx.shadowBlur = 14;
  ink(pts, k, C.accent, 3, a);
  ctx.restore();
}

// the card: two bars from one zero line, lengths in proportion; names left of the line, values in one column
const X0 = 440, PX = 980 / 310740, B1 = 470, B2 = 640, BH = 64, VX = X0 + 310740 * PX + 26;

scene({
  name: 'maxwell', kind: 'page', dur: bars(6), mb: 3, chapter: 6, ch: ['电与磁', 'Electricity and magnetism'],
  subs: [
    [1, 6, '1856 年，韦伯和科尔劳施在实验室里测了两种电学单位之比，实验里没有光。', 'In 1856 Weber and Kohlrausch measured a ratio of electrical units; no light was involved.'],
    [6.5, 12, '麦克斯韦用这个数算出电磁波的速度：每秒 310 740 千米，和测得的光速非常接近。', 'Maxwell turned it into the speed of electromagnetic waves: 310 740 kilometres a second, close to the measured speed of light.'],
    [12.5, 17.5, '他写道：几乎无法回避这个推论，光就是电和磁的波动。', 'He wrote that one can scarcely avoid the inference: light is an electric and magnetic undulation.'],
  ],
  sfx: [[0.1, 'page'], [3.7, 'tick'], [7.2, 'tone', { midi: 62 }], [9.6, 'tone', { midi: 67 }], [13.4, 'chime', { midi: 74 }]],
  draw(lt) {
    background();
    statement('没有用光测出的光速', 'A speed of light without light', lt);
    // 1. the bench, full size; then it steps aside, small, for the calculation
    const k = eio(clamp((lt - 6.5) / 0.8));
    const ab = sstep(0.8, 1.4, lt) * (1 - sstep(9.2, 9.6, lt));
    bench(lt, ab, { ox: lerp(960, 560, k), oy: lerp(770, 700, k), s: lerp(1, 0.56, k) });
    label('1856 · 韦伯与科尔劳施 · 两种电学单位之比', 960, 830, sstep(2.4, 3.0, lt) * (1 - sstep(6.1, 6.5, lt)), C.fg2, 26, 'center');
    // 2. the calculation: the bench's number becomes a speed
    const ac = sstep(7.0, 7.5, lt) * (1 - sstep(9.2, 9.6, lt));
    arrow(970, 600, lerp(970, 1110, eout(clamp((lt - 7.0) / 0.5))), 600, C.fg2, ac, 3, 16);
    text('电磁波的速度', 1400, 500, { size: 34, color: C.fg2, alpha: ac, align: 'center' });
    const an = sstep(7.2, 7.6, lt) * (1 - sstep(9.2, 9.6, lt));
    bigNumber(rollNumber('310 740', lt, 7.2, 0.7, 11), 1400, 640, 120, an, C.alt);
    text('km / s', 1400, 712, { font: F.mono, size: 40, color: C.alt, alpha: an, align: 'center' });
    label('麦克斯韦 1865', 1400, 772, sstep(7.8, 8.3, lt) * (1 - sstep(9.2, 9.6, lt)), C.muted, 24, 'center');
    // 3. the card: the electrical value beside the optical one, two bars from zero
    const ak = sstep(9.5, 9.9, lt) * (1 - sstep(12.3, 12.7, lt));
    const g1 = eout(clamp((lt - 9.6) / 0.7)), g2 = eout(clamp((lt - 10.0) / 0.7));
    const L1 = 310740 * PX, L2 = 298000 * PX;
    rule(X0, B1 - 24, X0, B2 + BH + 24, C.fg2, ak, 2);
    text('0', X0, B2 + BH + 64, { font: F.mono, size: 26, color: C.muted, alpha: ak, align: 'center' });
    rule(X0 + L1, B1 + BH + 8, X0 + L1, B2 + BH + 12, C.muted, ak * sstep(10.6, 11.0, lt) * 0.8, 1.5);
    bar(X0, B1, L1 * g1, BH, C.alt, ak, false);
    bar(X0, B2, L2 * g2, BH, C.accent, ak, true);
    const a1 = ak * sstep(9.6, 10.0, lt), a2 = ak * sstep(10.0, 10.4, lt);
    text('电学', X0 - 26, B1 + 28, { size: 32, weight: 500, color: C.fg, alpha: a1, align: 'right' });
    text('麦克斯韦 1865', X0 - 26, B1 + 62, { size: 24, color: C.fg2, alpha: a1, align: 'right' });
    text('光学', X0 - 26, B2 + 28, { size: 32, weight: 500, color: C.fg, alpha: a2, align: 'right' });
    text('傅科 1862', X0 - 26, B2 + 62, { size: 24, color: C.fg2, alpha: a2, align: 'right' });
    text('310 740 km/s', VX, B1 + BH / 2 + 14, { font: F.mono, size: 40, color: C.alt, alpha: ak * sstep(0.7, 1, g1) });
    text('298 000 km/s', VX, B2 + BH / 2 + 14, { font: F.mono, size: 40, color: C.accent, alpha: ak * sstep(0.7, 1, g2) });
    // 4. the inference, in Maxwell's words, and light drawn as a wave for the first time on this page
    const aq = sstep(12.8, 13.4, lt);
    label('麦克斯韦 1862', 960, 410, aq, C.muted, 24, 'center');
    text('“we can scarcely avoid the inference that light consists in the transverse', 960, 474, { font: F.latin, style: 'italic', size: 30, color: C.accent, alpha: aq, align: 'center' });
    text('undulations of the same medium which is the cause of electric and magnetic phenomena”', 960, 516, { font: F.latin, style: 'italic', size: 30, color: C.accent, alpha: aq, align: 'center' });
    text('光就是电和磁的波动', 960, 650, { size: 66, weight: 500, color: C.fg, alpha: sstep(13.4, 14.0, lt), align: 'center', ls: 2 });
    wave(400, 1520, 780, 28, 160, (lt - 13.8) * 5, clamp((lt - 13.8) / 1.4), sstep(13.7, 14.1, lt));
    // the source line follows the captions: the 1856 paper while the bench is described, then Maxwell's two papers
    source('1856 · Annalen 99 · pp. 10-25', sstep(1.4, 2.0, lt) * (1 - sstep(6.0, 6.4, lt)));
    source('1865 · Phil. Trans. 155 · p. 499 · 1862 · Phil. Mag. 23 · p. 22', sstep(6.4, 6.9, lt));
  },
});
