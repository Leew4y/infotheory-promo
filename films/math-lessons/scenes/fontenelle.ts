// Chapter 1: the 1699 preface (F-H01, F-H02). The quote is set large in the left column; the right column stays empty.
import { background, M, scene, sstep } from '../../../engine';
import { quote } from '../lib';

scene({
  name: 'fontenelle', kind: 'page', dur: 13.0, chapter: 1, ch: ['无用', ''],
  subs: [
    [0.6, 5.32, '在科学院 1699 年卷的序言里，Fontenelle 写道：', '1'],
    [5.32, 9.54, '人们乐于把自己不懂的东西称为无用，', ''],
    [9.54, 11.26, '这是一种报复。', ''],
  ],
  sfx: [[0.6, 'chime', { midi: 62 }], [5.3, 'ink']],
  draw(lt) {
    background();
    quote(
      ['人们乐于把自己不懂的东西', '称为无用，这是一种报复。'],
      ["On traite volontiers d'inutile ce qu'on ne sçait point,", "c'est une espece de vengeance."],
      'Fontenelle · 科学院 1699 年卷序言 · 据 1742 年《全集》第五卷 p. 1',
      M, 380, sstep(5.2, 6.4, lt), '1', 64,
    );
  },
});
