// Chapter 4: the day after the release, three manuscripts withdrawn for a sign error (F-N18); 722 becomes 719
// (F-N16), the only number in the film that goes down. One error does not make the rest wrong; it shows that checking
// was not finished at release.
import { label, background, M, C, narratedScene, sstep, clamp, voParts } from '../../../engine';
import { bell, count, grid, tiles, verse } from '../lib';

// three adjacent squares stand for the three withdrawn manuscripts; the positions are a picture, not their places in the repository
const GONE = [403, 404, 405];
const N24 = ['公布后的第二天，一个符号错误，', '让三篇手稿被撤回。', '722，变成 719。'];

narratedScene({
  name: 'withdrawal', kind: 'page', chapter: 4, ch: ['检验', ''], split: 16, lead: 0.6, gap: 0.7, tail: 1.6,
  sfx: (at) => [[at('n24'), 'chime', { midi: bell(13) }], [at('n25'), 'low', { midi: 38 }]],
  draw(lt) {
    background();
    const [t0, t1, t2] = voParts('n24', N24), g = grid();
    tiles(g.n, g.cols, g.x, g.y, g.cell, 1, sstep(0.2, 1.0, lt), GONE, clamp((lt - t1) / 2.0));
    const a = sstep(t0 - 0.2, t0 + 0.6, lt);
    count('719', '篇手稿', M, 480, lt, t2, 1.4, a, 120, '722');
    verse('13', M - 34, 480, a, 48);
    label('符号错误 · 撤回 3 篇 · 修订 14 篇', M, 540, a, C.muted, 18);
    label('2026-10-07 · openai/math history.md', M, 572, a, C.muted, 18);
  },
});
