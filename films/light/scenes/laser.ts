// 8. Chapter 08: the laser (Evenson, Wells, Petersen, Danielson, Day, Appl. Phys. Lett. 22, 1973, pp. 192-195; NBS
// Boulder, received November 1972). A laser's frequency, 88.376 181 627 THz, times its wavelength is the speed of
// light: 299 792 456.2 m/s, uncertain by 1.1 m/s, about 100 times better than before; what remained came almost
// entirely from the krypton line that then defined the metre. script.md gives no number for the wavelength, so the
// ruler under the wave carries none; the wave on screen is a schematic, not to scale.
import { ctx, text, rule, ink, dot, arrow, measure, rgba, statement, background, rollNumber, C, F, scene, clamp, lerp, eio, eout, sstep, bars, W, TAU } from '../../../engine';
import { glow, bigNumber, source } from '../kit';

/** The wave: centre line, amplitude, wavelength on screen, one crest; it runs from the laser's aperture to X1. */
const Y = 590, AMP = 40, LAM = 160, XC = 560, X0 = 440, X1 = 1680;
/** The ruler under the wave (major ticks under the troughs), the crest under the frequency readout, the row labels' right edge. */
const RY = 700, RX0 = 560, RX1 = 1680, PROBE = 880, LX = 540;
const waveY = (x: number) => Y - AMP * Math.cos((TAU * (x - XC)) / LAM);

/** A glowing sine wave from x0 towards x1 (either way, drawn up to fraction k), centre line y, crests at xc + n * lam. */
function wave(x0: number, x1: number, y: number, amp: number, lam: number, xc: number, k: number, a: number, col = C.accent, w = 3): void {
  if (a <= 0.002 || k <= 0) return;
  const xe = lerp(x0, x1, clamp(k)), n = Math.max(1, Math.ceil(Math.abs(xe - x0) / 3));
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = col;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const x = lerp(x0, xe, i / n), yy = y - amp * Math.cos((TAU * (x - xc)) / lam);
    if (i === 0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  }
  ctx.stroke();
  ctx.restore();
}

/** One line of type in pieces of different colours, an even gap between pieces, centred on cx. */
function pieces(parts: [string, string][], cx: number, y: number, size: number, a: number): void {
  if (a <= 0.002) return;
  const gap = 0.35 * size, ws = parts.map(([s]) => measure(s, size, F.body, 500));
  let x = cx - (ws.reduce((p, q) => p + q, 0) + gap * (parts.length - 1)) / 2;
  parts.forEach(([s, col], i) => {
    text(s, x, y, { size, weight: 500, color: col, alpha: a });
    x += ws[i] + gap;
  });
}

/** A colour between two #rrggbb colours. */
function mix(c0: string, c1: string, u: number): string {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const q0 = p(c0), q1 = p(c1);
  return '#' + q0.map((v, i) => Math.round(lerp(v, q1[i], clamp(u))).toString(16).padStart(2, '0')).join('');
}

/** A metre ruler seen from the side: a bar with ten major and fifty minor ticks. */
function metreRuler(x0: number, x1: number, y: number, h: number, a: number): void {
  if (a <= 0.002) return;
  ink([[x0, y], [x1, y], [x1, y + h], [x0, y + h], [x0, y]], 1, C.fg, 2.5, a);
  for (let i = 1; i < 50; i++) {
    const x = lerp(x0, x1, i / 50);
    rule(x, y, x, y + (i % 5 ? h * 0.25 : h * 0.5), C.fg2, a, i % 5 ? 1.5 : 2);
  }
}

