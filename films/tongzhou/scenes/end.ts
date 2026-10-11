// The closing plate: the name and the subtitle again, and the mock-data label. No repository address: the
// repository stays private; the video is committed into it with the submission.
import { planScene, copy, plate, text, C, W, sstep } from '../../../engine';
import { T, mockTag } from '../lib';

planScene('end', {
  draw(lt, d) {
    plate({ time: 40 + lt, progress: 0.5 + (0.3 * lt) / d, highlight: 0 });
    const a = sstep(0.3, 1.1, lt);
    text(copy('end', 'name'), W / 2, 500, { size: T.name, weight: 700, color: C.fg, alpha: a, align: 'center', ls: 16 });
    text(copy('end', 'sub'), W / 2, 590, { size: T.sub, weight: 500, color: C.muted, alpha: sstep(0.7, 1.5, lt), align: 'center', ls: 4 });
    mockTag(copy('end', 'mock'), a);
  },
});
