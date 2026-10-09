// The essay's voice (E09, E05, E06), the counter-argument it must face, and the film's answer (F-N17).
import { plate, backdrop, scene, win, W } from '../../../engine';
import { bell, recite } from '../lib';

scene({
  name: 'voice', kind: 'plate', dur: 31.0, fi: 1.0, fo: 1.0,
  subs: [],
  sfx: [[0, 'breath', { dur: 2.5 }], [14.3, 'low', { midi: 33, dur: 1.8 }], [21.3, 'chime', { midi: bell(9) }]],
  cam: (lt, d) => ({ z: 1.02 - (0.02 * lt) / d }),
  draw(lt) {
    plate({ time: 40 + lt, progress: 0.55, highlight: 0 });
    backdrop(W / 2, 520, 1600, 480, win(lt, 0.3, 30.4, 0.8, 0.8));
    recite([
      { t1: 10.0, lines: [
        { t: 0.6, s: '什么值得我去做？', mk: '◇', who: 'essay' },
        { t: 3.1, s: '那是世界上出现了另一个', who: 'essay' },
        { t: 6.1, s: '会自己决定什么值得追求的存在。', who: 'essay' },
      ] },
      { t1: 14.0, lines: [{ t: 10.4, s: '我不在乎它的目标是不是“高尚”。', mk: '◇', who: 'essay' }] },
      { t1: 21.0, lines: [{ t: 14.4, s: '反方必须说出来：这样的系统，', mk: '◇', who: 'counter' }, { t: 17.6, s: '正是 AI 安全研究最担心的。', who: 'counter' }] },
      { t1: 30.4, lines: [
        { t: 21.4, s: '而今天，问题仍由人提出。', mk: '9', who: 'film' },
        { t: 24.1, s: '即使有一天它会自己选择，', who: 'film' },
        { t: 27.1, s: '它的答案也更需要检验。', who: 'film' },
      ] },
    ], lt);
  },
});
