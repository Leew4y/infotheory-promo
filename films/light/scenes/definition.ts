// 9. Chapter 09: the number is fixed. The 15th CGPM (1975) recommended c = 299 792 458 m/s (Resolution 2, Comptes
// rendus p. 103); the value came from the three latest determinations in the CCDM report printed in the same volume
// (pp. 68-69: 299 792 458.3 ± 1.2, 299 792 457 ± 6, 299 792 462 ± 18 m/s). The 17th CGPM (1983, Resolution 1) turned
// it around: the metre is the length of the path travelled by light in vacuum in 1/299 792 458 of a second, and the
// 1960 krypton definition is abrogated. The number settles digit by digit, becomes the denominator of the new
// definition, and comes back as an exact value with no uncertainty.
import { text, ink, rule, dot, measure, statement, background, hash1, C, F, FPS, scene, clamp, lerp, eio, eout, sstep, bars, W } from '../../../engine';
import { beam, pulse, source } from '../kit';

const NUM = '299 792 458';
const MONO = 0.6; // advance of the mono font, in em

/** Colours as [r, g, b]: from hex, blended, and back to CSS. */
const rgb = (h: string): number[] => [1, 3, 5].map((s) => parseInt(h.slice(s, s + 2), 16));
const blend = (a: number[], b: number[], t: number): number[] => a.map((v, i) => lerp(v, b[i], clamp(t)));
const css = (c: number[]): string => `rgb(${c.map(Math.round).join(',')})`;

/** When the j-th digit of the number settles (s): one after another, from 1.6 s. */
const settleAt = (j: number) => 1.6 + 0.2 * j;

/**
 * The number in mono, centred at cx, character by character. Before its time each digit rolls (ten changes a second)
 * in a dim colour; it then settles to its value and brightens. The last three digits turn amber by hi (0..1).
 */
function digits(lt: number, cx: number, y: number, size: number, a: number, hi: number): void {
  if (a <= 0.002) return;
  const chars = [...NUM], cw = size * MONO, x0 = cx - (cw * chars.length) / 2;
  let j = 0;
  chars.forEach((c, i) => {
    if (c === ' ') return;
    const ts = settleAt(j++);
    // the roll steps every third output frame and a digit settles on a frame, both counted from the nearest frame, so
    // motion-blur sub-frames (all within half a frame of it) show the same digit and nothing doubles
    const fr = Math.round(lt * FPS);
    const shown = fr >= Math.round(ts * FPS) ? c : String(Math.floor(hash1(i * 7.3 + Math.floor(fr / 3)) * 10));
    const base = blend(rgb(C.muted), rgb(C.fg), sstep(ts, ts + 0.25, lt));
    const col = i >= chars.length - 3 ? blend(base, rgb(C.alt), hi) : base;
    text(shown, x0 + cw * (i + 0.5), y, { font: F.mono, size, color: css(col), alpha: a, align: 'center' });
  });
}

// ---- 1975: the recommended value and the three determinations it came from (CR 15e CGPM, pp. 68-69)
const P1 = { x: W / 2, y: 520, s: 140 };
const LEFT = P1.x - (P1.s * MONO * NUM.length) / 2; // left edge of the big number
const ROWS: [string, string, string, number, number, number][] = [
  // integer part, decimals, uncertainty, value and uncertainty (m/s above 299 792 000), time it appears
  ['299 792 458', '.3', '± 1.2', 458.3, 1.2, 3.6],
  ['299 792 457', '', '± 6', 457, 6, 4.0],
  ['299 792 462', '', '± 18', 462, 18, 4.4],
];
const ROW_Y = [660, 710, 760], XI = LEFT + 26 * MONO * 11, XPM = XI + 50;
/** Plot position of a speed (m/s above 299 792 000): 440 .. 480 over 640 px. */
const px = (v: number) => 840 + (v - 440) * 16;

// ---- 1983: the old definition struck, the new one as an equation, the light path under it
const KR_Y = 470, EQ_Y = 610, EQ_S = 52, BEAM_Y = 740, GAP = 24, YEAR_W = 120;
const EQ_A = '1 米 = 光在真空中', EQ_B = '秒内走过的长度', KR = '米由氪原子的一条谱线定义';
const BAR_Y = EQ_Y - 19; // the fraction bar, level with the middle of the Chinese characters
function eqLayout() {
  const wa = measure(EQ_A, EQ_S), wb = measure(EQ_B, EQ_S), wf = EQ_S * MONO * NUM.length;
  const total = wa + GAP + wf + GAP + wb;
  const x0 = W / 2 - (total + YEAR_W) / 2 + YEAR_W;
  return { x0, x1: x0 + total, wf, fx: x0 + wa + GAP + wf / 2, xb: x0 + wa + GAP + wf + GAP };
}

