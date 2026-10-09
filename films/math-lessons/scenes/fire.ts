// The dismissal: Russell's sacred fire (F-H07), the essay's last line (E11) read as passing on choosing and checking,
// the responsorial litany (the voice reads the first half, the screen answers), and the closing sentence of the task,
// verbatim. The plate's highlight is the fire: it rises when the fire is passed.
import { plate, backdrop, scene, sstep, win, W } from '../../../engine';
import { bell, recite } from '../lib';

scene({
  name: 'fire', kind: 'plate', dur: 49.5, fi: 1.0, fo: 1.6,
  subs: [],
  sfx: [
    [0.6, 'chime', { midi: bell(18) }], [9.5, 'swell', { dur: 5 }],
    [20.07, 'low', { midi: 38 }], [23.82, 'low', { midi: 38 }], [27.57, 'low', { midi: 38 }], [31.32, 'low', { midi: 38 }],
    [33.5, 'swell', { dur: 6 }],
  ],
  cam: (lt, d) => ({ z: 1 + (0.03 * lt) / d }),
  draw(lt) {
    plate({ time: 80 + lt, progress: 0.6 + 0.4 * sstep(0, 46, lt), highlight: sstep(9.5, 13.5, lt) * 0.9 });
    backdrop(W / 2, 520, 1650, 560, win(lt, 0.3, 48.4, 0.8, 1.2));
    recite([
      { t1: 9.3, lines: [
        { t: 0.6, s: 'Russell 问过自己：退入沉思，', mk: '18', who: 'film' },
        { t: 3.3, s: '是不是一种自私的拒绝？', who: 'film' },
        { t: 6.0, s: '他答：总得有人让圣火不灭。', who: 'film' },
      ] },
      { t1: 18.2, lines: [
        { t: 9.6, s: '然后有一天，我们把火递了出去。', mk: '◇', who: 'essay' },
        { t: 13.6, s: '递出去的，是选择与检验；', mk: '◇', who: 'film' },
        { t: 16.3, s: '不是放下它们。', who: 'film' },
      ] },
      { t1: 33.2, size: 46, lines: [
        { t: 18.6, s: '看不见用途——', mk: '◇', who: 'film', resp: { t: 20.07, s: '不等于没有价值。' } },
        { t: 22.3, s: '不再被需要——', mk: '◇', who: 'film', resp: { t: 23.82, s: '不等于没有意义。' } },
        { t: 26.1, s: '回答了题目——', mk: '◇', who: 'film', resp: { t: 27.57, s: '不等于回答了问题。' } },
        { t: 29.8, s: '公布——', mk: '◇', who: 'film', resp: { t: 31.32, s: '不等于检验。' } },
      ] },
      { t1: 48.6, size: 46, lines: [
        { t: 33.6, s: '我们不应因为机器能够给出答案，', mk: '◇', who: 'film' },
        { t: 37.3, s: '就停止人类自己的探索；', who: 'film' },
        { t: 40.0, s: '也不应因为答案来自强大的机器，', who: 'film' },
        { t: 43.7, s: '就放弃检验它的责任。', who: 'film' },
      ] },
    ], lt);
  },
});
