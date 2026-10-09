// Chapter 1: the cycloid (F-H03, F-H10) and Huygens' theorem shown, not illustrated (F-M03): three beads released
// together from different heights on an inverted cycloid reach the lowest point together, every time. Their motion is
// computed from s(t) = s0 cos(ω t) (lib.ts), so they arrive together by the theorem, not by keyframing. With ω = π/2
// they reach the bottom 1 s after release and then every 2 s: two beats at 60 BPM, where the score changes its bass.
import { text, label, dot, background, M, COL, W, C, F, scene, sstep, clamp } from '../../../engine';
import { bell, beadS, cycloid, cycloidAt, flash, voiceLine } from '../lib';

const CX = (COL + W - M) / 2 + 20, YB = 650, R = 120, T0 = 9.0;
const S0 = [-0.92, -0.62, -0.32].map((k) => k * 4 * R);
const ARRIVE = [T0 + 1, T0 + 3, T0 + 5];

scene({
  name: 'cycloid', kind: 'page', dur: 15.0, chapter: 1, ch: ['无用', ''],
  subs: [
    [0.6, 4.07, '他举摆线为例：几何学家研究它，', '2'],
    [4.07, 6.54, '只是出于争先的虚荣；', ''],
    [6.54, 8.76, '后来，摆钟用上了它。', ''],
  ],
  sfx: [[0.6, 'chime', { midi: bell(2) }], [9.0, 'chime', { midi: bell(3) }], ...ARRIVE.map((t): [number, string] => [t, 'tick'])],
  draw(lt) {
    background();
    voiceLine('摆线', M, 380, sstep(0.8, 1.8, lt), 'film', { size: 64 });
    text('cycloid', M, 440, { font: F.latin, style: 'italic', size: 30, color: C.muted, alpha: sstep(1.2, 2.2, lt) });
    cycloid(CX, YB, R, clamp((lt - 0.8) / 2.2), sstep(0.8, 1.2, lt));
    // the beads: held at their heights from 7.6 s, released together at T0
    const ab = sstep(7.6, 8.4, lt);
    S0.forEach((s0, i) => {
      const [x, y] = cycloidAt(CX, YB, R, beadS(s0, T0, lt));
      dot(x, y, 9, i === 0 ? C.accent : C.fg, ab);
    });
    for (const t of ARRIVE) flash(CX, YB, lt, t);
    const at = sstep(9.0, 9.8, lt);
    text('s̈ = −(g / 4r) · s', M, 600, { font: F.math, style: 'italic', size: 40, color: C.fg2, alpha: at });
    voiceLine('1673 年，Huygens 证明——', M, 690, at, 'film', { size: 30, mk: '3' });
    voiceLine('从任何高度放开，同时到达最低点。', M, 740, sstep(9.6, 10.4, lt), 'film', { size: 30 });
    label('Huygens《摆钟论》第二部分 · 命题 XXV', M, 800, at, C.muted, 18);
  },
});
