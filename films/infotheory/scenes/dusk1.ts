// 4. A breath: the horizon a little brighter, one sentence.
import { text, dot, plate, backdrop, C, F, scene, win, W, bars } from '../../../engine';

scene({
  name: 'dusk1', kind: 'plate', dur: bars(2), fi: 0.9, fo: 0.9, mb: 3,
  subs: [],
  sfx: [[0, 'swell', { dur: 5 }], [1.0, 'tone', { midi: 60 }]],
  cam: (lt, d) => ({ z: 1 + (0.03 * lt) / d }),
  draw(lt) {
    plate({ time: lt + 40, progress: 0.32, highlight: 0 });
    const a = win(lt, 0.8, 5.6, 0.8, 0.7);
    backdrop(W / 2, 540, 1500, 300, a);
    dot(W / 2, 430, 5, C.accent2, a);
    text('信息，是被消除的不确定。', W / 2, 520, { size: 52, weight: 500, color: C.fgOnDark, alpha: a, align: 'center', ls: 6 });
    text('Information is the resolution of uncertainty.', W / 2, 578, { font: F.latin, style: 'italic', size: 26, color: C.mutedOnDark, alpha: a, align: 'center' });
  },
});
