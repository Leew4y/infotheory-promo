// Placeholder until the footage is recorded on the frozen main (10-12 09:00); then this becomes a demo scene.
import { planScene, copy, background, sstep } from '../../../engine';
import { placeholder, mockTag } from '../lib';

planScene('understand', {
  draw(lt) {
    background();
    placeholder(copy('understand', 'slot'), copy('understand', 'what'), lt);
    mockTag(copy('understand', 'mock'), sstep(0.2, 0.8, lt));
  },
});
