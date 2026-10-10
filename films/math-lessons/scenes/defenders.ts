// Chapter 1: three defenders of mathematics. Each spoke of later use and also of knowledge for its own sake
// (F-H03, F-H05; F-H20, F-H08; F-H09, F-H21): the film no longer sets them up as the "use will come" side against Hardy
// (independent audit, revisions.md R2). The qualifiers "常常" and "最终造福人类的" are kept.
import { text, background, M, C, F, scene, sstep } from '../../../engine';
import { bell, verse } from '../lib';

const ROWS: [string, string, string, string, number][] = [
  ['1699', 'Fontenelle', '有些看似无用的研究，日后会显出用处', '心智有它的需要：它想要知道', 0.6],
  ['1907', 'Russell', '数学家间接地，常常更造福人类', '用途只能是安慰，不能是向导', 1.4],
  ['1939', 'Flexner', '最终造福人类的伟大发现，多出自好奇心', '绝不以用途为研究院辩护', 2.2],
];

scene({
  name: 'defenders', kind: 'page', dur: 7.5, chapter: 1, ch: ['无用', ''],
  subs: [
    [0.5, 2.45, '为数学辩护的人，', '4'],
    [2.45, 6.15, '谈过日后的用途，也谈过求知本身。', ''],
  ],
  sfx: [[0.5, 'chime', { midi: bell(4) }], [0.6, 'ink'], [1.4, 'ink'], [2.2, 'ink']],
  draw(lt) {
    background();
    ROWS.forEach(([y, who, use, own, t], i) => {
      const a = sstep(t, t + 0.6, lt), b = sstep(t + 2.0, t + 2.6, lt), yy = 340 + i * 120;
      text(y, M, yy, { font: F.mono, size: 26, color: C.muted, alpha: a });
      text(who, M + 110, yy, { font: F.latin, size: 34, color: C.fg2, alpha: a });
      text(use, M + 340, yy, { size: 30, color: C.fg, alpha: a, ls: 1 });
      text(own, M + 340, yy + 46, { size: 26, color: C.fg2, alpha: b, ls: 1 });
    });
    verse('4', M - 40, 340, sstep(0.6, 1.2, lt), 32);
  },
});
