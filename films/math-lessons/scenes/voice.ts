// The essay's voice (E09, E05, E06) inside its hypothesis ("随笔设想，有一天"), the counter-argument it must face in
// its strongest form (autonomy is not acceptability; a system can correctly achieve a harmful goal), and the film's
// answer: what must be checked is not only the answer but goals, conduct and consequences (revisions.md R1, R3, R4).
import { plate, backdrop, scene, win, W, placeNarration } from '../../../engine';
import { recite } from '../lib';

// spoken lines (narration.json) where their text first appears on screen
placeNarration(scene({
  name: 'voice', kind: 'plate', dur: 35.0, fi: 1.0, fo: 1.0,
  subs: [],
  sfx: [[0, 'breath', { dur: 2.5 }], [16.3, 'low', { midi: 33, dur: 1.8 }]],
  cam: (lt, d) => ({ z: 1.02 - (0.02 * lt) / d }),
  draw(lt) {
    plate({ time: 40 + lt, progress: 0.55, highlight: 0 });
    backdrop(W / 2, 520, 1650, 540, win(lt, 0.3, 34.4, 0.8, 0.8));
    recite([
      { t1: 12.1, lines: [
        { t: 0.5, s: '什么值得我去做？', mk: '◇', who: 'essay' },
        { t: 2.9, s: '随笔设想，有一天——', mk: '◇', who: 'film' },
        { t: 5.3, s: '那是世界上出现了另一个', mk: '◇', who: 'essay' },
        { t: 8.25, s: '会自己决定什么值得追求的存在。', who: 'essay' },
      ] },
      { t1: 16.1, lines: [{ t: 12.4, s: '我不在乎它的目标是不是“高尚”。', mk: '◇', who: 'essay' }] },
      { t1: 25.4, lines: [
        { t: 16.3, s: '反方必须说出来：自主，不等于可以接受；', mk: '◇', who: 'counter' },
        { t: 20.5, s: '一个系统可以正确地完成一个有害的目标。', who: 'counter' },
      ] },
      { t1: 34.4, lines: [
        { t: 25.65, s: '所以，即使有一天它会自己选择，', mk: '◇', who: 'film' },
        { t: 29.1, s: '要检验的也不只是答案，', who: 'film' },
        { t: 31.8, s: '还有目标、行为与后果。', who: 'film' },
      ] },
    ], lt);
  },
}), { n28: 0.5, n29: 2.9, n30: 5.3, n31: 12.4, n32: 16.3, n33: 25.65 });
