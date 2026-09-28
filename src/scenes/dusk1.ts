// 4. A breath: the horizon a little brighter, one sentence.
import { text, dot, C, F_EN } from '../engine/draw';
import { glDraw } from '../engine/gl';
import { scene } from '../engine/scene';
import { win, W } from '../engine/util';

scene({
  name: 'dusk1', kind: 'plate', start: 20, len: 2, fi: 0.9, fo: 0.9, mb: 3,
  subs: [],
  sfx: [[0, 'swell', { dur: 5 }], [1.0, 'tone', { midi: 60 }]],
  cam: (lt, d) => ({ z: 1 + (0.03 * lt) / d }),
  draw(lt) {
    glDraw(3, { time: lt + 40, p: 0.32, q: 0 });
    const a = win(lt, 0.8, 5.6, 0.8, 0.7);
    dot(W / 2, 430, 5, C.rust2, a);
    text('信息，是被消除的不确定。', W / 2, 520, { size: 52, weight: 500, color: C.paper, alpha: a, align: 'center', ls: 6 });
    text('Information is the resolution of uncertainty.', W / 2, 578, { font: F_EN, style: 'italic', size: 26, color: C.paper2, alpha: a, align: 'center' });
  },
});
