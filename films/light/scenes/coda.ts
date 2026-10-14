// 10. Coda: a ruler and a beam of light. First 299 792 458 m/s above the beam, its "m" turning cyan (the metre is
// defined with light); then the ruler measures the light (an arrow from the ruler up to the beam, labelled 从前);
// then the arrow turns round: one pulse runs from the ruler's zero, its path in 1/299 792 458 s marks the ruler's
// 0 and 1 m, and that time appears large. The 1983 definition of the metre (17th CGPM, Resolution 1, full text on the
// BIPM site) and the value recommended in 1975 (15th CGPM, proceedings p. 103); no source line on this page.
import { text, measure, rule, ink, arrow, background, ctx, C, F, scene, clamp, lerp, eout, eio, sstep, win, bars, W } from '../../../engine';
import { beam, pulse, glow, bigNumber } from '../kit';

/** The beam (y), the lamp and the beam's far end; the ruler (0 to 1 m) under it; the arrow between them at AX. */
const Y = 480, LX = 300, BX = 1620;
const RX0 = 420, RX1 = 1500, RT = 620, RB = 700, AX = 960;
/** State A: pulses crossing the whole beam (start times, seconds each); 1320 px in 1.2 s, the speed of state B's pulse. */
const PULSES = [2.6, 4.0, 5.4, 6.8], TRIP = 1.2;
/** State B: the one pulse from the ruler's zero to its 1 m mark (1080 px in 1.0 s). */
const TB = 8.5, TRIP_B = 1.0;
/** The number's centre and baseline; the result 1/299 792 458 s later takes the same place. */
const NX = W / 2 - 30, NY = 330;

/** Two #rrggbb colours mixed, k 0..1. */
function mix(c0: string, c1: string, k: number): string {
  const ch = (c: string, i: number) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(lerp(ch(c0, i), ch(c1, i), clamp(k))).toString(16).padStart(2, '0')).join('');
}