// ---- exact: c = 299 792 458 m/s
const S3 = 128, Y3 = 540, C_S = 112, EQ3_S = 92, UNIT_S = 44;
function exactLayout() {
  const wc = measure('c', C_S, F.math), we = measure('=', EQ3_S, F.math), wn = S3 * MONO * NUM.length, wu = measure('m / s', UNIT_S, F.mono);
  const total = wc + 22 + we + 34 + wn + 30 + wu;
  const x0 = W / 2 - total / 2;
  return { x0, xe: x0 + wc + 22, cx: x0 + wc + 22 + we + 34 + wn / 2, xu: x0 + total - wu, x1: x0 + total };
}

scene({
  name: 'definition', kind: 'page', dur: bars(6), mb: 3, chapter: 9, ch: ['定下来', 'Fixed'],
  subs: [
    [1, 6, '1975 年，国际计量大会建议采用 299 792 458 米每秒，这个值由三次最新测量得出。', 'In 1975 the General Conference on Weights and Measures recommended 299 792 458 metres a second, from the three latest measurements.'],
    [6.5, 12.5, '1983 年，大会反过来规定：米，就是光在真空中 1/299 792 458 秒内走过的长度。', 'In 1983 it turned this around: the metre is the length of the path travelled by light in vacuum in 1/299 792 458 of a second.'],
    [13, 17.5, '从此光速是一个规定的精确值，不再有测量误差。', 'Since then the speed of light is an exact, defined value with no uncertainty.'],
  ],
  sfx: [[0.1, 'page'], [1.6, 'tick'], [3.2, 'chime', { midi: 74 }], [7.0, 'tone', { midi: 62 }], [8.4, 'tick'], [14.2, 'chime', { midi: 79 }]],
  draw(lt) {
    background();
    statement('把它定下来', 'Fix it', lt);
    const e = eqLayout(), x3 = exactLayout();

    // the number: big (1975), then the denominator of the definition (1983), then big again (exact)
    const k1 = eio(clamp((lt - 6.5) / 1.0)), k2 = eio(clamp((lt - 12.8) / 1.0));
    const p2 = { x: e.fx, y: BAR_Y + 52, s: EQ_S }, p3 = { x: x3.cx, y: Y3, s: S3 };
    const nx = lerp(lerp(P1.x, p2.x, k1), p3.x, k2), ny = lerp(lerp(P1.y, p2.y, k1), p3.y, k2), ns = lerp(lerp(P1.s, p2.s, k1), p3.s, k2);
    const hi = sstep(4.8, 5.4, lt) * (1 - sstep(6.0, 6.6, lt));
    digits(lt, nx, ny, ns, sstep(0.9, 1.5, lt), hi);

    // 1975: tag and unit around the big number
    const a1 = 1 - sstep(6.0, 6.5, lt);
    text('1975 · 建议值', LEFT, 392, { font: F.mono, size: 26, color: C.alt, alpha: sstep(1.6, 2.2, lt) * a1 });
    text('m / s', P1.x + (P1.s * MONO * NUM.length) / 2 + 30, P1.y, { font: F.mono, size: 40, color: C.accent, alpha: sstep(3.0, 3.6, lt) * a1, align: 'left' });
    // the three determinations: value, uncertainty, and the same as a bar on a common scale
    text('三次最新测量（米每秒）', LEFT, 612, { size: 26, color: C.muted, alpha: sstep(3.3, 3.8, lt) * a1 });
    ROWS.forEach(([int, dec, pm, v, u, t], i) => {
      const ar = sstep(t, t + 0.4, lt) * a1, y = ROW_Y[i], yb = y - 9;
      text(int, XI, y, { font: F.mono, size: 26, color: C.fg, alpha: ar, align: 'right' });
      text(dec, XI, y, { font: F.mono, size: 26, color: C.fg, alpha: ar });
      text(pm, XPM, y, { font: F.mono, size: 26, color: C.fg2, alpha: ar });
      const kb = eout(clamp((lt - t - 0.1) / 0.6));
      const xl = px(v - u * kb), xr = px(v + u * kb);
      rule(xl, yb, xr, yb, C.accent, ar, 3);
      rule(xl, yb - 9, xl, yb + 9, C.accent, ar * kb, 2.5);
      rule(xr, yb - 9, xr, yb + 9, C.accent, ar * kb, 2.5);
      dot(px(v), yb, 5, C.accent2, ar);
    });
    // the recommended value through all three bars, as the last digits of the big number turn amber
    const kl = eout(clamp((lt - 4.8) / 0.6));
    ink([[px(458), 626], [px(458), 776]], kl, C.alt, 2.5, a1);
    text('458', px(458), 808, { font: F.mono, size: 26, color: C.alt, alpha: sstep(5.0, 5.4, lt) * a1, align: 'center' });

    // 1983: the old definition (1960) struck out
    const a2 = 1 - sstep(12.4, 12.9, lt);
    const ak = sstep(7.6, 8.1, lt) * a2;
    const yx = e.x0 - 36;
    text('1960', yx, KR_Y, { font: F.mono, size: 30, color: C.muted, alpha: ak, align: 'right' });
    text(KR, e.x0, KR_Y, { size: 36, color: C.fg2, alpha: ak * (1 - 0.35 * sstep(8.7, 9.3, lt)) });
    const wk = measure(KR, 36);
    // the strike runs a little above the middle of the characters, so that it does not merge with 一
    ink([[e.x0 - 8, KR_Y - 20], [e.x0 + wk + 8, KR_Y - 20]], eout(clamp((lt - 8.3) / 0.5)), C.alt, 3, ak);
    text('作废', e.x0 + wk + 30, KR_Y, { size: 30, color: C.alt, alpha: sstep(8.8, 9.2, lt) * a2 });
    // the new definition: the number turned over into a denominator, then the sentence around it
    const af = sstep(7.2, 7.8, lt) * (1 - sstep(12.5, 12.9, lt));
    text('1', e.fx, BAR_Y - 14, { font: F.mono, size: EQ_S, color: C.fg, alpha: af, align: 'center' });
    rule(e.fx - e.wf / 2 - 6, BAR_Y, e.fx + e.wf / 2 + 6, BAR_Y, C.fg, af, 2.5);
    text('1983', yx, EQ_Y, { font: F.mono, size: 30, color: C.accent, alpha: sstep(8.8, 9.3, lt) * a2, align: 'right' });
    text(EQ_A, e.x0, EQ_Y, { size: EQ_S, weight: 500, color: C.fg, alpha: sstep(9.0, 9.6, lt) * a2 });
    text(EQ_B, e.xb, EQ_Y, { size: EQ_S, weight: 500, color: C.fg, alpha: sstep(9.4, 10.0, lt) * a2 });
    // the light path itself: one metre, crossed by a pulse
    const ab = sstep(9.9, 10.3, lt) * a2;
    beam(e.x0, BEAM_Y, e.x1, BEAM_Y, clamp((lt - 9.9) / 0.7), ab * 0.75, C.accent, 2.4);
    rule(e.x0, BEAM_Y - 14, e.x0, BEAM_Y + 14, C.fg2, ab, 2);
    rule(e.x1, BEAM_Y - 14, e.x1, BEAM_Y + 14, C.fg2, ab * sstep(10.5, 10.7, lt), 2);
    for (const t of [10.7, 11.5]) pulse(e.x0, BEAM_Y, e.x1, BEAM_Y, (lt - t) / 0.7, ab);
    text('1 米', (e.x0 + e.x1) / 2, BEAM_Y + 52, { size: 30, color: C.fg2, alpha: sstep(10.4, 10.9, lt) * a2, align: 'center' });

    // exact: c = 299 792 458 m/s, closed in by amber brackets; no uncertainty any more
    const a3 = sstep(13.6, 14.2, lt);
    text('c', x3.x0, Y3, { font: F.math, style: 'italic', size: C_S, color: C.fg, alpha: a3 });
    text('=', x3.xe, Y3, { font: F.math, size: EQ3_S, color: C.fg, alpha: a3 });
    text('m / s', x3.xu, Y3, { font: F.mono, size: UNIT_S, color: C.accent, alpha: a3 });
    const kc = eout(clamp((lt - 14.0) / 0.8)), off = 60 * (1 - kc), arm = 44;
    const bx0 = x3.x0 - 40 - off, bx1 = x3.x1 + 40 + off, by0 = Y3 - S3 * 0.73 - 36 - off * 0.5, by1 = Y3 + 36 + off * 0.5;
    for (const [x, y, sx, sy] of [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx0, by1, 1, -1], [bx1, by1, -1, -1]] as [number, number, number, number][]) {
      ink([[x + sx * arm, y], [x, y], [x, y + sy * arm]], 1, C.alt, 3, kc);
    }
    text('规定的精确值', W / 2, 680, { size: 44, weight: 500, color: C.alt, alpha: sstep(14.6, 15.2, lt), align: 'center' });
    text('不再有测量误差', W / 2, 740, { size: 30, color: C.fg2, alpha: sstep(15.0, 15.6, lt), align: 'center' });

    // written in capitals as label() sets it, so that the font subset (built from literals) gets É
    source('1975 · CR 15E CGPM · PP. 68-69, 103 · 1983 · 17E CGPM · RÉS. 1', sstep(1.4, 2.0, lt));
  },
});
