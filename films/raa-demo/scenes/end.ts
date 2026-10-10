// The closing plate: one line of advice (the voice) and where to find the site.
import { planScene, copy, plate, backdrop, text, C, F, W, sstep } from '../../../engine';

planScene('end', {
  draw(lt, d) {
    plate({ time: 40 + lt, progress: 0.8 + (0.2 * lt) / d, highlight: 0.1 * sstep(0.5, d, lt) });
    const a = sstep(0.6, 1.6, lt);
    backdrop(W / 2, 545, 1500, 360, a);
    text(copy('end', 'url'), W / 2, 556, { font: F.mono, size: 46, color: C.fgOnDark, alpha: a, align: 'center' });
  },
});
