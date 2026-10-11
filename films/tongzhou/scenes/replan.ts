// Placeholder until the footage is recorded on the frozen main (10-12 09:00); then this becomes a demo scene.
import { planScene, copy, background, sstep } from '../../../engine';
import { placeholder, mockTag } from '../lib';

planScene('replan', {
  draw(lt) {
    background();
    placeholder(copy('replan', 'slot'), copy('replan', 'what'), lt);
    mockTag(copy('replan', 'mock'), sstep(0.2, 0.8, lt));
  },
});
