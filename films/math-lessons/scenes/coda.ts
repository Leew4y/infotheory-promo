// The coda (v4; Develata, 2026-10-13): one line on black after the closing sentence, shown, not spoken. A complete
// sentence whose meaning stays open; an image, not a fact (narration.v4.md line 38): the answers come like a flood
// (the film's fluid, the seven hundred manuscripts at once), and the question of the questions is left to the viewer.
import { text, C, W, scene, sstep } from '../../../engine';

scene({
  name: 'coda', kind: 'plate', dur: 5.0, fi: 0.8, fo: 1.2,
  subs: [],
  sfx: [[0.6, 'low', { midi: 26, dur: 4.5 }]],
  cam: () => ({ z: 1 }),
  draw(lt) {
    // the plate's own near-black ground: no plate image, only the line
    text('这一次，答案来得比问题更汹涌', W / 2, 545, { size: 56, color: C.fgOnDark, alpha: sstep(0.8, 1.6, lt), align: 'center', ls: 6 });
  },
});
