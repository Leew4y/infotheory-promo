// Demo scene: a terminal replay of real command output (captures/term-understand.json, recorded from capture/term/understand.html,
// built by capture/term/build.py); the plan holds its edit. The 「模拟数据」 tag is drawn after the demo, outside its clip.
import { planScene, copy, sstep } from '../../../engine';
import { mockTag } from '../lib';

const s = planScene('understand', { draw() {} });
const demo = s.draw;
s.draw = (lt, d, t) => {
  demo(lt, d, t);
  mockTag(copy('understand', 'mock'), sstep(0.2, 0.8, lt));
};
