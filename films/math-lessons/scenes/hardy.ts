// Chapter 1: Hardy refused to defend mathematics by its use (F-H11) and claimed only that he may be judged to have
// created something worth creating (F-H14); the first of the four refrains follows his defence, not the timeline.
import { text, background, M, W, C, F, scene, sstep } from '../../../engine';
import { bell, quote, verse, voiceLine } from '../lib';

scene({
  name: 'hardy', kind: 'page', dur: 18.0, chapter: 1, ch: ['无用', ''],
  // lines shown verbatim as display text on this page have no caption (the display text is their caption)
  subs: [
    [0.6, 2.1, '可 Hardy 说：不。', '5'],
    [2.1, 7.07, '不能以用途，为一位真正的数学家的一生辩护。', ''],
    [7.62, 10.34, '他只说：人们也许会认为，', '6'],
    [10.34, 13.31, '我创造了值得创造的东西。', ''],
  ],
  sfx: [[0.6, 'chime', { midi: bell(5) }], [0.8, 'stamp', { gain: 0.5 }], [7.62, 'chime', { midi: bell(6) }], [13.86, 'low', { midi: 38 }]],
  draw(lt) {
    background();
    const a = sstep(0.6, 1.2, lt);
    text('1940', M, 330, { font: F.mono, size: 26, color: C.accent, alpha: a });
    text('Hardy', M + 110, 330, { font: F.latin, size: 34, color: C.fg2, alpha: a });
    text('不。', M + 340, 330, { size: 34, color: C.accent, alpha: a });
    verse('5', M - 40, 330, a, 32);
    quote(['人们也许会认为，', '我创造了值得创造的东西。'], [], 'G. H. Hardy · A Mathematician’s Apology · 1940 · §29（自译）', M, 470, sstep(7.7, 8.6, lt), '6', 46);
    voiceLine('看不见用途，不等于没有价值。', W / 2, 790, sstep(13.86, 14.6, lt), 'film', { size: 48, align: 'center', mk: '◇' });
  },
});
