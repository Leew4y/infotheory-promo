// Demo scene: front-end footage (captures/cost.json, recorded by capture/cost.ts); the plan holds its edit and camera.
// The page's 「模拟数据」 tag and the note under the window are drawn after the demo, outside its clip.
import { planScene, copy, text, C, sstep } from '../../../engine';
import { mockTag } from '../lib';

const s = planScene('cost', { draw() {} });
const demo = s.draw;
s.draw = (lt, d, t) => {
  demo(lt, d, t);
  // The qualifier the script requires on screen: a line under the window (the capture's own overlay is clipped to the window).
  text(copy('cost', 'note'), 150, 900, { size: 22, weight: 500, color: C.fg, alpha: sstep(0.6, 1.2, lt) });
  mockTag(copy('cost', 'mock'), sstep(0.2, 0.8, lt));
};
