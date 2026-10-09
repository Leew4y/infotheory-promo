// Chapter 1: four defenders of mathematics. Three said that the use would come (F-H03, F-H20, F-H09); the fourth,
// Hardy, refused to defend mathematics by its use (F-H11) and claimed only to have created something worth creating (F-H14).
import { text, background, M, C, F, scene, sstep } from '../../../engine';
import { bell, quote, verse } from '../lib';

const ROWS: [string, string, string, number][] = [
  ['1699', 'Fontenelle', '看似无用的，日后会显出用处', 0.8],
  ['1907', 'Russell', '数学家间接地更造福人类', 1.8],
  ['1939', 'Flexner', '伟大的发现，多出自好奇心', 2.8],
  ['1940', 'Hardy', '不。', 6.1],
];

scene({
  name: 'defenders', kind: 'page', dur: 21.0, chapter: 1, ch: ['无用', ''],
  subs: [
    [0.6, 3.82, '为数学辩护的人，一再这样说：', '4'],
    [3.82, 5.54, '用途，以后会来。', ''],
    [6.09, 8.56, '1940 年，Hardy 说：不。', '5'],
    [8.56, 13.53, '不能以用途，为一位真正的数学家的一生辩护。', ''],
    [14.08, 16.8, '他只说：人们也许会认为，', '6'],
    [16.8, 19.77, '我创造了值得创造的东西。', ''],
  ],
  sfx: [[0.6, 'chime', { midi: bell(4) }], [0.8, 'ink'], [1.8, 'ink'], [2.8, 'ink'], [6.1, 'chime', { midi: bell(5) }], [6.3, 'stamp'], [14.1, 'chime', { midi: bell(6) }]],
  draw(lt) {
    background();
    const dim = 1 - 0.65 * sstep(13.6, 14.6, lt);
    ROWS.forEach(([y, who, said, t], i) => {
      const a = sstep(t, t + 0.6, lt) * dim, yy = 330 + i * 78, hardy = i === 3;
      text(y, M, yy, { font: F.mono, size: 26, color: hardy ? C.accent : C.muted, alpha: a });
      text(who, M + 110, yy, { font: F.latin, size: 32, color: C.fg2, alpha: a });
      text(said, M + 330, yy, { size: 32, color: hardy ? C.accent : C.fg, alpha: a, ls: 2 });
    });
    verse('4', M - 40, 330, sstep(0.8, 1.4, lt) * dim, 32);
    verse('5', M - 40, 330 + 3 * 78, sstep(6.1, 6.7, lt) * dim, 32);
    quote(['我创造了值得创造的东西。'], [], 'G. H. Hardy · A Mathematician’s Apology · 1940 · §29', M, 700, sstep(14.1, 15.0, lt), '6', 52);
  },
});
