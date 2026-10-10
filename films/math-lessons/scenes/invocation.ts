// The opening: two lines of the essay over the dark plate, in the essay's voice (E01, E02). On plates the display
// text is the caption, so the scene declares no subs.
import { plate, backdrop, scene, win, W, placeNarration } from '../../../engine';
import { recite } from '../lib';

// spoken lines (narration.json) where their text first appears on screen
placeNarration(scene({
  name: 'invocation', kind: 'plate', dur: 11.0, fi: 1.2, fo: 0.8,
  subs: [],
  sfx: [[0, 'swell', { dur: 4 }], [5.6, 'low', { midi: 38 }]],
  cam: (lt, d) => ({ z: 1 + (0.02 * lt) / d }),
  draw(lt) {
    plate({ time: lt, progress: 0.05, highlight: 0 });
    backdrop(W / 2, 520, 1500, 420, win(lt, 0.3, 10.4, 0.8, 0.6));
    recite([
      { t1: 5.4, lines: [{ t: 0.5, s: '在完全清醒的时候……', mk: '◇', who: 'essay' }, { t: 2.7, s: '把自己的一生烧进去。', who: 'essay' }] },
      { t1: 10.4, lines: [{ t: 5.6, s: '我们会自己决定，', mk: '◇', who: 'essay' }, { t: 7.55, s: '什么东西值得我们发疯。', who: 'essay' }] },
    ], lt);
  },
}), { n01: 0.5, n02: 5.6 });
