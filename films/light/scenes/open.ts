// 0. The hook: 299 792 458 m/s on screen in the first second, the question, and the years the film will walk through.
import { text, label, rule, dot, background, rollNumber, C, F, scene, clamp, eout, sstep, win, bars, W } from '../../../engine';
import { bigNumber } from '../kit';

const YEARS = ['1638', '1676', '1728', '1849', '1862', '1865', '1926', '1972', '1983'];

scene({
  name: 'open', kind: 'page', dur: bars(3), fi: 0.15, mb: 3,
  subs: [
    [0.4, 4.2, '光速是 299 792 458 米每秒。为什么偏偏是整数？', 'Light travels at 299 792 458 metres per second. Why a whole number?'],
    [4.8, 8.6, '先看三百多年来，人们怎么测它。', 'First, how people measured it for more than three hundred years.'],
  ],
  sfx: [[0.1, 'tick'], [0.9, 'chime', { midi: 76 }], [4.8, 'tone', { midi: 64 }]],
  cam: (lt, d) => ({ z: 1 + (0.02 * lt) / d }),
  draw(lt) {
    background();
    // the number rolls in from the first frames and settles by 0.9 s
    const a = sstep(0.05, 0.35, lt);
    bigNumber(rollNumber('299 792 458', lt, 0.1, 0.8, 7), W / 2, 450, 150, a, C.fg);
    text('m / s', W / 2 + 560, 450, { font: F.mono, size: 40, color: C.accent, alpha: sstep(0.7, 1.1, lt), align: 'left' });
    // a cyan rule under it, then the title
    const kr = eout(clamp((lt - 0.9) / 0.8));
    rule(W / 2 - 400 * kr, 500, W / 2 + 400 * kr, 500, C.accent, kr, 2);
    const at = sstep(1.6, 2.4, lt);
    text('光速为什么是个整数？', W / 2, 590, { size: 60, weight: 600, color: C.fg, alpha: at, align: 'center', ls: 4 });
    label('Why is the speed of light a whole number?', W / 2, 640, sstep(2.0, 2.8, lt), C.accent, 20, 'center');
    // the journey ahead: a time line of the years the film visits
    const x0 = 360, x1 = W - 360, y = 770;
    const kl = eout(clamp((lt - 4.9) / 1.2));
    rule(x0, y, x0 + (x1 - x0) * kl, y, C.rule, kl, 1.5);
    YEARS.forEach((yr, i) => {
      const x = x0 + ((x1 - x0) * i) / (YEARS.length - 1);
      const ai = sstep(5.0 + i * 0.25, 5.4 + i * 0.25, lt) * (1 - sstep(8.4, 8.9, lt) * 0);
      dot(x, y, 5, i === YEARS.length - 1 ? C.alt : C.accent, ai);
      text(yr, x, y + 44, { font: F.mono, size: 26, color: i === YEARS.length - 1 ? C.alt : C.fg2, alpha: ai, align: 'center' });
    });
    void win;
  },
});
