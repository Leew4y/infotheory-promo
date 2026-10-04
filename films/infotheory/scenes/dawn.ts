// 0. First light over the horizon; two lines, then the title.
import { text, rule, label, plate, C, F, scene, clamp, eout, sstep, win, W, bars } from '../../../engine';

scene({
  name: 'dawn', kind: 'plate', dur: bars(5), fi: 1.4, fo: 0.9, mb: 3,
  subs: [],
  sfx: [[0, 'swell', { dur: 6 }], [2.2, 'tone', { midi: 57 }], [7, 'tone', { midi: 60 }], [11, 'chime', { midi: 69 }], [11.2, 'swell', { dur: 4 }]],
  cam: (lt, d) => ({ z: 1 + (0.04 * lt) / d }),
  draw(lt) {
    plate({ time: lt, light: 0.1 + (0.08 * lt) / 15, sun: 0 });
    const cx = W / 2;
    const a1 = win(lt, 2, 6.6, 0.9, 0.7);
    text('有些东西看不见，摸不着，', cx, 500, { size: 54, weight: 500, color: C.fgOnDark, alpha: a1, align: 'center', ls: 5 });
    text('Some things cannot be seen or held,', cx, 556, { font: F.latin, style: 'italic', size: 26, color: C.mutedOnDark, alpha: a1, align: 'center' });
    const a2 = win(lt, 7, 10.8, 0.9, 0.7);
    text('却可以被精确地计量。', cx, 500, { size: 54, weight: 500, color: C.fgOnDark, alpha: a2, align: 'center', ls: 5 });
    text('yet they can be measured exactly.', cx, 556, { font: F.latin, style: 'italic', size: 26, color: C.mutedOnDark, alpha: a2, align: 'center' });
    const a3 = sstep(11, 12.3, lt);
    const rise = (1 - eout(clamp((lt - 11) / 1.3))) * 16;
    text('信息论', cx, 520 + rise, { size: 150, weight: 500, color: C.fgOnDark, alpha: a3, align: 'center', ls: 44 });
    const rw = 220 * eout(clamp((lt - 11.6) / 1.0));
    rule(cx - rw / 2, 575, cx + rw / 2, 575, C.mutedOnDark, a3 * 0.8, 1.5);
    label('Information theory', cx, 630, sstep(12, 13, lt), C.mutedOnDark, 22, 'center');
    label('1948 · Claude Shannon', cx, 672, sstep(12.8, 13.8, lt), C.mutedOnDark, 16, 'center');
  },
});