/** A krypton discharge lamp: a glass tube with an electrode at each end, the gas glowing amber when on (0..1). */
function kryptonLamp(x0: number, x1: number, cy: number, h: number, on: number, a: number): void {
  if (a <= 0.002) return;
  ctx.save();
  if (on > 0.002) {
    // the gas: a faint fill of the tube and a bright column between the electrodes
    ctx.globalAlpha = a * on;
    ctx.fillStyle = rgba(C.alt, 0.16);
    ctx.beginPath();
    ctx.roundRect(x0 + 6, cy - h / 2 + 6, x1 - x0 - 12, h - 12, (h - 12) / 2);
    ctx.fill();
    ctx.strokeStyle = C.alt;
    ctx.shadowColor = C.alt;
    ctx.shadowBlur = 22;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0 + 54, cy);
    ctx.lineTo(x1 - 54, cy);
    ctx.stroke();
  }
  ctx.globalAlpha = a;
  ctx.shadowBlur = 0;
  ctx.strokeStyle = C.fg;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(x0, cy - h / 2, x1 - x0, h, h / 2);
  ctx.stroke();
  ctx.restore();
  rule(x0 + 14, cy, x0 + 46, cy, C.fg2, a, 3);
  rule(x1 - 46, cy, x1 - 14, cy, C.fg2, a, 3);
}

