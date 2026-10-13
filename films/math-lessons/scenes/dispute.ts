// Chapter 1: two mathematicians on the announcement, side by side, named on the page (the voice says "一位数学家" /
// "另一位数学家"; audit: naming on screen satisfies F-N12, F-N27): Silvestre (F-N12) and Córdoba (F-N27), the strongest
// pro-forcing voice in the same report. Each column shows the speaker and the quotation verbatim (F-N12, F-N27; shown,
// so no caption: the voice adds only "一位数学家说"). Then
// the film's own claim, restored after the v4 audit (R23, from R6): if the proof holds, the forced case has value of
// its own, but it is not the unforced case; then the line where the argument closes (n22, argument-map H1, F-V03:
// a dispute about what is worth asking; restored after the PR #9 review), then the refrain (first of four).
import { text, label, background, M, C, W, narratedScene, sstep, vo, voParts } from '../../../engine';
import { bell, verse, voiceLine } from '../lib';

const COLS = [
  { mk: '4', who: '芝加哥大学数学家 Luis Silvestre', gist: ['Clay 的题目解决了，', '但纳维–斯托克斯方程的', '主要问题没有。'], src: '《科学美国人》2026-09-21', id: 'math1' },
  { mk: '5', who: '数学家 Diego Córdoba', gist: ['我们知道的流体，', '都受某种外力；', '有外力，完全说得通。'], src: '同一报道 · 该构造沿用了他的方法', id: 'math2' },
];

narratedScene({
  name: 'dispute', kind: 'page', chapter: 1, ch: ['题目', ''], split: 16, lead: 0.6, gap: 0.7, tail: 1.8, shown: ['math1', 'math2', 'n21', 'n22', 'n23'],
  sfx: (at) => [[at('math1'), 'chime', { midi: bell(4) }], [at('math2'), 'chime', { midi: bell(5) }], [at('n22'), 'swell', { dur: 2 }], [at('n23'), 'low', { midi: 38 }]],
  draw(lt) {
    background();
    const [tv, tv2] = voParts('n21', ['若证明成立，有外力的情形自有价值；', '只是它不等于无外力的情形。']), tq = vo('n22'), tr = vo('n23');
    const dim = 1 - 0.7 * sstep(tv - 0.3, tv + 0.5, lt);
    COLS.forEach((c, i) => {
      const x = M + 40 + i * (W - 2 * M) / 2, t = vo(c.id), a = sstep(t, t + 0.8, lt) * dim;
      label(c.who, x, 300, a, C.fg2, 22);
      verse(c.mk, x - 34, 300, a, 30);
      c.gist.forEach((g, j) => voiceLine(g, x, 372 + j * 56, a, 'film', { size: 38 }));
      text(c.src, x, 372 + c.gist.length * 56 + 6, { size: 18, color: C.muted, alpha: a });
    });
    const back = 1 - 0.6 * sstep(tq - 0.2, tq + 0.4, lt);
    voiceLine('若证明成立，有外力的情形自有价值；', W / 2, 610, sstep(tv, tv + 0.7, lt) * back, 'film', { size: 38, align: 'center', mk: '◇' });
    voiceLine('只是它不等于无外力的情形。', W / 2, 666, sstep(tv2, tv2 + 0.7, lt) * back, 'film', { size: 38, align: 'center' });
    voiceLine('这是一场关于什么值得问的分歧。', W / 2, 760, sstep(tq, tq + 0.75, lt) * (1 - 0.5 * sstep(tr - 0.2, tr + 0.4, lt)), 'film', { size: 46, align: 'center', mk: '◇' });
    voiceLine('回答了题目，不等于回答了问题。', W / 2, 850, sstep(tr, tr + 0.75, lt), 'film', { size: 54, align: 'center', mk: '◇' });
  },
});
