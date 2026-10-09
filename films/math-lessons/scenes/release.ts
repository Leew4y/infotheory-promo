// Chapter 2: the October release (F-N16) and what OpenAI says about the problems (F-N17): the model was posed about
// 4,000 problems, and the results were collected into a catalogue by significance. The source does not say who posed
// the problems; the film no longer claims "posed and chosen by people" (independent audit, revisions.md R1).
// 722 squares, one per manuscript (a 38 x 19 grid); behind them a fainter field of about 4,000 dots.
import { label, background, M, C, scene, sstep, clamp } from '../../../engine';
import { bell, count, dots, grid, tiles, verse } from '../lib';

scene({
  name: 'release', kind: 'page', dur: 17.5, chapter: 2, ch: ['二〇二六', ''],
  subs: [
    [0.5, 2.7, '2026 年 10 月，', '8'],
    [2.7, 6.9, 'OpenAI 公布了 722 篇模型生成的手稿。', ''],
    [7.35, 12.8, '据它自述：评估中向模型提出了约 4000 个问题，', '9'],
    [12.8, 16.25, '再按成果的重要性整理成目录。', ''],
  ],
  sfx: [[0.5, 'chime', { midi: bell(8) }], [7.35, 'chime', { midi: bell(9) }]],
  draw(lt) {
    background();
    const GRID = grid();
    dots(4000, 80, GRID.x - 40, GRID.y - 50, 9, 0.5 * sstep(7.4, 9.0, lt));
    tiles(GRID.n, GRID.cols, GRID.x, GRID.y, GRID.cell, clamp((lt - 0.9) / 5.5), 1);
    const a = sstep(0.7, 1.5, lt);
    count('722', '篇手稿', M, 480, lt, 0.9, 5.5, a);
    verse('8', M - 34, 480, a, 48);
    label('OpenAI · 372 个系列', M, 540, a, C.muted, 18);
    label('github.com/openai/math · 2026-10-06', M, 572, a, C.muted, 18);
    const b = sstep(8.2, 9.0, lt);
    verse('9', M - 34, 680, b, 40);
    label('评估中向模型提出了约 4000 个问题', M, 680, b, C.fg2, 20);
    label('再按成果的重要性整理成目录（据 OpenAI 自述）', M, 714, sstep(12.8, 13.6, lt), C.fg2, 20);
  },
});