scene({
  name: 'laser', kind: 'page', dur: bars(6), mb: 3, chapter: 8, ch: ['激光', 'The laser'],
  subs: [
    [1, 6, '1972 年，美国国家标准局的团队分别测出一束激光的频率和波长，相乘就是光速。', 'In 1972 a team at the US National Bureau of Standards measured a laser\'s frequency and its wavelength; their product is the speed of light.'],
    [6.5, 11.5, '结果是 299 792 456.2 米每秒，误差约 1 米每秒，比以前准了约 100 倍。', 'The result: 299 792 456.2 metres a second, uncertain by about one metre a second, some 100 times better than before.'],
    [12, 17.5, '剩下的误差几乎都来自“米”本身：当时的米，由氪原子的一条谱线定义。', 'What uncertainty remained came almost entirely from the metre itself, then defined by a line of krypton.'],
  ],
  sfx: [[0.1, 'page'], [1.2, 'tick'], [2.4, 'tone', { midi: 64 }], [7.0, 'chime', { midi: 74 }], [13.0, 'tone', { midi: 62 }]],
  draw(lt) {
    background();
    statement('频率乘波长', 'Frequency times wavelength', lt);
    // caption 1: the laser, its wave, the frequency above and the wavelength below; gone by 6.4 s
    const ad = sstep(0.8, 1.4, lt) * (1 - sstep(5.9, 6.4, lt));
    ink([[240, 556], [X0, 556], [X0, 624], [240, 624], [240, 556]], 1, C.fg, 2.5, ad);
    ink([[266, 576], [414, 576], [414, 604], [266, 604], [266, 576]], 1, C.fg2, 2, ad);
    glow(340, Y, 60, ad * 0.35, C.accent);
    text('激光', 340, 674, { size: 30, color: C.fg2, alpha: ad, align: 'center' });
    const kw = eout(clamp((lt - 1.2) / 1.2));
    glow(X0, Y, 34, ad * sstep(1.1, 1.4, lt), C.accent2);
    wave(X0, X1, Y, AMP, LAM, XC, kw, ad);
    // light running along the wave, and a flash at the crest the frequency is read from
    let flash = 0;
    for (let i = 0; i < 4; i++) {
      const u = (lt - 2.2 - i * 1.0) / 1.4;
      if (u < 0 || u > 1) continue;
      const x = lerp(X0, X1, u);
      glow(x, waveY(x), 26, ad, C.accent2);
      flash = Math.max(flash, Math.exp(-(((x - PROBE) / 45) ** 2)));
    }
    // the frequency: a counter above the wave, a dotted probe down to a crest
    const af = ad * sstep(2.3, 2.8, lt);
    text('频率', LX, 465, { size: 32, color: C.fg2, alpha: af, align: 'right' });
    const fs = rollNumber('88.376 181 627', lt, 2.4, 1.3, 3);
    text(fs, LX + 24, 465, { font: F.mono, size: 56, color: C.accent, alpha: af });
    text('THz', LX + 24 + measure(fs, 56, F.mono) + 18, 465, { font: F.mono, size: 36, color: C.fg2, alpha: af });
    ink([[PROBE, 488], [PROBE, Y - AMP - 10]], eout(clamp((lt - 2.8) / 0.5)), C.accent, 2, af, [4, 6]);
    dot(PROBE, Y - AMP, 5, C.accent2, af);
    glow(PROBE, Y - AMP, 30, af * flash, C.accent2);
    // the wavelength: a ruler under the wave, ticks under the troughs, one wavelength marked (no number in script.md)
    const kr = clamp((lt - 3.3) / 1.1);
    const xr = lerp(RX0, RX1, eout(kr));
    const ar = ad * sstep(3.2, 3.6, lt);
    rule(RX0, RY, xr, RY, C.fg2, ar, 2);
    for (let x = RX0; x <= RX1; x += LAM / 4) {
      if (x > xr) break;
      const major = (x - RX0 - LAM / 2) % LAM === 0;
      rule(x, RY, x, RY - (major ? 18 : 9), C.fg2, ar, 2);
    }
    text('波长', LX, 712, { size: 32, color: C.fg2, alpha: ar, align: 'right' });
    const al = ad * sstep(4.2, 4.7, lt);
    const t0 = RX0 + LAM / 2, t1 = t0 + LAM;
    ink([[t0, Y + AMP + 8], [t0, RY - 22]], 1, C.accent, 2, al, [4, 6]);
    ink([[t1, Y + AMP + 8], [t1, RY - 22]], 1, C.accent, 2, al, [4, 6]);
    rule(t0, RY, t1, RY, C.accent, al, 5);
    // the product; after the diagram has gone it rises to head the result
    const kq = eio(clamp((lt - 6.4) / 0.8));
    const aq = sstep(4.9, 5.5, lt) * (1 - sstep(11.5, 11.9, lt));
    pieces([['频率', C.fg], [' × ', C.accent], ['波长', C.fg], [' = ', C.accent], ['光速', C.fg]], W / 2, lerp(820, 430, kq), lerp(46, 40, kq), aq);
    // caption 2: the result; caption 3: it shrinks upwards to make room for the metre
    const km = eio(clamp((lt - 12.0) / 0.9));
    const ns = lerp(130, 84, km), ny = lerp(590, 450, km);
    const an = sstep(7.0, 7.4, lt);
    bigNumber(rollNumber('299 792 456.2', lt, 7.0, 1.3, 11), W / 2, ny, ns, an, C.fg);
    text('m / s', W / 2 + 6.5 * 0.6 * ns + 0.2 * ns, ny, { font: F.mono, size: 0.31 * ns, color: C.accent, alpha: sstep(8.0, 8.5, lt) });
    const ae = sstep(8.4, 9.0, lt), ey = lerp(700, 535, km), es = lerp(50, 40, km);
    text('± 1.1 m / s', W / 2, ey, { font: F.mono, size: es, color: mix(C.accent, C.alt, km), alpha: ae, align: 'center' });
    text('比以前准约 100 倍', W / 2, 780, { size: 32, color: C.fg2, alpha: sstep(9.8, 10.4, lt) * (1 - sstep(11.5, 11.9, lt)), align: 'center' });
    // the uncertainty points at the metre; then the lamp whose krypton line defined that metre
    const ka = eout(clamp((lt - 12.9) / 0.5));
    arrow(W / 2, 568, W / 2, lerp(568, 650, ka), C.alt, sstep(12.9, 13.1, lt), 3, 14);
    const am = sstep(13.2, 13.8, lt);
    metreRuler(780, 1140, 676, 44, am);
    text('当时的米', W / 2, 790, { size: 30, color: C.fg2, alpha: am, align: 'center' });
    const ak = sstep(14.4, 15.0, lt);
    kryptonLamp(1300, 1560, 698, 70, sstep(14.8, 15.4, lt), ak);
    // four wavelengths from the lamp's end to the ruler's end, both ends on the centre line (crests at 1272.5 - 30 n)
    wave(1280, 1160, 698, 14, 30, 1272.5, clamp((lt - 15.2) / 0.5), ak, C.alt, 3);
    text('氪原子的谱线', 1430, 790, { size: 30, color: C.fg2, alpha: sstep(15.0, 15.6, lt), align: 'center' });
    source('1973 · Appl. Phys. Lett. 22 · pp. 192-195', sstep(1.4, 2.0, lt));
  },
});
