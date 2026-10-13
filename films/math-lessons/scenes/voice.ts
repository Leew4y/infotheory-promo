// The essay's voice inside its hypothesis ("随笔设想，有一天"; E05), the counter-argument it must face in its strongest
// form (autonomy is not acceptability; a system can correctly achieve a harmful goal), and the film's answer: what must
// be checked is not only the answer but goals, conduct and consequences (revisions.md R1, R3, R4). On a plate the
// display text is the caption; each display line appears where it is spoken.
import { plate, backdrop, narratedScene, win, vo, voParts, W } from '../../../engine';
import { recite } from '../lib';

const N30 = ['那是世界上出现了另一个', '会自己决定什么值得追求的存在。'];
const N32 = ['反方必须说出来：自主，不等于可以接受；', '一个系统可以正确地完成一个有害的目标。'];
const N33 = ['所以，即使有一天它会自己选择，', '要检验的也不只是答案，', '还有目标、行为与后果。'];

narratedScene({
  name: 'voice', kind: 'plate', fi: 1.0, fo: 1.0, lead: 0.8, gap: 0.8, tail: 1.4, shown: true,
  sfx: (at) => [[0, 'breath', { dur: 2.5 }], [at('n32'), 'low', { midi: 33, dur: 1.8 }]],
  cam: (lt, d) => ({ z: 1.02 - (0.02 * lt) / d }),
  draw(lt) {
    plate({ time: 40 + lt, progress: 0.55, highlight: 0 });
    const d = vo('n33') + 12;
    backdrop(W / 2, 520, 1650, 540, win(lt, 0.3, d, 0.8, 0.8));
    const a = voParts('n30', N30), c = voParts('n32', N32), f = voParts('n33', N33);
    recite([
      { t1: c[0] - 0.3, lines: [
        { t: vo('n29'), s: '随笔设想，有一天——', mk: '◇', who: 'film' },
        { t: a[0], s: N30[0], mk: '◇', who: 'essay' },
        { t: a[1], s: N30[1], who: 'essay' },
      ] },
      { t1: f[0] - 0.3, lines: [{ t: c[0], s: N32[0], mk: '◇', who: 'counter' }, { t: c[1], s: N32[1], who: 'counter' }] },
      { t1: 1e9, lines: [{ t: f[0], s: N33[0], mk: '◇', who: 'film' }, { t: f[1], s: N33[1], who: 'film' }, { t: f[2], s: N33[2], who: 'film' }] },
    ], lt);
  },
});
