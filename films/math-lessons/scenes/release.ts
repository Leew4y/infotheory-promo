// Chapter 2: the October release (F-N16) and how its problems were chosen (F-N17, F-N09). 722 squares, one per
// manuscript (a 38 x 19 grid); behind them a fainter field of about 4,000 dots, the problems posed to the model.
import { label, background, M, C, scene, sstep, clamp } from '../../../engine';
import { bell, count, dots, grid, tiles, verse } from '../lib';

scene({
  name: 'release', kind: 'page', dur: 14.5, chapter: 2, ch: ['二〇二六', ''],
  subs: [
    [0.6, 2.82, '2026 年 10 月，', '8'],
    [2.82, 7.04, 'OpenAI 公布了 722 篇模型生成的手稿。', ''],
    [7.59, 10.81, '据它自述：约 4000 个问题，', '9'],
    [10.81, 13.03, '由人提出，由人挑选。', ''],
  ],
  sfx: [[0.6, 'chime', { midi: bell(8) }], [7.59, 'chime', { midi: bell(9) }]],
  draw(lt) {
    background();
    const GRID = grid();
    dots(4000, 80, GRID.x - 40, GRID.y - 50, 9, 0.5 * sstep(7.6, 9.2, lt));
    tiles(GRID.n, GRID.cols, GRID.x, GRID.y, GRID.cell, clamp((lt - 1.0) / 5.5), 1);
    const a = sstep(0.8, 1.6, lt);
    count('722', '篇手稿', M, 480, lt, 1.0, 5.5, a);
    verse('8', M - 34, 480, a, 48);
    label('OpenAI · 372 个系列', M, 540, a, C.muted, 18);
    label('github.com/openai/math · 2026-10-06', M, 572, a, C.muted, 18);
    const b = sstep(8.4, 9.2, lt);
    verse('9', M - 34, 680, b, 40);
    label('约 4000 个问题', M, 680, b, C.fg2, 20);
    label('由人提出，由人挑选（据 OpenAI 自述）', M, 714, b, C.fg2, 20);
  },
});
