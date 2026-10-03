// 0. First light over the horizon; two lines, then the title.
import { text, rule, label, C, F_EN } from '../../../engine/draw';
import { glDraw } from '../../../engine/gl';
import { scene } from '../../../engine/scene';
import { clamp, eout, sstep, win, W } from '../../../engine/util';

scene({
  name: 'dawn', kind: 'plate', start: 0, len: 5, fi: 1.4, fo: 0.9, mb: 3,
  subs: [],
  sfx: [[0, 'swell', { dur: 6 }], [2.2, 'tone', { midi: 57 }], [7, 'tone', { midi: 60 }], [11, 'chime', { midi: 69 }], [11.2, 'swell', { dur: 4 }]],
  cam: (lt, d) => ({ z: 1 + (0.04 * lt) / d }),
  draw(lt) {
    glDraw(3, { time: lt, p: 0.1 + (0.08 * lt) / 15, q: 0 });
    const cx = W / 2;
    const a1 = win(lt, 2, 6.6, 0.9, 0.7);
    text('有些东西看不见，摸不着，', cx, 500, { size: 54, weight: 500, color: C.paper, alpha: a1, align: 'center', ls: 5 });
    text('Some things cannot be seen or held,', cx, 556, { font: F_EN, style: 'italic', size: 26, color: C.paper2, alpha: a1, align: 'center' });
    const a2 = win(lt, 7, 10.8, 0.9, 0.7);
    text('却可以被精确地计量。', cx, 500, { size: 54, weight: 500, color: C.paper, alpha: a2, align: 'center', ls: 5 });
    text('yet they can be measured exactly.', cx, 556, { font: F_EN, style: 'italic', size: 26, color: C.paper2, alpha: a2, align: 'center' });
    const a3 = sstep(11, 12.3, lt);
    const rise = (1 - eout(clamp((lt - 11) / 1.3))) * 16;
    text('信息论', cx, 520 + rise, { size: 150, weight: 500, color: C.paper, alpha: a3, align: 'center', ls: 44 });
    const rw = 220 * eout(clamp((lt - 11.6) / 1.0));
    rule(cx - rw / 2, 575, cx + rw / 2, 575, C.paper2, a3 * 0.8, 1.5);
    label('Information theory', cx, 630, sstep(12, 13, lt), C.paper2, 22, 'center');
    label('1948 · Claude Shannon', cx, 672, sstep(12.8, 13.8, lt), C.paper2, 16, 'center');
  },
});
