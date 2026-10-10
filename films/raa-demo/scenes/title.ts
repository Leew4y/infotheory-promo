// The opening plate: the product's name and its promise over the style's dawn; the voice states the problem.
import { planScene, copy, plate, backdrop, text, C, F, W, sstep, eout, clamp } from '../../../engine';

planScene('title', {
  draw(lt, d) {
    plate({ time: lt, progress: 0.15 + (0.25 * lt) / d, highlight: 0.05 * sstep(1, d, lt) });
    const a = sstep(0.4, 1.4, lt);
    backdrop(W / 2, 560, 1600, 480, a);
    const rise = (1 - eout(clamp((lt - 0.4) / 1.2))) * 14;
    text(copy('title', 'name'), W / 2, 520 + rise, { font: F.latin, size: 104, weight: 600, color: C.fgOnDark, alpha: a, align: 'center' });
    text(copy('title', 'promise'), W / 2, 610, { size: 40, color: C.mutedOnDark, alpha: sstep(1.6, 2.6, lt), align: 'center', ls: 6 });
  },
});
