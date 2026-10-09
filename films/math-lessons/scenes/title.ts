// The title over the plate, one step brighter than the opening.
import { text, plate, backdrop, C, scene, clamp, eout, sstep, W } from '../../../engine';

scene({
  name: 'title', kind: 'plate', dur: 5.0, fi: 0.6, fo: 1.0,
  subs: [],
  sfx: [[0.3, 'chime', { midi: 74 }]],
  cam: (lt, d) => ({ z: 1 + (0.015 * lt) / d }),
  draw(lt) {
    plate({ time: 20 + lt, progress: 0.15, highlight: 0.1 });
    const a = sstep(0.3, 1.3, lt);
    backdrop(W / 2, 540, 1500, 340, a);
    const rise = (1 - eout(clamp((lt - 0.3) / 1.2))) * 12;
    text('对数学，人类应从历史中得到教训', W / 2, 525 + rise, { size: 74, color: C.fgOnDark, alpha: a, align: 'center', ls: 8 });
    text('当机器开始解题，我们是否再次误解了数学？', W / 2, 610, { size: 30, color: C.mutedOnDark, alpha: sstep(1.2, 2.2, lt), align: 'center', ls: 6 });
  },
});
