// Demo scene: front-end footage (captures/decide.json, recorded by capture/decide.ts); the plan holds its edit and camera.
// The page's 「模拟数据」 tag are drawn after the demo, outside its clip.
import { planScene, copy, sstep } from '../../../engine';
import { mockTag } from '../lib';

const s = planScene('decide', { draw() {} });
const demo = s.draw;
s.draw = (lt, d, t) => {
  demo(lt, d, t);
  mockTag(copy('decide', 'mock'), sstep(0.2, 0.8, lt));
};
