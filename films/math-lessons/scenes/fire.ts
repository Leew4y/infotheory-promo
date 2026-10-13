// The dismissal: Russell's doubt and his sacred fire (F-H07; "躲进数学的沉思里" accepted by the v4 audit), the essay's
// last line (E11) read as passing on choosing and checking, the responsorial litany (the voice reads the first half,
// the screen answers just after it), and the closing sentence of the task, verbatim. The plate's highlight is the fire:
// it rises when the fire is passed. Each display line appears where it is spoken.
import { plate, backdrop, narratedScene, sstep, win, vo, voParts, W } from '../../../engine';
import { bell, recite } from '../lib';

const RUS = ['罗素问过自己：躲进数学的沉思里，', '是不是一种有些自私的拒绝？', '他答：总得有人让圣火不灭。'];
const N36 = ['递出去的，是选择与检验；', '不是放下它们。'];
const N41 = ['我们不应因为机器能够给出答案，', '就停止人类自己的探索；', '也不应因为答案来自强大的机器，', '就放弃检验它的责任。'];
const LITANY: [string, string, string][] = [['n37', '看不见用途——', '不等于没有价值。'], ['n38', '不再被需要——', '不等于没有意义。'], ['n39', '回答了题目——', '不等于回答了问题。'], ['n40', '公布——', '不等于检验。']];

narratedScene({
  name: 'fire', kind: 'plate', fi: 1.0, fo: 1.6, lead: 0.8, gap: 0.8, tail: 3.5, shown: true,
  lines: ['russell', 'n35', 'n36', 'n37', 'n38', 'n39', 'n40', 'n41'],
  sfx: (at) => [
    [at('russell'), 'chime', { midi: bell(16) }], [at('n35'), 'swell', { dur: 5 }],
    ...(['n37', 'n38', 'n39', 'n40'].map((id) => [at(id) + 0.9, 'low', { midi: 38 }]) as [number, string, { midi: number }][]),
    [at('n41'), 'swell', { dur: 6 }],
  ],
  cam: (lt, d) => ({ z: 1 + (0.03 * lt) / d }),
  draw(lt) {
    const t35 = vo('n35'), t41 = vo('n41'), r = voParts('russell', RUS), p = voParts('n36', N36), c = voParts('n41', N41);
    plate({ time: 80 + lt, progress: 0.6 + 0.4 * sstep(0, t41 + 10, lt), highlight: sstep(t35, t35 + 4, lt) * 0.9 });
    backdrop(W / 2, 520, 1650, 560, win(lt, 0.3, t41 + 13, 0.8, 1.2));
    recite([
      { t1: t35 - 0.3, lines: RUS.map((s, i) => ({ t: r[i], s, mk: i ? '' : '16', who: 'film' as const })) },
      { t1: vo('n37') - 0.3, lines: [
        { t: t35, s: '然后有一天，我们把火递了出去。', mk: '◇', who: 'essay' },
        { t: p[0], s: N36[0], mk: '◇', who: 'film' },
        { t: p[1], s: N36[1], who: 'film' },
      ] },
      { t1: t41 - 0.3, size: 46, lines: LITANY.map(([id, s, resp]) => ({ t: vo(id), s, mk: '◇', who: 'film' as const, resp: { t: vo(id) + 0.9, s: resp } })) },
      { t1: 1e9, size: 46, lines: N41.map((s, i) => ({ t: c[i], s, mk: i ? '' : '◇', who: 'film' as const })) },
    ], lt);
  },
});
