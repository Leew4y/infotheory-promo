// 2. Chapter 02: Jupiter's clock. Rømer (Phil. Trans. 12, 1677, pp. 893-894): while the Earth moves away from Jupiter,
// each emergence of Io from Jupiter's shadow is seen a little later; the lateness adds up over many revolutions (the
// emergence of 9 November came 10 minutes late). He gave a delay, not a speed. Huygens (Traité de la lumière, 1690,
// pp. 8-9): about 22 minutes to cross the Earth's orbit, so 16⅔ Earth diameters a second, over 600 000 times the
// speed of sound. No km/s figure is given to Rømer.
import { ctx, text, rule, ink, circle, circlePts, dot, hatch, statement, background, C, F, scene, clamp, lerp, eio, eout, sstep, bars, TAU } from '../../../engine';
import { beam, pulse, glow, dimension, bigNumber, source } from '../kit';

const SX = 520, SY = 600, R = 186; // the Sun and the Earth's orbit
const JX = 1150, JY = 600, RJ = 46, RI = 112; // Jupiter and Io's orbit
/** Io's angle where it leaves the shadow (screen angles; Io runs counterclockwise on screen, angle decreasing). */
const TE = -Math.asin(RJ / RI);
const EX = JX + RI * Math.cos(TE), EY = JY + RI * Math.sin(TE);
const DX = 1560, DY = 515, DR = 92; // the dial
/** First emergence, Io's period on screen, emergences while the Earth moves, light's speed on screen (px/s). */
const T0 = 1.4, P = 1.0, NK = 5, V = 900;
/** The Earth starts past the point nearest Jupiter (so its line of sight clears the planet) and moves away. */
const earthAng = (lt: number) => lerp(-0.8, -2.2, eio(clamp((lt - 1.2) / 4.6)));
const earth = (lt: number): [number, number] => [SX + R * Math.cos(earthAng(lt)), SY + R * Math.sin(earthAng(lt))];
const dist = (lt: number) => {
  const [x, y] = earth(lt);
  return Math.hypot(EX - x, EY - y);
};
/** When the light that leaves Io at its k-th emergence reaches the Earth. */
const arrive = (k: number) => {
  const te = T0 + k * P;
  let ta = te + dist(te) / V;
  for (let i = 0; i < 3; i++) ta = te + dist(ta) / V;
  return ta;
};
const NP = 8;
const ARR = Array.from({ length: NP }, (_, k) => arrive(k));
const D0 = dist(ARR[0]), D1 = dist(ARR[NK - 1]);
/** Minutes late on the dial: a small step at each arrival, in proportion to the extra path; 10 at the last. */
const late = (lt: number) => {
  let m = 0;
  for (let k = 0; k < NK; k++) {
    if (lt < ARR[k]) break;
    m = lerp(m, 10 * clamp((dist(ARR[k]) - D0) / (D1 - D0)), eout(clamp((lt - ARR[k]) / 0.18)));
  }
  return m;
};

/** The emergence clock: minute ticks, the predicted hand at 0, the observed hand and the hatched lateness. */
function dial(m: number, a: number): void {
  if (a <= 0.002) return;
  circle(DX, DY, DR, 1, C.fg2, 2, a);
  for (let i = 0; i < 60; i++) {
    const t = -Math.PI / 2 + (i / 60) * TAU, L = i % 5 === 0 ? 16 : 7;
    rule(DX + Math.cos(t) * (DR - L), DY + Math.sin(t) * (DR - L), DX + Math.cos(t) * (DR - 3), DY + Math.sin(t) * (DR - 3), C.fg2, a * (i % 5 === 0 ? 0.9 : 0.55), i % 5 === 0 ? 2 : 1.2);
  }
  const ph = (m / 60) * TAU;
  if (ph > 0.004) {
    hatch(() => {
      ctx.moveTo(DX, DY);
      ctx.arc(DX, DY, DR - 4, -Math.PI / 2, -Math.PI / 2 + ph);
      ctx.closePath();
    }, C.accent, a * 0.45, 7);
    const arc: [number, number][] = [];
    for (let i = 0; i <= 24; i++) {
      const t = -Math.PI / 2 + (ph * i) / 24;
      arc.push([DX + Math.cos(t) * (DR + 8), DY + Math.sin(t) * (DR + 8)]);
    }
    ink(arc, 1, C.accent, 3.5, a);
  }
  rule(DX, DY, DX, DY - (DR - 18), C.muted, a, 3);
  beam(DX, DY, DX + Math.sin(ph) * (DR - 14), DY - Math.cos(ph) * (DR - 14), 1, a, C.accent, 3.5);
  dot(DX, DY, 6, C.fg, a);
  text('推算', DX - 10, DY - DR - 18, { size: 24, color: C.muted, alpha: a, align: 'right' });
  text('观测', DX + Math.sin(ph) * (DR + 24) + 6, DY - Math.cos(ph) * (DR + 24) + 4, { size: 26, color: C.accent, alpha: a });
}

