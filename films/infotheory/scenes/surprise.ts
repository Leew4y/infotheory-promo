// 2. Chapter 01, surprise: I = −log2 p drawn in ink; a coin, a sunrise, a lottery ticket.
import { text, label, ink, circle, dot, rule, arrow } from '../../../engine/draw';
import { background, statement, M, COL, C, F } from '../../../engine/style';
import { scene } from '../../../engine/scene';
import { clamp, lerp, eout, sstep, win } from '../../../engine/util';

const X0 = COL + 60, X1 = 1740, Y0 = 740, Y1 = 300;
const px = (p: number) => lerp(X0, X1, p);
const py = (b: number) => lerp(Y0, Y1, clamp(b / 8));

scene({
  name: 'surprise', kind: 'page', start: 8, len: 6, mb: 3, chapter: 1, ch: ['惊讶', 'Surprise'],
  subs: [
    [0.8, 4.6, '抛一枚公平的硬币，无论落在哪一面，你得到 1 比特。', 'Toss a fair coin: whichever side lands, you gain one bit.'],
    [5.2, 8.8, '太阳明天升起，几乎没有惊讶，也几乎没有信息。', 'The sun rising tomorrow brings almost no surprise, and almost no information.'],
    [9.4, 12.8, '彩票中头奖，告诉你的多得多：二十三比特。', 'A lottery jackpot tells you far more: twenty-three bits.'],
    [13.4, 17.4, '惊讶的多少，由概率决定：I = −log₂ p。', 'How much surprise, the probability decides: I = −log₂ p.'],
  ],
  sfx: [[0.1, 'page'], [1.2, 'ink'], [2.0, 'ink'], [5.2, 'tick'], [5.6, 'tone', { midi: 64 }], [9.4, 'tick'], [9.8, 'tone', { midi: 67 }], [13.4, 'chime', { midi: 76 }]],
  draw(lt) {
    background();
    statement('越不可能的事，告诉你的越多。', 'The less likely the event, the more it tells you.', lt);
    // axes and the curve
    const ka = clamp((lt - 1.0) / 0.8);
    ink([[X0, Y1 - 10], [X0, Y0], [X1 + 10, Y0]], ka, C.fg2, 1.5);
    ['0', '0.5', '1'].forEach((s, i) => text(s, px(i * 0.5), Y0 + 34, { font: F.mono, size: 17, color: C.muted, alpha: ka, align: 'center' }));
    text('p', X1 + 34, Y0 + 6, { font: F.math, style: 'italic', size: 26, color: C.fg2, alpha: ka });
    text('bit', X0 - 8, Y1 - 24, { font: F.math, size: 20, color: C.fg2, alpha: ka, align: 'right' });
    for (let b = 2; b <= 8; b += 2) text(String(b), X0 - 14, py(b) + 6, { font: F.mono, size: 16, color: C.muted, alpha: ka, align: 'right' });
    const pts: [number, number][] = [];
    for (let i = 0; i <= 160; i++) {
      const p = 0.004 + (i / 160) * 0.996;
      pts.push([px(p), py(-Math.log2(p))]);
    }
    ink(pts, clamp((lt - 1.9) / 2.4), C.accent, 2.4);
    // three points with leaders
    const marks: [number, number, string, number, number][] = [[0.5, 1, '硬币 · 1 bit', 4.8, 60], [0.9999, 0, '日出 · ≈ 0 bit', 9.0, -70], [0.03, 5.06, '头奖 · 23.3 bit ↑', 12.6, 40]];
    marks.forEach(([p, b, lab, t0, dx]) => {
      const a = sstep(t0, t0 + 0.5, lt);
      dot(px(p), py(b), 6, C.fg, a);
      rule(px(p), py(b), px(p) + dx, py(b) - 44, C.fg2, a, 1);
      text(lab, px(p) + dx + (dx > 0 ? 8 : -8), py(b) - 50, { size: 20, color: C.fg, alpha: a, align: dx > 0 ? 'left' : 'right' });
    });
    // the three small drawings under the statement
    const cy = 520;
    const kc = clamp((lt - 1.2) / 0.8);
    circle(M + 60, cy, 56, kc);
    if (kc > 0.99) text('1', M + 60, cy + 17, { font: F.latin, size: 46, color: C.accent, align: 'center' });
    text('1 bit', M + 60, cy + 96, { font: F.latin, size: 18, color: C.muted, alpha: sstep(2, 2.5, lt), align: 'center', ls: 2 });
    const ks = clamp((lt - 5.4) / 1.0);
    const sx = M + 300;
    ink([[sx - 80, cy + 30], [sx + 80, cy + 30]], ks, C.fg, 1.5);
    circle(sx, cy + 30 - 36 * eout(ks), 30, ks, C.accent, 2);
    text('≈ 0 bit', sx, cy + 96, { font: F.latin, size: 18, color: C.muted, alpha: sstep(6.2, 6.7, lt), align: 'center', ls: 2 });
    const kt = clamp((lt - 9.6) / 1.0);
    const tx = M + 560;
    ink([[tx - 80, cy - 40], [tx + 80, cy - 40], [tx + 80, cy + 40], [tx - 80, cy + 40], [tx - 80, cy - 40]], kt, C.fg, 1.5, 1, [6, 5]);
    text('1 / 10⁷', tx, cy + 9, { font: F.math, size: 24, color: C.fg, alpha: sstep(10.2, 10.6, lt), align: 'center' });
    text('23.3 bit', tx, cy + 96, { font: F.latin, size: 18, color: C.accent, alpha: sstep(10.6, 11.1, lt), align: 'center', ls: 2 });
    // the formula
    const kf = sstep(13.2, 14, lt);
    text('I(x) = −log₂ p(x)', M, 700, { font: F.math, size: 46, color: C.fg, alpha: kf });
    rule(M, 716, M + 330 * eout(clamp((lt - 13.6) / 0.8)), 716, C.accent, kf, 2);
    label('Self-information · 自信息', M, 752, sstep(13.8, 14.4, lt), C.muted, 16);
    void win; void arrow;
  },
});
