// Chapter 1: two mathematicians on the announcement, side by side, named on the page (the voice says "一位数学家" /
// "另一位数学家"; audit: naming on screen satisfies F-N12, F-N27): Silvestre (F-N12) and Córdoba (F-N27), the strongest
// pro-forcing voice in the same report. Each column shows the speaker and the gist; the captions carry the words. Then
// the film's own claim, restored after the v4 audit (R23, from R6): if the proof holds, the forced case has value of
// its own, but it is not the unforced case; then the refrain (first of four).
import { text, label, background, M, C, W, narratedScene, sstep, vo, voParts } from '../../../engine';
import { bell, verse, voiceLine } from '../lib';

const COLS = [
  { mk: '4', who: '芝加哥大学数学家 Luis Silvestre', gist: ['Clay 的题目解决了，', '主要问题没有。'], src: '《科学美国人》2026-09-21', id: 'math1' },
  { mk: '5', who: '数学家 Diego Córdoba', gist: ['流体都受外力，', '有外力，说得通。'], src: '同一报道 · 该构造沿用了他的方法', id: 'math2' },
];

narratedScene({
  name: 'dispute', kind: 'page', chapter: 1, ch: ['题目', ''], split: 16, lead: 0.6, gap: 0.7, tail: 1.8, shown: ['n21', 'n23'],
  sfx: (at) => [[at('math1'), 'chime', { midi: bell(4) }], [at('math2'), 'chime', { midi: bell(5) }], [at('n23'), 'low', { midi: 38 }]],
  draw(lt) {
    background();
    const [tv, tv2] = voParts('n21', ['若证明成立，有外力的情形自有价值；', '只是它不等于无外力的情形。']), tr = vo('n23');
    const dim = 1 - 0.7 * sstep(tv - 0.3, tv + 0.5, lt);
    COLS.forEach((c, i) => {
      const x = M + 40 + i * (W - 2 * M) / 2, t = vo(c.id), a = sstep(t, t + 0.8, lt) * dim;
      label(c.who, x, 300, a, C.fg2, 22);
      verse(c.mk, x - 34, 300, a, 30);
      c.gist.forEach((g, j) => voiceLine(g, x, 380 + j * 62, a, 'film', { size: 44 }));
      text(c.src, x, 380 + c.gist.length * 62 + 6, { size: 18, color: C.muted, alpha: a });
    });
    voiceLine('若证明成立，有外力的情形自有价值；', W / 2, 640, sstep(tv, tv + 0.7, lt) * (1 - 0.6 * sstep(tr - 0.2, tr + 0.4, lt)), 'film', { size: 40, align: 'center', mk: '◇' });
    voiceLine('只是它不等于无外力的情形。', W / 2, 702, sstep(tv2, tv2 + 0.7, lt) * (1 - 0.6 * sstep(tr - 0.2, tr + 0.4, lt)), 'film', { size: 40, align: 'center' });
    voiceLine('回答了题目，不等于回答了问题。', W / 2, 820, sstep(tr, tr + 0.75, lt), 'film', { size: 54, align: 'center', mk: '◇' });
  },
});
