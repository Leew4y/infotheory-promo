// Placeholder until the footage is recorded on the frozen main (10-12 09:00); then this becomes a demo scene.
// The note (a qualifier the script requires on screen) stays as a caption under the capture.
import { planScene, copy, background, text, C, sstep } from '../../../engine';
import { placeholder, mockTag } from '../lib';

planScene('check', {
  draw(lt) {
    background();
    placeholder(copy('check', 'slot'), copy('check', 'what'), lt);
    text(copy('check', 'note'), 150 + 48, 190 + 660 - 44, { size: 22, weight: 500, color: C.fg, alpha: sstep(0.6, 1.2, lt) });
    mockTag(copy('check', 'mock'), sstep(0.2, 0.8, lt));
  },
});
