// Chapter 1: one statement, three points, and a small diagram in the right column.
import { text, ink, circle, arrow, background, statement, row, M, COL, C, F, scene, clamp, sstep, W } from '../../../engine';

const POINTS: [string, string, string][] = [
  ['01', '第一点', 'What the first point says, in one line.'],
  ['02', '第二点', 'What the second point says, in one line.'],
  ['03', '第三点', 'What the third point says, in one line.'],
];

scene({
  name: 'idea', kind: 'page', dur: 9, mb: 3, chapter: 1, ch: ['想法', 'Idea'],
  subs: [
    [1.0, 4.4, '一句话说清楚这一页要讲什么。', 'One sentence that says what this page is about.'],
    [5.0, 8.4, '其余的细节交给图和要点。', 'The details are left to the diagram and the points.'],
  ],
  draw(lt) {
    background();
    statement('一页只讲一件事。', 'One page, one idea.', lt);
    POINTS.forEach(([k, t, n], i) => row(k, t, n, M, 440 + i * 110, sstep(1.2 + i * 0.4, 1.8 + i * 0.4, lt)));
    // the diagram: input -> process -> output, drawn in
    const y = 560, x0 = COL + 80, x1 = W - M - 80, xm = (x0 + x1) / 2;
    const k = clamp((lt - 2.4) / 2.0);
    circle(x0, y, 56, clamp(k * 3));
    circle(xm, y, 56, clamp(k * 3 - 1), C.accent);
    circle(x1, y, 56, clamp(k * 3 - 2));
    if (k > 0.3) arrow(x0 + 64, y, xm - 64, y, C.fg2, clamp((k - 0.3) / 0.2));
    if (k > 0.65) arrow(xm + 64, y, x1 - 64, y, C.fg2, clamp((k - 0.65) / 0.2));
    ['输入', '处理', '输出'].forEach((s, i) => text(s, [x0, xm, x1][i], y + 100, { size: 24, color: C.fg, alpha: sstep(3.2 + i * 0.3, 3.8 + i * 0.3, lt), align: 'center' }));
    ink([[x0, y + 140], [x1, y + 140]], clamp((lt - 4.4) / 1.2), C.rule, 1.5);
    text('input → process → output', xm, y + 180, { font: F.mono, size: 18, color: C.muted, alpha: sstep(5, 5.6, lt), align: 'center' });
  },
});
