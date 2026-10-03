// 8. A breath: the sun about to rise, one sentence.
import { text, dot, plate, C, F, scene, win, W } from '../../../engine';

scene({
  name: 'dusk2', kind: 'plate', start: 40, len: 2, fi: 0.9, fo: 0.9, mb: 3,
  subs: [],
  sfx: [[0, 'swell', { dur: 5 }], [1.0, 'tone', { midi: 64 }]],
  cam: (lt, d) => ({ z: 1 + (0.03 * lt) / d }),
  draw(lt) {
    plate({ time: lt + 90, light: 0.55, sun: 0.03 });
    const a = win(lt, 0.8, 5.6, 0.8, 0.7);
    dot(W / 2, 300, 5, C.accent2, a);
    text('只要肯多花几个比特，噪声就不是终点。', W / 2, 390, { size: 50, weight: 500, color: C.fgOnDark, alpha: a, align: 'center', ls: 5 });
    text('Spend a few more bits, and noise is not the end.', W / 2, 448, { font: F.latin, style: 'italic', size: 26, color: C.mutedOnDark, alpha: a, align: 'center' });
  },
});
