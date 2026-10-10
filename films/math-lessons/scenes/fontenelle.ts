// Chapter 1: the 1699 preface (F-H01, F-H02). The quote is set large in the left column; the right column stays empty.
import { background, M, scene, sstep } from '../../../engine';
import { bell, quote } from '../lib';

scene({
  name: 'fontenelle', kind: 'page', dur: 12.5, chapter: 1, ch: ['无用', ''],
  subs: [
    [0.5, 5.2, '在科学院 1699 年卷的序言里，Fontenelle 写道：', '1'],
    [5.2, 9.4, '人们乐于把自己不懂的东西称为无用，', ''],
    [9.4, 11.1, '这是一种报复。', ''],
  ],
  sfx: [[0.5, 'chime', { midi: bell(1) }], [5.2, 'ink']],
  draw(lt) {
    background();
    quote(
      ['人们乐于把自己不懂的东西', '称为无用，这是一种报复。'],
      ["On traite volontiers d'inutile ce qu'on ne sçait point,", "c'est une espece de vengeance."],
      'Fontenelle · 科学院 1699 年卷序言 · 据 1742 年《全集》第五卷 p. 1',
      M, 380, sstep(5.1, 6.3, lt), '1', 64,
    );
  },
});
