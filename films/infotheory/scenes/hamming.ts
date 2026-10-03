// 7. Chapter 05, error correction: Hamming(7,4) in three ink circles; a bit flips, two circles go odd, it is found and fixed.
import { text, label, circle, rule, bits, background, statement, row, M, C, F, scene, clamp, eout, sstep, win } from '../../../engine';

const D = [1, 0, 1, 1];
const P = [D[0] ^ D[1] ^ D[3], D[0] ^ D[2] ^ D[3], D[1] ^ D[2] ^ D[3]];
const CX = 1360, CY = 520, R = 165;
const CIRC: [number, number, string][] = [[CX, CY - 92, 'A'], [CX - 105, CY + 82, 'B'], [CX + 105, CY + 82, 'C']];
const REG: Record<string, [number, number]> = {
  d1: [CX - 92, CY - 22], d2: [CX + 92, CY - 22], d3: [CX, CY + 128], d4: [CX, CY + 14],
  p1: [CX, CY - 188], p2: [CX - 205, CY + 146], p3: [CX + 205, CY + 146],
};
const IN: Record<string, string[]> = { A: ['d1', 'd2', 'd4', 'p1'], B: ['d1', 'd3', 'd4', 'p2'], C: ['d2', 'd3', 'd4', 'p3'] };
const FLIP_T = 7.0, FIX_T = 12.0;

scene({
  name: 'hamming', kind: 'page', start: 34, len: 6, mb: 3, chapter: 5, ch: ['纠错', 'Error correction'],
  subs: [
    [0.8, 4.4, '4 个数据位，再加 3 个校验位。', 'Four data bits, plus three parity bits.'],
    [5, 8.2, '每个圆里的 1，都凑成偶数。', 'Inside every circle, the ones add up to an even number.'],
    [8.8, 11.8, '噪声翻转了一位：两个圆变成奇数，第三个没变。', 'Noise flips one bit: two circles go odd, the third stays even.'],
    [12.4, 15.2, '交集只有一处。错误被找到，然后修好。', 'Only one region fits. The error is found, and fixed.'],
    [15.6, 17.6, '从 CD 到深空探测器，到你手机里的二维码。', 'From CDs to deep-space probes to the QR code on your phone.'],
  ],
  sfx: [[0.1, 'page'], [1.2, 'ink'], [1.7, 'ink'], [2.2, 'ink'], ...[0, 1, 2, 3].map((i) => [2.8 + i * 0.25, 'tick'] as [number, string]), ...[0, 1, 2].map((i) => [5.0 + i * 0.3, 'tick'] as [number, string]), [FLIP_T, 'stamp'], [9.0, 'tone', { midi: 59 }], [9.6, 'tone', { midi: 59 }], [FIX_T, 'chime', { midi: 76 }], ...[0, 1, 2, 3].map((i) => [15.8 + i * 0.5, 'tick'] as [number, string])],
  draw(lt) {
    background();
    statement('多加三个比特，换来确定。', 'Three more bits buy certainty.', lt);
    const flipped = lt >= FLIP_T && lt < FIX_T;
    const b: Record<string, number> = { d1: D[0], d2: D[1], d3: flipped ? D[2] ^ 1 : D[2], d4: D[3], p1: P[0], p2: P[1], p3: P[2] };
    const checking = lt > 8.8 && lt < FIX_T + 0.8;
    CIRC.forEach(([x, y, id], i) => {
      const k = eout(clamp((lt - 1.2 - i * 0.5) / 0.9));
      const parity = IN[id].reduce((s, r) => s ^ b[r], 0);
      const col = checking ? (parity ? C.accent : C.alt2) : C.fg;
      circle(x, y, R, k, col, checking ? 2.4 : 1.6);
      const lx = i === 0 ? CX : x + (i === 1 ? -255 : 255), ly = i === 0 ? CY - 300 : CY + 200;
      text(id, lx, ly, { font: F.latin, size: 26, color: col, alpha: k, align: 'center' });
      if (checking) label(parity ? 'odd · 奇' : 'even · 偶', lx, ly + 30, sstep(9.0 + i * 0.3, 9.4 + i * 0.3, lt), col, 14, 'center');
    });
    (['d1', 'd2', 'd3', 'd4', 'p1', 'p2', 'p3'] as const).forEach((id, i) => {
      const isP = id.startsWith('p');
      const t0 = isP ? 5.0 + (i - 4) * 0.3 : 2.8 + i * 0.25;
      const a = eout(clamp((lt - t0) / 0.4));
      if (a <= 0) return;
      const [x, y] = REG[id];
      const bad = id === 'd3' && flipped;
      const found = id === 'd3' && lt >= FIX_T && lt < FIX_T + 2.5;
      const col = bad ? C.accent : found ? C.alt2 : isP ? C.fg2 : C.fg;
      text(String(b[id]), x, y + 14, { font: F.mono, size: 40, weight: 700, color: col, alpha: a, align: 'center' });
      if (bad) rule(x - 14, y - 2, x + 14, y - 2, C.accent, a, 2);
      text(id === 'd4' ? 'd₄' : id.replace(/(\d)/, (m) => '₁₂₃₄'[+m - 1]), x, y + 40, { font: F.math, style: 'italic', size: 16, color: C.muted, alpha: a, align: 'center' });
    });
    // the codeword on the left
    const word = ['d1', 'd2', 'd3', 'd4', 'p1', 'p2', 'p3'].map((id) => String(b[id])).join('');
    const aw = sstep(5.9, 6.5, lt);
    label('Codeword · 码字', M, 470, aw, C.muted, 15);
    bits(word, M + 18, 530, 40, 99, aw, flipped ? [2] : [], 1.2);
    label('data', M + 18, 570, aw, C.fg2, 13);
    label('parity', M + 18 + 4 * 48, 570, aw, C.fg2, 13);
    text('Hamming (7, 4)', M, 640, { font: F.math, size: 34, color: C.fg, alpha: sstep(0.6, 1.2, lt) });
    text('3 个校验位，定位 7 个位置中的任一错误', M, 676, { size: 20, color: C.muted, alpha: sstep(1.2, 1.8, lt) });
    if (flipped) text('噪声翻转了 d₃', M, 740, { size: 24, weight: 500, color: C.accent, alpha: sstep(FLIP_T, FLIP_T + 0.4, lt) });
    if (lt > 10.8 && lt < 15.4) text('B 奇，C 奇，A 偶 ⇒ 只能是 d₃', M, 740, { font: F.math, size: 24, color: C.fg, alpha: sstep(10.8, 11.4, lt) });
    if (lt >= FIX_T) text('已修复', M + 470, 740, { size: 24, weight: 500, color: C.alt2, alpha: sstep(FIX_T, FIX_T + 0.4, lt) });
    // where it lives
    const aL = win(lt, 15.4, 18, 0.5, 0.01);
    if (aL > 0) {
      const items: [string, string, string][] = [['1950', '汉明码', 'Hamming'], ['1960', '里德–所罗门码', 'CD · 二维码'], ['1977', '旅行者号', '深空里的每个比特都很贵'], ['2019', '5G 极化码', 'Polar codes']];
      items.forEach(([yr, t, n], i) => row(yr, t, n, M + i * 400, 830, aL * sstep(15.8 + i * 0.5, 16.2 + i * 0.5, lt), 76));
    }
  },
});
