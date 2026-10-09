// Chapter 3, the hinge: the four statements of the Clay problem (F-M04, F-H18). On the existence side the force is
// identically zero; on the breakdown side a smooth force may be chosen. From 10.8 s the breakdown column is marked:
// OpenAI announced it had established statement C and also D (F-N07, S7b). The film does not judge the proof.
import { text, label, rule, background, M, C, F, W, scene, sstep, clamp, eout } from '../../../engine';
import { bell, verse, voiceLine } from '../lib';

const X0 = M, X1 = W - M, Y0 = 300, ROW = 190, HEAD = 70, LEFT = 260;
const COLW = (X1 - X0 - LEFT) / 2;
const CELLS: { k: string; col: number; row: number }[] = [
  { k: '(A)', col: 0, row: 0 }, { k: '(B)', col: 0, row: 1 }, { k: '(C)', col: 1, row: 0 }, { k: '(D)', col: 1, row: 1 },
];

scene({
  name: 'statement', kind: 'page', dur: 21.0, chapter: 3, ch: ['题面', ''],
  subs: [
    [0.6, 2.57, 'Clay 的题面写着：', '12'],
    [2.57, 6.04, '证明解存在且光滑，外力须为零；', ''],
    [6.04, 10.26, '证明解会破裂，可以选一个光滑的外力。', ''],
    [10.81, 15.28, '9 月，OpenAI 宣布，它的内部系统证明了后者。', '13'],
    [15.28, 18.25, 'Clay 说：问题看来已经解决；', ''],
    [18.25, 19.97, '评审，刻意不急。', ''],
  ],
  sfx: [[0.6, 'chime', { midi: bell(12) }], [10.8, 'chime', { midi: bell(13) }], [10.9, 'tone', { midi: 69 }]],
  draw(lt) {
    background();
    const a = sstep(0.4, 1.4, lt);
    label('Clay 千禧年难题 · 纳维–斯托克斯方程 · 题面（Fefferman，2000）', X0, Y0 - 40, a, C.muted, 18);
    verse('12', X0 - 40, Y0 - 40, a, 36);
    // column heads
    const heads = ['证明解存在且光滑', '证明解会破裂'];
    heads.forEach((h, i) => text(h, X0 + LEFT + i * COLW + 24, Y0 + 44, { size: 30, color: C.fg, alpha: sstep(0.8 + i * 2.6, 1.6 + i * 2.6, lt), ls: 3 }));
    // row heads (the domain)
    ['R³', 'R³ / Z³'].forEach((d, j) => text(d, X0, Y0 + HEAD + j * ROW + 110, { font: F.math, size: 40, color: C.fg2, alpha: a }));
    rule(X0, Y0 + HEAD, X1, Y0 + HEAD, C.rule, a, 1.5);
    rule(X0 + LEFT, Y0, X0 + LEFT, Y0 + HEAD + 2 * ROW, C.rule, a, 1.5);
    rule(X0 + LEFT + COLW, Y0, X0 + LEFT + COLW, Y0 + HEAD + 2 * ROW, C.rule, a, 1.5);
    rule(X0, Y0 + HEAD + ROW, X1, Y0 + HEAD + ROW, C.rule, a, 1);
    for (const c of CELLS) {
      const x = X0 + LEFT + c.col * COLW + 24, y = Y0 + HEAD + c.row * ROW;
      const ca = sstep(1.4 + c.col * 3.2 + c.row * 0.4, 2.2 + c.col * 3.2 + c.row * 0.4, lt);
      text(c.k, x, y + 62, { font: F.latin, size: 34, color: C.muted, alpha: ca });
      if (c.col === 0) text('f ≡ 0', x, y + 140, { font: F.math, style: 'italic', size: 52, color: C.accent, alpha: ca });
      else {
        text('光滑的', x, y + 140, { size: 40, color: C.fg, alpha: ca });
        text('f', x + 132, y + 140, { font: F.math, style: 'italic', size: 52, color: C.accent, alpha: ca });
      }
    }
    // (C): the statement OpenAI announced it had proved
    const k = eout(clamp((lt - 10.8) / 0.8));
    if (k > 0) {
      const x = X0 + LEFT + COLW, y = Y0 + HEAD;
      rule(x + 6, y + 6, x + 6 + (COLW - 12) * k, y + 6, C.accent, 1, 3);
      rule(x + 6, y + 2 * ROW - 6, x + 6 + (COLW - 12) * k, y + 2 * ROW - 6, C.accent, 1, 3);
      label('OpenAI 宣布：成立 (C)，也成立 (D)', x + COLW - 24, y + 62, sstep(11.2, 12.0, lt), C.accent, 18, 'right');
    }
    voiceLine('本片不判断这个证明的对错。', X0 + 40, 820, sstep(12.5, 13.5, lt), 'film', { size: 26, mk: '◇' });
  },
});
