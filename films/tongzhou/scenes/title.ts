// The opening plate: the name and the subtitle on the light stage; the voice says what the film is about.
import { planScene, copy, plate, text, C, W, sstep, eout, clamp } from '../../../engine';
import { T, brandMark, mockTag } from '../lib';

planScene('title', {
  draw(lt, d) {
    plate({ time: lt, progress: 0.2 + (0.3 * lt) / d, highlight: 0 });
    const a = sstep(0.3, 1.1, lt), rise = (1 - eout(clamp((lt - 0.3) / 1.1))) * 14;
    brandMark(W / 2, 360, 128, a);
    text(copy('title', 'name'), W / 2, 520 + rise, { size: T.name, weight: 700, color: C.fg, alpha: a, align: 'center', ls: 16 });
    text(copy('title', 'sub'), W / 2, 608, { size: T.sub, weight: 500, color: C.muted, alpha: sstep(0.9, 1.8, lt), align: 'center', ls: 4 });
    mockTag(copy('title', 'mock'), a);
  },
});
