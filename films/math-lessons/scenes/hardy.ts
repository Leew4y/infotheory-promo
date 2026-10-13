// Chapter 2: Hardy did not defend his life by its use (F-H11, "没有", not "从没": audit); he claimed only that he may
// be judged to have created something worth creating (F-H14, with its "人们也许会认为"). The first refrain follows his
// defence, not the timeline. The quote and the refrain are shown verbatim (no caption).
import { background, M, W, narratedScene, sstep, vo } from '../../../engine';
import { bell, quote, voiceLine } from '../lib';

narratedScene({
  name: 'hardy', kind: 'page', chapter: 2, ch: ['无用', ''], split: 16, lead: 0.6, gap: 0.8, tail: 1.8, shown: ['n08', 'n09'],
  sfx: (at) => [[at('n08'), 'chime', { midi: bell(9) }], [at('n09'), 'low', { midi: 38 }]],
  draw(lt) {
    background();
    const tq = vo('n08'), tr = vo('n09');
    quote(['人们也许会认为，', '我创造了值得创造的东西。'], [], 'G. H. Hardy · A Mathematician’s Apology · 1940 · §29（自译）', M, 420, sstep(tq, tq + 0.9, lt), '9', 56);
    voiceLine('看不见用途，不等于没有价值。', W / 2, 800, sstep(tr, tr + 0.75, lt), 'film', { size: 54, align: 'center', mk: '◇' });
  },
});
