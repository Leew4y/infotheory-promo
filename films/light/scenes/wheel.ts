// 4. Chapter 04: Fizeau's toothed wheel (Comptes rendus 29, 1849, p. 92). Two telescopes about 8633 m apart
// (Suresnes, Montmartre); a 720-tooth wheel; the first eclipse near 12.6 turns per second; 70 948 leagues a second
// (25 to the degree), the mean of 28 observations. The km/s figure is this film's conversion.
import { text, label, rule, statement, background, C, F, M, scene, clamp, eout, sstep, win, bars, W, TAU } from '../../../engine';
import { beam, pulse, glow, telescope, mirror, wheel, dimension, bigNumber, source } from '../kit';

const Y = 600, XL = 430, XR = 1640, XW = 610;
/** Wheel speed in turns per second: spins up during caption 2 and holds at 12.6. */
const speed = (lt: number) => 12.6 * eout(clamp((lt - 6.4) / 3.6));
/** Wheel angle, the integral of the speed (turns -> radians), slowed down 40 times for the eye. */
const angleAt = (lt: number) => {
  let s = 0;
  const n = 60;
  for (let i = 0; i < n; i++) s += speed(((i + 0.5) / n) * lt) * (lt / n);
  return (s / 40) * TAU;
};

scene({
  name: 'wheel', kind: 'page', dur: bars(6), mb: 3, chapter: 4, ch: ['齿轮', 'The toothed wheel'],
  subs: [
    [1, 5.5, '1849 年，菲索在巴黎架起两台望远镜，相距约 8633 米。', 'In 1849 Fizeau set up two telescopes in Paris, about 8633 metres apart.'],
    [6, 11.5, '光往返时穿过一个 720 齿的转轮；每秒约 12.6 圈时，回来的光正好被齿挡住。', 'The light passed a wheel with 720 teeth; at about 12.6 turns a second the returning light hit a tooth.'],
    [12, 17, '28 次观测的平均：每秒 70 948 里格，约合 31.5 万千米。', 'The mean of 28 observations: 70 948 leagues a second, about 315 000 kilometres.'],
  ],
  sfx: [[0.1, 'page'], [1.2, 'tick'], [6.2, 'tone', { midi: 62 }], [10.0, 'tone', { midi: 69 }], [12.2, 'chime', { midi: 74 }]],
  draw(lt) {
    background();
    statement('搬到地面上测', 'Measured on the ground', lt);
    const a = sstep(0.8, 1.4, lt);
    const ad = a * (1 - sstep(11.6, 12.2, lt));
    // the two stations and the beam between them
    telescope(XL - 160, Y, 220, 0, ad);
    mirror(XR, Y, 110, Math.PI / 2, ad);
    telescope(XR - 230, Y, 220, 0, ad * 0.6);
    label('Suresnes', XL - 160, Y + 110, ad, C.fg2, 26);
    label('Montmartre', XR - 200, Y + 110, ad, C.fg2, 26);
    beam(XL + 60, Y, XR, Y, clamp((lt - 1.3) / 1.4), ad * 0.7, C.accent, 2.2);
    dimension(XL + 60, XR, Y + 170, '约 8633 米', ad, clamp((lt - 2.2) / 1.0));
    // the wheel in the beam (edge on, a thin bar) and face on, enlarged, upper right
    rule(XW, Y - 80, XW, Y + 80, C.fg2, ad, 5);
    const ang = angleAt(lt);
    const aw = sstep(5.8, 6.6, lt) * (1 - sstep(11.6, 12.2, lt));
    wheel(1520, 360, 150, 72, ang, aw);
    label('720 齿（图中只画 72 齿）', 1520, 548, aw, C.muted, 24, 'center');
    const sp = speed(lt);
    text(`${sp.toFixed(1)} 圈 / 秒`, 1320, 375, { font: F.mono, size: 44, color: C.accent, alpha: aw, align: 'right' });
    // light out and back; as the wheel reaches 12.6 turns per second the returning light is blocked
    const blocked = sstep(9.6, 10.4, lt);
    for (let k = 0; k < 6; k++) {
      const t0 = 6.6 + k * 0.85;
      pulse(XW, Y, XR, Y, (lt - t0) / 0.35, aw);
      pulse(XR, Y, XW, Y, (lt - t0 - 0.38) / 0.35, aw);
    }
    // the eye's view: the returning spot, bright, then gone
    glow(XL - 190, Y, 44, ad * (sstep(1.6, 2.2, lt) * (1 - 0.92 * blocked)), C.accent2);
    text(blocked > 0.5 ? '回光被挡住' : '看得见回光', XL - 190, Y - 80, { size: 30, color: C.fg2, alpha: aw, align: 'center' });
    // the result
    const ar = sstep(12.2, 12.9, lt);
    bigNumber('70 948', W / 2, 560, 150, ar, C.fg);
    text('里格 / 秒（每度 25 里格）', W / 2, 640, { size: 34, color: C.fg2, alpha: ar, align: 'center' });
    text('≈ 315 000 km / s', W / 2, 740, { font: F.mono, size: 50, color: C.accent, alpha: sstep(13.4, 14.1, lt), align: 'center' });
    label('本片换算 · 28 次观测的平均', W / 2, 800, sstep(13.8, 14.4, lt), C.muted, 24, 'center');
    source('1849 · Comptes rendus 29 · p. 92', sstep(1.4, 2.0, lt));
    void win;
  },
});
