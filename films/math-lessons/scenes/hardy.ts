// Chapter 2: Hardy's general claim, as he wrote it: a real mathematician's life cannot be justified by its use (F-H11,
// §21; the PR #9 review: v4's "可哈代没有拿用途为自己辩护" had narrowed it to his own conduct and carried no source
// number); he claimed only that he may be judged to have created something worth creating (F-H14, with its
// "人们也许会认为"). The first refrain follows his defence, not the timeline. Both quotations and the refrain are shown
// verbatim (no caption).
import { background, M, W, narratedScene, sstep, vo, voParts } from '../../../engine';
import { bell, quote, voiceLine } from '../lib';

narratedScene({
  name: 'hardy', kind: 'page', chapter: 2, ch: ['无用', ''], split: 16, lead: 0.6, gap: 0.8, tail: 1.8, shown: ['defence', 'n08', 'n09'],
  sfx: (at) => [[at('defence'), 'chime', { midi: bell(7) }], [at('n08'), 'chime', { midi: bell(9) }], [at('n09'), 'low', { midi: 38 }]],
  draw(lt) {
    background();
    const [, td] = voParts('defence', ['哈代也写道：', '不能以用途，为一位真正的数学家的一生辩护。']), tq = vo('n08'), tr = vo('n09');
    quote(['不能以用途，', '为一位真正的数学家的一生辩护。'], [], 'G. H. Hardy · A Mathematician’s Apology · 1940 · §21（自译）', M, 300,
      sstep(td - 0.1, td + 0.8, lt) * (1 - 0.55 * sstep(tq - 0.3, tq + 0.5, lt)), '7', 44);
    quote(['人们也许会认为，', '我创造了值得创造的东西。'], [], 'G. H. Hardy · A Mathematician’s Apology · 1940 · §29（自译）', M, 560, sstep(tq, tq + 0.9, lt), '9', 52);
    voiceLine('看不见用途，不等于没有价值。', W / 2, 850, sstep(tr, tr + 0.75, lt), 'film', { size: 54, align: 'center', mk: '◇' });
  },
});
