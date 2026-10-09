// The dismissal: Russell's sacred fire (F-H07), the essay's last line (E11) read as passing on choosing and checking,
// the responsorial litany (the voice reads the first half, the screen answers), and the closing sentence of the task,
// verbatim. The plate's highlight is the fire: it rises when the fire is passed.
import { plate, backdrop, scene, sstep, win, W } from '../../../engine';
import { bell, recite } from '../lib';

scene({
  name: 'fire', kind: 'plate', dur: 50.0, fi: 1.0, fo: 1.6,
  subs: [],
  sfx: [
    [0.6, 'chime', { midi: bell(18) }], [10.0, 'swell', { dur: 5 }],
    [20.57, 'low', { midi: 38 }], [24.32, 'low', { midi: 38 }], [28.07, 'low', { midi: 38 }], [31.82, 'low', { midi: 38 }],
    [34.0, 'swell', { dur: 6 }],
  ],
  cam: (lt, d) => ({ z: 1 + (0.03 * lt) / d }),
  draw(lt) {
    plate({ time: 80 + lt, progress: 0.6 + 0.4 * sstep(0, 46, lt), highlight: sstep(10.0, 14.0, lt) * 0.9 });
    backdrop(W / 2, 520, 1650, 560, win(lt, 0.3, 48.9, 0.8, 1.2));
    recite([
      { t1: 9.8, lines: [
        { t: 0.6, s: 'Russell 问过自己：退入沉思，', mk: '18', who: 'film' },
        { t: 3.3, s: '是不是一种有些自私的拒绝？', who: 'film' },
        { t: 6.5, s: '他答：总得有人让圣火不灭。', who: 'film' },
      ] },
      { t1: 18.7, lines: [
        { t: 10.1, s: '然后有一天，我们把火递了出去。', mk: '◇', who: 'essay' },
        { t: 14.1, s: '递出去的，是选择与检验；', mk: '◇', who: 'film' },
        { t: 16.8, s: '不是放下它们。', who: 'film' },
      ] },
      { t1: 33.7, size: 46, lines: [
        { t: 19.1, s: '看不见用途——', mk: '◇', who: 'film', resp: { t: 20.57, s: '不等于没有价值。' } },
        { t: 22.8, s: '不再被需要——', mk: '◇', who: 'film', resp: { t: 24.32, s: '不等于没有意义。' } },
        { t: 26.6, s: '回答了题目——', mk: '◇', who: 'film', resp: { t: 28.07, s: '不等于回答了问题。' } },
        { t: 30.3, s: '公布——', mk: '◇', who: 'film', resp: { t: 31.82, s: '不等于检验。' } },
      ] },
      { t1: 49.1, size: 46, lines: [
        { t: 34.1, s: '我们不应因为机器能够给出答案，', mk: '◇', who: 'film' },
        { t: 37.8, s: '就停止人类自己的探索；', who: 'film' },
        { t: 40.5, s: '也不应因为答案来自强大的机器，', who: 'film' },
        { t: 44.2, s: '就放弃检验它的责任。', who: 'film' },
      ] },
    ], lt);
  },
});
