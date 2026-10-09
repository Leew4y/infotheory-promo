// Chapter 1: three defenders of mathematics who said that the use would come (F-H03, F-H20, F-H09), as a litany.
import { text, background, M, C, F, scene, sstep } from '../../../engine';
import { bell, verse } from '../lib';

const ROWS: [string, string, string, number][] = [
  ['1699', 'Fontenelle', '看似无用的，日后会显出用处', 0.8],
  ['1907', 'Russell', '数学家间接地更造福人类', 1.8],
  ['1939', 'Flexner', '伟大的发现，多出自好奇心', 2.8],
];

scene({
  name: 'defenders', kind: 'page', dur: 6.5, chapter: 1, ch: ['无用', ''],
  subs: [
    [0.6, 3.82, '为数学辩护的人，一再这样说：', '4'],
    [3.82, 5.54, '用途，以后会来。', ''],
  ],
  sfx: [[0.6, 'chime', { midi: bell(4) }], [0.8, 'ink'], [1.8, 'ink'], [2.8, 'ink']],
  draw(lt) {
    background();
    ROWS.forEach(([y, who, said, t], i) => {
      const a = sstep(t, t + 0.6, lt), yy = 400 + i * 90;
      text(y, M, yy, { font: F.mono, size: 26, color: C.muted, alpha: a });
      text(who, M + 110, yy, { font: F.latin, size: 34, color: C.fg2, alpha: a });
      text(said, M + 340, yy, { size: 34, color: C.fg, alpha: a, ls: 1 });
    });
    verse('4', M - 40, 400, sstep(0.8, 1.4, lt), 32);
  },
});
