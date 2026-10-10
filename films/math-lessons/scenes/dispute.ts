// Chapter 3: three voices on the Navier–Stokes announcement, side by side: Clay (F-N11), Silvestre (F-N12) and
// Córdoba (F-N27), the strongest pro-forcing voice in the same report, whose method the construction built on (S9);
// then the film's claim that the forced case has value of its own if the proof holds but is not the unforced case,
// the hinge sentence and the third refrain (revisions.md R6).
import { text, label, background, M, W, C, scene, sstep, win } from '../../../engine';
import { bell, verse, voiceLine } from '../lib';

const COLS = 3, GAP = 50;
const CW = (W - 2 * M - (COLS - 1) * GAP) / COLS;
const VOICES: { mk: string; head: string; lines: string[]; src: string; t: number }[] = [
  { mk: '13', head: 'Clay 研究所', lines: ['问题看来已经解决；', '评审，刻意不急。'], src: '2026-09-11', t: 0.5 },
  { mk: '14', head: '数学家 Luis Silvestre', lines: ['Clay 的题目解决了，', '但纳维–斯托克斯方程的', '主要问题没有。'], src: '《科学美国人》2026-09-21', t: 0.5 },
  { mk: '19', head: '数学家 Diego Córdoba', lines: ['我们知道的流体，', '都受某种外力；', '有外力，完全说得通。'], src: '同一报道 · 该构造沿用了他的方法', t: 7.35 },
];

scene({
  name: 'dispute', kind: 'page', dur: 30.5, chapter: 3, ch: ['题面', ''],
  // lines shown verbatim as display text on this page have no caption (the display text is their caption)
  subs: [
    [0.5, 4.2, '数学家 Silvestre 说：Clay 的题目解决了，', '14'],
    [4.2, 6.9, '但方程的主要问题没有。', ''],
    [7.35, 11.8, 'Córdoba 则说：我们知道的流体都受外力，', '19'],
    [11.8, 14.0, '有外力完全说得通。', ''],
  ],
  sfx: [[0.5, 'chime', { midi: bell(14) }], [7.35, 'chime', { midi: bell(19) }], [26.2, 'low', { midi: 38 }]],
  draw(lt) {
    background();
    const dim = 1 - 0.7 * sstep(14.3, 15.1, lt);
    VOICES.forEach((v, i) => {
      const x = M + 40 + i * (CW + GAP), a = sstep(v.t, v.t + 0.8, lt) * dim;
      label(v.head, x, 300, a, C.fg2, 20);
      verse(v.mk, x - 34, 300, a, 30);
      v.lines.forEach((l, j) => voiceLine(l, x, 372 + j * 58, a, 'film', { size: 38 }));
      text(v.src, x, 372 + v.lines.length * 58 + 10, { size: 18, color: C.muted, alpha: a });
    });
    const p = win(lt, 14.45, 21.9, 0.7, 0.5);
    voiceLine('若证明成立，有外力的情形自有价值；', W / 2, 680, p, 'film', { size: 42, align: 'center', mk: '◇' });
    voiceLine('只是它不等于无外力的情形。', W / 2, 750, win(lt, 18.4, 21.9, 0.7, 0.5), 'film', { size: 42, align: 'center' });
    voiceLine('这是一场关于什么值得问的分歧。', W / 2, 700, sstep(22.05, 22.8, lt), 'film', { size: 50, align: 'center', mk: '◇' });
    voiceLine('回答了题目，不等于回答了问题。', W / 2, 800, sstep(26.2, 26.95, lt), 'film', { size: 44, align: 'center', mk: '◇' });
  },
});