/** 16⅔ in the film's mono: the whole number, then 2 over 3 stacked (the mono face has no ⅔ and falls back to a serif). */
function sixteenTwoThirds(cx: number, y: number, a: number): void {
  if (a <= 0.002) return;
  const size = 150, cw = size * 0.6, fs = 64, fw = fs * 0.6 + 14, gap = 16;
  const x0 = cx - (2 * cw + gap + fw) / 2;
  bigNumber('16', x0 + cw, y, size, a, C.fg);
  const fx = x0 + 2 * cw + gap + fw / 2, mid = y - size * 0.36;
  text('2', fx, mid - 12, { font: F.mono, size: fs, color: C.fg, alpha: a, align: 'center' });
  rule(fx - fw / 2, mid, fx + fw / 2, mid, C.fg, a, 4);
  text('3', fx, mid + 12 + fs * 0.73, { font: F.mono, size: fs, color: C.fg, alpha: a, align: 'center' });
}

scene({
  name: 'roemer', kind: 'page', dur: bars(6), mb: 3, chapter: 2, ch: ['木星的钟', "Jupiter's clock"],
  subs: [
    [1, 6.5, '1676 年，罗默指出：地球远离木星时，木卫一的掩食会一次次推迟。', "In 1676 Rømer showed that Io's eclipses run later and later while the Earth moves away from Jupiter."],
    [7, 12, '他给出的是延迟，不是速度。1690 年，惠更斯据此算出：光每秒走 16⅔ 个地球直径。', 'He gave a delay, not a speed. In 1690 Huygens worked out 16⅔ Earth diameters per second.'],
    [12.5, 17, '比声音快 60 多万倍，但仍然不是瞬时的。', 'Over 600 000 times faster than sound, yet not instantaneous.'],
  ],
  sfx: [[0.1, 'page'], [ARR[0], 'tick'], [6.5, 'tone', { midi: 64 }], [9.8, 'chime', { midi: 74 }], [12.7, 'tone', { midi: 69 }]],
  draw(lt) {
    background();
    statement('光走远路要花时间', 'Light takes time to travel', lt);
    const a = sstep(0.6, 1.3, lt);
    // Romer's part (Jupiter, Io, the light to the Earth, the clock) leaves as Huygens's sentence begins
    const aJ = a * (1 - sstep(8.45, 9.0, lt));

    // Huygens: the light crosses the Earth's orbit (from the side nearer Jupiter) in about 22 minutes
    const ah = sstep(8.9, 9.3, lt);
    beam(SX + R, SY, SX - R, SY, clamp((lt - 8.9) / 0.7), ah * 0.55, C.accent, 2);
    dimension(SX - R, SX + R, SY + R + 28, '横穿地球轨道约 22 分钟（惠更斯 1690）', ah, clamp((lt - 9.0) / 0.7));
    for (const t0 of [9.4, 12.9, 15.0]) pulse(SX + R, SY, SX - R, SY, (lt - t0) / 1.7, ah, undefined, 0.07);

    // the Sun and the Earth's orbit
    circle(SX, SY, R, 1, C.fg2, 2, a * 0.8);
    glow(SX, SY, 70, a, C.alt);
    dot(SX, SY, 16, C.alt, a);
    text('太阳', SX, SY + 76, { size: 26, color: C.fg2, alpha: a, align: 'center' });

    // the Earth, moving away from Jupiter during the first caption
    const [ex, ey] = earth(lt);
    glow(ex, ey, 26, a * 0.6, C.accent);
    dot(ex, ey, 11, C.accent, a);
    text('地球', ex, ey - 34, { size: 26, color: C.fg, alpha: a, align: 'center' });

    // Jupiter, its shadow (pointing away from the Sun), Io's orbit
    hatch(() => ctx.rect(JX, JY - RJ, 220, 2 * RJ), C.fg2, aJ * 0.35, 9);
    rule(JX, JY - RJ, JX + 220, JY - RJ, C.fg2, aJ * 0.5, 1.2);
    rule(JX, JY + RJ, JX + 220, JY + RJ, C.fg2, aJ * 0.5, 1.2);
    ctx.save();
    ctx.globalAlpha = aJ;
    ctx.fillStyle = C.bg2;
    ctx.beginPath();
    ctx.arc(JX, JY, RJ, 0, TAU);
    ctx.fill();
    ctx.restore();
    circle(JX, JY, RJ, 1, C.fg, 2.5, aJ);
    rule(JX - RJ * 0.86, JY - 14, JX + RJ * 0.86, JY - 14, C.fg2, aJ * 0.6, 1.5);
    rule(JX - RJ * 0.86, JY + 12, JX + RJ * 0.86, JY + 12, C.fg2, aJ * 0.6, 1.5);
    ink(circlePts(JX, JY, RI, 96), 1, C.fg2, 1.5, aJ * 0.55, [5, 9]);
    text('木星', JX, JY + RI + 50, { size: 26, color: C.fg2, alpha: aJ, align: 'center' });
    text('木卫一', JX, JY - RI - 22, { size: 26, color: C.fg2, alpha: aJ, align: 'center' });
    text('木星的影子', JX + 185, JY + RJ + 46, { size: 24, color: C.muted, alpha: aJ, align: 'center' });

    // Io: dark inside the shadow, lit outside it
    const th = TE - (TAU * (lt - T0)) / P;
    const u = ((th % TAU) + TAU) % TAU;
    const inShadow = u < -TE || u > TAU + TE;
    const ix = JX + RI * Math.cos(th), iy = JY + RI * Math.sin(th);
    if (!inShadow) glow(ix, iy, 22, aJ * 0.5, C.accent2);
    dot(ix, iy, 9, inShadow ? C.muted : C.accent2, aJ * (inShadow ? 0.35 : 1));

    // the line of sight, and the light of each emergence travelling to the Earth
    rule(EX, EY, ex, ey, C.accent, aJ * 0.3, 1.5);
    for (let k = 0; k < NP; k++) {
      const te = T0 + k * P;
      if (lt < te) break;
      glow(EX, EY, 34, aJ * (1 - clamp((lt - te) / 0.3)), C.accent2);
      pulse(EX, EY, ex, ey, ((lt - te) * V) / dist(lt), aJ, C.accent2, 0.06);
    }

    // the clock: each emergence is seen a little later than predicted; the lateness adds up
    const ad = sstep(1.4, 2.0, lt) * (1 - sstep(8.45, 9.0, lt));
    dial(late(lt), ad);
    text('木卫一出影时刻', DX, DY + DR + 56, { size: 26, color: C.fg2, alpha: ad, align: 'center' });
    const an = ad * sstep(6.4, 7.0, lt);
    text('11 月 9 日', DX, DY + DR + 106, { size: 26, color: C.fg2, alpha: an, align: 'center' });
    text('出影晚 10 分钟', DX, DY + DR + 152, { size: 34, weight: 500, color: C.accent, alpha: an, align: 'center' });

    // Huygens's result
    sixteenTwoThirds(1300, 590, sstep(9.7, 10.4, lt));
    text('个地球直径 / 秒', 1300, 670, { size: 34, color: C.fg2, alpha: sstep(10.1, 10.8, lt), align: 'center' });
    text('比声音快 60 多万倍', 1300, 790, { size: 50, color: C.accent, alpha: sstep(12.7, 13.4, lt), align: 'center' });

    source('1677 · Phil. Trans. 12 · pp. 893-894 · 1690 · Huygens · pp. 8-9', sstep(1.4, 2.0, lt));
  },
});
