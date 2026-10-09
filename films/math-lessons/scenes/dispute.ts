// Chapter 3: three voices on the Navier–Stokes announcement, side by side (F-N11, F-N12, and the counter-argument
// that the statement is a contract), then the hinge sentence and the third refrain.
import { text, label, background, M, W, C, scene, sstep } from '../../../engine';
import { bell, verse, voiceLine } from '../lib';

const COLS = 3, GAP = 50;
const CW = (W - 2 * M - (COLS - 1) * GAP) / COLS;
const VOICES: { who: 'film' | 'counter'; mk: string; head: string; lines: string[]; src: string; t: number }[] = [
  { who: 'film', mk: '13', head: 'Clay 研究所', lines: ['问题看来已经解决；', '评审，刻意不急。'], src: '2026-09-11', t: 0.6 },
  { who: 'film', mk: '14', head: '数学家 Luis Silvestre', lines: ['Clay 的题目解决了，', '但纳维–斯托克斯方程的', '主要问题没有。'], src: '《科学美国人》2026-09-21', t: 0.6 },
  { who: 'counter', mk: '◇', head: '反方', lines: ['题面就是契约。', '按契约解决了，', '就是解决了。'], src: '', t: 7.6 },
];

scene({
  name: 'dispute', kind: 'page', dur: 22.5, chapter: 3, ch: ['题面', ''],
  // lines shown verbatim as display text on this page have no caption (the display text is their caption)
  subs: [
    [0.6, 4.32, '数学家 Silvestre 说：Clay 的题目解决了，', '14'],
    [4.32, 7.04, '但方程的主要问题没有。', ''],
    [7.59, 10.06, '反方说：题面就是契约。', '◇'],
    [10.06, 13.03, '按契约解决了，就是解决了。', ''],
  ],
  sfx: [[0.6, 'chime', { midi: bell(14) }], [7.59, 'low', { midi: 33, dur: 1.8 }], [17.85, 'low', { midi: 38 }]],
  draw(lt) {
    background();
    const dim = 1 - 0.7 * sstep(13.4, 14.2, lt);
    VOICES.forEach((v, i) => {
      const x = M + 40 + i * (CW + GAP), a = sstep(v.t, v.t + 0.8, lt) * dim;
      label(v.head, x, 300, a, v.who === 'counter' ? C.muted : C.fg2, 20);
      verse(v.mk, x - 34, 300, a, 30);
      v.lines.forEach((l, j) => voiceLine(l, x, 372 + j * 58, a, v.who, { size: 38 }));
      if (v.src) text(v.src, x, 372 + v.lines.length * 58 + 10, { size: 18, color: C.muted, alpha: a });
    });
    voiceLine('这是一场关于什么值得问的分歧。', W / 2, 700, sstep(13.6, 14.4, lt), 'film', { size: 50, align: 'center', mk: '◇' });
    voiceLine('回答了题目，不等于回答了问题。', W / 2, 800, sstep(17.85, 18.6, lt), 'film', { size: 44, align: 'center', mk: '◇' });
  },
});