/** A metre ruler drawn in to fraction k; lit(x) 0..1 turns the ticks up to x cyan (the light marking them). */
function ruler(k: number, a: number, lit: (x: number) => number): void {
  if (a <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = a * 0.08 * sstep(0.92, 1, k);
  ctx.fillStyle = C.alt;
  ctx.fillRect(RX0, RT, RX1 - RX0, RB - RT);
  ctx.restore();
  ink([[RX0, RT], [RX1, RT], [RX1, RB], [RX0, RB], [RX0, RT]], k, C.alt, 2.5, a);
  for (let i = 0; i <= 100; i++) {
    const x = lerp(RX0, RX1, i / 100);
    const len = i % 50 === 0 ? 38 : i % 10 === 0 ? 28 : i % 5 === 0 ? 19 : 11;
    const w = i % 10 === 0 ? 2.2 : 1.2;
    const ai = a * sstep(i / 100 - 0.04, i / 100 + 0.01, k);
    rule(x, RT, x, RT + len, C.fg2, ai, w);
    const li = lit(x);
    if (li > 0.002) rule(x, RT, x, RT + len, C.accent2, ai * li, w + 0.8);
  }
}

scene({
  name: 'coda', kind: 'page', dur: bars(4), mb: 3,
  subs: [
    [1, 5.5, '所以它是整数：不是光恰好这么快，而是我们用光重新定义了“米”。', 'So it is a whole number: not because light happens to be that fast, but because we redefined the metre with light.'],
    [6, 10.5, '从前用尺子量光，如今用光量尺子。', 'We used to measure light with a ruler; now we measure rulers with light.'],
  ],
  sfx: [[0.1, 'page'], [3.8, 'tick'], [6.3, 'tick'], [8.0, 'tone', { midi: 64 }], [9.5, 'chime', { midi: 76 }]],
  draw(lt) {
    background();
    const a = sstep(0.3, 1.0, lt);
    // caption 1: the speed, whole; its metre turns to the light's colour, then the number leaves for the diagram
    const aN = sstep(1.3, 1.8, lt) * (1 - sstep(5.4, 5.9, lt));
    bigNumber('299 792 458', NX, NY, 80, aN, C.fg, clamp((lt - 1.3) / 0.6));
    const xu = NX + (80 * 0.6 * 11) / 2 + 24, aU = aN * sstep(1.8, 2.2, lt);
    const kM = sstep(3.8, 4.3, lt), wm = measure('m', 40, F.mono);
    text('m', xu, NY, { font: F.mono, size: 40, color: mix(C.fg2, C.accent, kM), alpha: aU, align: 'left' });
    beam(xu - 2, NY + 16, xu + wm + 2, NY + 16, kM, aU, C.accent, 3);
    text('/ s', xu + measure('m ', 40, F.mono), NY, { font: F.mono, size: 40, color: C.fg2, alpha: aU, align: 'left' });
    // the light: a lamp and its beam
    glow(LX, Y, 54, a, C.accent2);
    beam(LX, Y, BX, Y, clamp((lt - 0.5) / 0.9), a * 0.55, C.accent, 2.4);
    text('光', LX, Y - 72, { size: 30, color: C.fg2, alpha: a, align: 'center' });
    // the ruler; in state B the light marks its ticks as the pulse passes
    const uB = (lt - TB) / TRIP_B;
    const front = lerp(RX0, RX1, clamp(uB));
    const lit = (x: number) => (lt < TB ? 0 : sstep(x - 30, x, front));
    ruler(eout(clamp((lt - 0.3) / 1.1)), a, lit);
    text('尺子', RX0 - 28, RT + 52, { size: 30, color: C.fg2, alpha: a, align: 'right' });
    // state A: the ruler measures the light (amber arrow up), pulses cross the beam
    for (const t of PULSES) pulse(LX, Y, BX, Y, (lt - t) / TRIP, a);
    const kUp = eout(clamp((lt - 6.1) / 0.6)) * (1 - eio(clamp((lt - 7.7) / 0.4)));
    const aUp = sstep(6.1, 6.4, lt) * (1 - sstep(7.9, 8.1, lt));
    // the head is 18 px: the arrow fades while shorter than that instead of showing a bare head
    if (kUp > 0) arrow(AX, RT - 14, AX, RT - 14 - 112 * kUp, C.alt, aUp * sstep(0.12, 0.3, kUp), 3.5, 18);
    text('从前', AX - 30, 572, { size: 32, weight: 500, color: C.alt, alpha: win(lt, 6.1, 8.0, 0.5, 0.35), align: 'right' });
    // state B: the arrow turns round (light marks the ruler); one pulse runs from 0 to 1 m and leaves its path
    const kDn = eout(clamp((lt - 8.0) / 0.6));
    if (kDn > 0) arrow(AX, Y + 14, AX, Y + 14 + 112 * kDn, C.accent, sstep(0.12, 0.3, kDn), 3.5, 18);
    text('如今', AX + 30, 572, { size: 32, weight: 500, color: C.accent, alpha: sstep(8.1, 8.6, lt), align: 'left' });
    pulse(RX0, Y, RX1, Y, uB, 1);
    beam(RX0, Y, RX1, Y, clamp(uB), sstep(TB, TB + 0.1, lt), C.accent2, 4.5);
    const a0 = sstep(TB, TB + 0.3, lt), a1 = sstep(TB + TRIP_B - 0.1, TB + TRIP_B + 0.2, lt);
    rule(RX0, Y - 24, RX0, Y + 24, C.accent2, a0, 3);
    rule(RX1, Y - 24, RX1, Y + 24, C.accent2, a1, 3);
    rule(RX0, RT - 12, RX0, RB + 12, C.accent2, a0, 3);
    rule(RX1, RT - 12, RX1, RB + 12, C.accent2, a1, 3);
    text('0', RX0, RB + 56, { font: F.mono, size: 30, color: C.accent, alpha: a0, align: 'center' });
    text('1 m', RX1, RB + 56, { font: F.mono, size: 30, color: C.accent, alpha: a1, align: 'center' });
    // the path's duration, large, once the pulse has arrived
    const an = sstep(9.4, 9.9, lt);
    bigNumber('1/299 792 458', NX, NY, 100, an, C.fg, clamp((lt - 9.4) / 0.7));
    text('s', NX + 390 + 22, NY, { font: F.mono, size: 44, color: C.accent, alpha: sstep(10.0, 10.4, lt), align: 'left' });
  },
});
