// The dismissal: Russell's doubt and his sacred fire (F-H07), the essay's last line (E11) read as passing on choosing
// and checking, the responsorial litany (the voice reads the first half, the screen answers, rising just before the
// spoken half ends), and the closing sentence of the task, verbatim. The plate's highlight is the fire: it rises when
// the fire is passed.
import { plate, backdrop, scene, sstep, win, W } from '../../../engine';
import { bell, recite } from '../lib';

scene({
  name: 'fire', kind: 'plate', dur: 45.5, fi: 1.0, fo: 1.6,
  subs: [],
  sfx: [
    [0.5, 'chime', { midi: bell(18) }], [9.8, 'swell', { dur: 5 }],
    [19.45, 'low', { midi: 38 }], [22.5, 'low', { midi: 38 }], [25.55, 'low', { midi: 38 }], [28.6, 'low', { midi: 38 }],
    [30.75, 'swell', { dur: 6 }],
  ],
  cam: (lt, d) => ({ z: 1 + (0.03 * lt) / d }),
  draw(lt) {
    plate({ time: 80 + lt, progress: 0.6 + 0.4 * sstep(0, 42, lt), highlight: sstep(9.8, 13.8, lt) * 0.9 });
    backdrop(W / 2, 520, 1650, 560, win(lt, 0.3, 44.4, 0.8, 1.2));
    recite([
      { t1: 9.6, lines: [
        { t: 0.5, s: 'Russell 问过自己：退入沉思，', mk: '18', who: 'film' },
        { t: 3.2, s: '是不是一种有些自私的拒绝？', who: 'film' },
        { t: 6.4, s: '他答：总得有人让圣火不灭。', who: 'film' },
      ] },
      { t1: 18.3, lines: [
        { t: 9.8, s: '然后有一天，我们把火递了出去。', mk: '◇', who: 'essay' },
        { t: 13.7, s: '递出去的，是选择与检验；', mk: '◇', who: 'film' },
        { t: 16.4, s: '不是放下它们。', who: 'film' },
      ] },
      { t1: 30.5, size: 46, lines: [
        { t: 18.55, s: '看不见用途——', mk: '◇', who: 'film', resp: { t: 19.45, s: '不等于没有价值。' } },
        { t: 21.6, s: '不再被需要——', mk: '◇', who: 'film', resp: { t: 22.5, s: '不等于没有意义。' } },
        { t: 24.65, s: '回答了题目——', mk: '◇', who: 'film', resp: { t: 25.55, s: '不等于回答了问题。' } },
        { t: 27.7, s: '公布——', mk: '◇', who: 'film', resp: { t: 28.6, s: '不等于检验。' } },
      ] },
      { t1: 44.6, size: 46, lines: [
        { t: 30.75, s: '我们不应因为机器能够给出答案，', mk: '◇', who: 'film' },
        { t: 34.45, s: '就停止人类自己的探索；', who: 'film' },
        { t: 37.15, s: '也不应因为答案来自强大的机器，', who: 'film' },
        { t: 40.85, s: '就放弃检验它的责任。', who: 'film' },
      ] },
    ], lt);
  },
});
