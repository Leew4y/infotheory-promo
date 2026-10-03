// 6. Chapter 04, noise: a line of bits with a few struck through; the binary symmetric channel; the question.
import { paper, text, label, ink, rule, arrow, bits, measure, C, F_EN, F_MATH } from '../../../engine/draw';
import { M, COL, statement } from '../../../engine/page';
import { scene } from '../../../engine/scene';
import { clamp, eout, sstep, hash1, win } from '../../../engine/util';

const N = 44;
const SENT = 'INFORMATION';
const GARBLED = 'INF0RMAT1QN';
const FLIP = Array.from({ length: N }, (_, i) => hash1(i + 0.5) < 0.1);
const SRC = Array.from({ length: N }, (_, i) => (hash1(i * 2.3) < 0.5 ? '1' : '0')).join('');

scene({
  name: 'noise', kind: 'page', start: 29, len: 5, mb: 3, chapter: 4, ch: ['噪声', 'Noise'],
  subs: [
    [0.8, 4.4, '比特穿过信道，噪声把其中一些翻转。', 'Bits cross the channel; noise flips some of them.'],
    [5, 8.4, '十个错一个，收到的消息就面目全非。', 'One error in ten, and the message is mangled.'],
    [9, 12.2, '香农 1948 年的问题：在噪声里，还能可靠通信吗？', 'Shannon’s question in 1948: through noise, can we still communicate reliably?'],
    [12.8, 14.6, '可以。只要肯多花几个比特。', 'Yes. If you are willing to spend a few more bits.'],
  ],
  sfx: [[0.1, 'page'], ...FLIP.map((f, i) => (f ? [0.8 + i * 0.12 + 0.3, 'tick'] : null)).filter((x): x is [number, string] => !!x), [7.2, 'tone', { midi: 59 }], [8.6, 'ink'], [9.6, 'ink'], [12.6, 'tone', { midi: 62 }], [13.2, 'chime', { midi: 69 }]],
  draw(lt) {
    paper();
    statement('噪声，翻转其中一些。', 'Noise flips some of them.', lt);
    // the line of bits
    const lit = (lt - 0.8) * 8.3;
    const shown = [...SRC].map((b, i) => (FLIP[i] && lit - i > 2.5 ? (b === '1' ? '0' : '1') : b)).join('');
    const hi = FLIP.map((f, i) => (f && lit - i > 2.5 ? i : -1)).filter((i) => i >= 0);
    bits(shown, M + 12, 440, 30, lit, 1, hi, 1.27);
    label('Sent · 发送', M, 396, sstep(0.6, 1.2, lt), C.grey, 15);
    label(`p = 0.1 · one in ten flips`, 1770, 396, sstep(4.4, 5, lt), C.rust, 15, 'right');
    // the word
    const kw = sstep(7.0, 7.6, lt);
    text(SENT, M, 560, { font: F_EN, size: 46, color: C.ink, alpha: kw, ls: 8 });
    const ww = measure(SENT, 46, F_EN, 400, 8);
    arrow(M + ww + 30, 545, M + ww + 100, 545, C.grey, kw, 1.4);
    const gx = M + ww + 130;
    [...GARBLED].forEach((ch, i) => {
      const bad = ch !== SENT[i];
      const x = gx + measure(GARBLED.slice(0, i), 46, F_EN, 400, 8);
      text(ch, x, 560, { font: F_EN, size: 46, color: bad ? C.rust : C.ink, alpha: kw * sstep(7.4 + i * 0.12, 7.7 + i * 0.12, lt), ls: 8 });
    });
    // the channel diagram
    const aB = win(lt, 8.4, 15, 0.6, 0.01);
    if (aB > 0) {
      const lx = COL + 120, rx = 1700, y0 = 640, y1 = 800;
      const k = eout(clamp((lt - 8.6) / 0.8)), k2 = eout(clamp((lt - 9.6) / 0.8));
      label('Binary symmetric channel · 二元对称信道', COL + 60, 590, aB, C.grey, 15);
      [['0', y0], ['1', y1]].forEach(([b, y]) => {
        text(String(b), lx, Number(y) + 14, { font: F_MATH, size: 40, color: C.ink, alpha: aB, align: 'center' });
        text(String(b), rx, Number(y) + 14, { font: F_MATH, size: 40, color: C.ink, alpha: aB, align: 'center' });
      });
      ink([[lx + 40, y0], [rx - 40, y0]], k, C.ink2, 1.4, aB);
      ink([[lx + 40, y1], [rx - 40, y1]], k, C.ink2, 1.4, aB);
      ink([[lx + 40, y0 + 14], [rx - 40, y1 - 14]], k2, C.rust, 1.4, aB);
      ink([[lx + 40, y1 - 14], [rx - 40, y0 + 14]], k2, C.rust, 1.4, aB);
      text('1 − p', (lx + rx) / 2, y0 - 16, { font: F_MATH, style: 'italic', size: 22, color: C.ink2, alpha: aB * k, align: 'center' });
      text('1 − p', (lx + rx) / 2, y1 + 40, { font: F_MATH, style: 'italic', size: 22, color: C.ink2, alpha: aB * k, align: 'center' });
      text('p', (lx + rx) / 2 + 60, (y0 + y1) / 2 + 8, { font: F_MATH, style: 'italic', size: 24, color: C.rust, alpha: aB * k2 });
    }
    // the question
    const kq = sstep(12.2, 13, lt);
    text('在噪声里，还能可靠通信吗？', M, 760, { size: 44, weight: 500, color: C.ink, alpha: kq, ls: 3 });
    text('可以。', M, 830, { size: 44, weight: 500, color: C.rust, alpha: sstep(13.0, 13.6, lt), ls: 3 });
    void rule;
  },
});
