// Chapter 4: the day after the release, three manuscripts withdrawn for a sign error (F-N18); 722 becomes 719
// (F-N16), the only number in the film that goes down. One error does not make the rest wrong; it shows that checking
// was not finished at release.
import { label, background, M, C, scene, sstep, clamp, placeNarration } from '../../../engine';
import { bell, count, grid, tiles, verse } from '../lib';

// three adjacent squares stand for the three withdrawn manuscripts; the positions are a picture, not their places in the repository
const GONE = [403, 404, 405];

// spoken lines (narration.json) where their text first appears on screen
placeNarration(scene({
  name: 'withdrawal', kind: 'page', dur: 16.5, chapter: 4, ch: ['检验', ''],
  subs: [
    [0.5, 3.95, '公布后的第二天，一个符号错误，', '15'],
    [3.95, 6.15, '让三篇手稿被撤回。', ''],
    [6.15, 8.35, '722，变成 719。', ''],
    [8.8, 11.5, '这不说明其余的都错了；', '◇'],
    [11.5, 15.45, '只说明，发布的时候，检验还没有完成。', ''],
  ],
  sfx: [[0.5, 'chime', { midi: bell(15) }], [4.1, 'stamp', { gain: 0.3 }], [4.4, 'stamp', { gain: 0.3 }], [4.7, 'stamp', { gain: 0.3 }]],
  draw(lt) {
    background();
    const g = grid();
    tiles(g.n, g.cols, g.x, g.y, g.cell, 1, sstep(0.2, 1.0, lt), GONE, clamp((lt - 4.0) / 2.4));
    const a = sstep(0.4, 1.2, lt);
    count('719', '篇手稿', M, 480, lt, 6.15, 1.4, a, 120, '722');
    verse('15', M - 34, 480, a, 48);
    label('符号错误 · 撤回 3 篇 · 修订 14 篇', M, 540, a, C.muted, 18);
    label('2026-10-07 · openai/math history.md', M, 572, a, C.muted, 18);
  },
}), { n24: 0.5, n25: 9.23 });
