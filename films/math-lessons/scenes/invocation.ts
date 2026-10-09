// The opening: two lines of the essay over the dark plate, in the essay's voice (E01, E02).
import { plate, backdrop, scene, win, W } from '../../../engine';
import { voiceLine } from '../lib';

scene({
  name: 'invocation', kind: 'plate', dur: 11.5, fi: 1.2, fo: 0.8,
  subs: [],
  sfx: [[0, 'swell', { dur: 4 }], [5.8, 'low', { midi: 38 }]],
  cam: (lt, d) => ({ z: 1 + (0.02 * lt) / d }),
  draw(lt) {
    plate({ time: lt, progress: 0.05, highlight: 0 });
    backdrop(W / 2, 520, 1500, 420, win(lt, 0.4, 10.9, 0.8, 0.6));
    voiceLine('在完全清醒的时候……', W / 2, 470, win(lt, 0.6, 5.3, 0.6, 0.5), 'essay', { onDark: true, align: 'center', mk: '◇', tag: true, size: 50 });
    voiceLine('把自己的一生烧进去。', W / 2, 560, win(lt, 2.8, 5.3, 0.6, 0.5), 'essay', { onDark: true, align: 'center', size: 50 });
    voiceLine('我们会自己决定，', W / 2, 470, win(lt, 5.85, 10.6, 0.6, 0.6), 'essay', { onDark: true, align: 'center', mk: '◇', size: 50 });
    voiceLine('什么东西值得我们发疯。', W / 2, 560, win(lt, 7.8, 10.6, 0.6, 0.6), 'essay', { onDark: true, align: 'center', size: 50 });
  },
});
