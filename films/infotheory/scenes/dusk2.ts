// 8. A breath: the sun about to rise, one sentence.
import { text, dot, C, F_EN } from '../../../engine/draw';
import { glDraw } from '../../../engine/gl';
import { scene } from '../../../engine/scene';
import { win, W } from '../../../engine/util';

scene({
  name: 'dusk2', kind: 'plate', start: 40, len: 2, fi: 0.9, fo: 0.9, mb: 3,
  subs: [],
  sfx: [[0, 'swell', { dur: 5 }], [1.0, 'tone', { midi: 64 }]],
  cam: (lt, d) => ({ z: 1 + (0.03 * lt) / d }),
  draw(lt) {
    glDraw(3, { time: lt + 90, p: 0.55, q: 0.03 });
    const a = win(lt, 0.8, 5.6, 0.8, 0.7);
    dot(W / 2, 300, 5, C.rust2, a);
    text('只要肯多花几个比特，噪声就不是终点。', W / 2, 390, { size: 50, weight: 500, color: C.paper, alpha: a, align: 'center', ls: 5 });
    text('Spend a few more bits, and noise is not the end.', W / 2, 448, { font: F_EN, style: 'italic', size: 26, color: C.paper2, alpha: a, align: 'center' });
  },
});
