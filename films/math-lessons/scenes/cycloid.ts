// Chapter 1: the cycloid (F-H03, F-H10) and Huygens' theorem shown, not illustrated (F-M03): three beads released
// together from different heights on an inverted cycloid reach the lowest point together, every time. Their motion is
// computed from s(t) = s0 cos(ω t) (lib.ts), so they arrive together by the theorem, not by keyframing. With ω = π/2
// they reach the bottom 1 s after release and then every 2 s: two beats at 60 BPM, where the score changes its bass.
// The theorem holds for the ideal model, stated on screen: one inverted cycloid, released at rest, uniform gravity,
// no friction.
import { text, label, dot, background, M, COL, W, C, F, scene, sstep, clamp } from '../../../engine';
import { bell, beadS, cycloid, cycloidAt, flash, voiceLine } from '../lib';

const CX = (COL + W - M) / 2 + 20, YB = 650, R = 120, T0 = 7.6;
const S0 = [-0.92, -0.62, -0.32].map((k) => k * 4 * R);
const ARRIVE = [T0 + 1, T0 + 3];

scene({
  name: 'cycloid', kind: 'page', dur: 12.5, chapter: 1, ch: ['无用', ''],
  subs: [
    [0.5, 3.95, '他举摆线为例：几何学家研究它，', '2'],
    [3.95, 6.4, '只是出于争先的虚荣；', ''],
    [6.4, 8.6, '后来，摆钟用上了它。', ''],
  ],
  sfx: [[0.5, 'chime', { midi: bell(2) }], [T0, 'chime', { midi: bell(3) }], ...ARRIVE.map((t): [number, string] => [t, 'tick'])],
  draw(lt) {
    background();
    voiceLine('摆线', M, 380, sstep(0.7, 1.7, lt), 'film', { size: 64 });
    text('cycloid', M, 440, { font: F.latin, style: 'italic', size: 30, color: C.muted, alpha: sstep(1.1, 2.1, lt) });
    cycloid(CX, YB, R, clamp((lt - 0.7) / 2.2), sstep(0.7, 1.1, lt));
    // the beads: held at their heights from 6.4 s, released together at T0
    const ab = sstep(6.4, 7.2, lt);
    S0.forEach((s0, i) => {
      const [x, y] = cycloidAt(CX, YB, R, beadS(s0, T0, lt));
      dot(x, y, 9, i === 0 ? C.accent : C.fg, ab);
    });
    for (const t of ARRIVE) flash(CX, YB, lt, t);
    const at = sstep(T0, T0 + 0.8, lt);
    text('s̈ = −(g / 4r) · s', M, 590, { font: F.math, style: 'italic', size: 40, color: C.fg2, alpha: at });
    voiceLine('1673 年，Huygens 证明——', M, 670, at, 'film', { size: 30, mk: '3' });
    voiceLine('从最低点以上的任何高度静止放开，同时到达最低点。', M, 720, sstep(T0 + 0.5, T0 + 1.3, lt), 'film', { size: 30 });
    label('Huygens《摆钟论》第二部分 · 命题 XXV', M, 772, at, C.muted, 18);
    label('理想模型：同一条倒置摆线 · 静止释放 · 匀强重力 · 无摩擦', M, 804, sstep(T0 + 1.0, T0 + 1.8, lt), C.muted, 18);
  },
});
