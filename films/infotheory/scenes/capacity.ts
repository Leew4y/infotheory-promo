// 9. Chapter 06, capacity: C = B log2(1 + S/N) in ink; the reliable and impossible regions hatched; the climb to the limit.
import { text, label, ink, hatch, rule, dot, background, statement, row, M, COL, C, F, scene, clamp, lerp, eout, sstep, win, ctx, bars } from '../../../engine';

const X0 = COL + 60, X1 = 1740, Y0 = 740, Y1 = 300;
const cap = (db: number) => Math.log2(1 + Math.pow(10, db / 10));
const px = (db: number) => lerp(X0, X1, (db + 10) / 40);
const py = (c: number) => lerp(Y0, Y1, clamp(c / 10));
const CURVE: [number, number][] = Array.from({ length: 161 }, (_, i) => {
  const db = -10 + (i / 160) * 40;
  return [px(db), py(cap(db))];
});
const CLIMB: [string, string, string, number][] = [['1948', '香农', '证明极限存在', 0.2], ['1993', 'Turbo 码', '距极限 0.5 dB', 0.62], ['1996', 'LDPC 码', '距极限 0.04 dB', 0.84], ['2008', '极化码', '5G 采用', 0.96]];

scene({
  name: 'capacity', kind: 'page', dur: bars(6), mb: 3, chapter: 6, ch: ['容量', 'Capacity'],
  subs: [
    [0.8, 4.6, '带宽和信噪比，决定一条信道每秒最多能送多少比特。', 'Bandwidth and signal-to-noise ratio set how many bits a channel can carry per second.'],
    [5.2, 9.2, '低于容量：错误率可以压到任意小。高于它：必然出错。', 'Below capacity, errors can be made as rare as you like. Above it, they are inevitable.'],
    [9.8, 13.6, '香农只证明了极限存在。逼近它，人类用了半个世纪。', 'Shannon proved the limit exists. Reaching it took half a century.'],
    [14.2, 17.4, '今天你手机里的 5G，距离它只差一点点。', 'The 5G in your pocket sits a whisker below it.'],
  ],
  sfx: [[0.1, 'page'], [1.0, 'ink'], [1.8, 'ink'], [4.2, 'tone', { midi: 64 }], [5.4, 'breath', { dur: 2 }], ...CLIMB.map((_, i) => [10 + i * 1.0, 'tick'] as [number, string]), [14.4, 'tone', { midi: 67 }], [16.4, 'chime', { midi: 72 }]],
  draw(lt) {
    background();
    statement('每条信道，都有一个上限。', 'Every channel has a ceiling.', lt);
    const ka = clamp((lt - 1.0) / 0.8);
    ink([[X0, Y1 - 10], [X0, Y0], [X1 + 10, Y0]], ka, C.fg2, 1.5);
    for (let db = -10; db <= 30; db += 10) text(String(db), px(db), Y0 + 32, { font: F.mono, size: 16, color: C.muted, alpha: ka, align: 'center' });
    for (let c = 2; c <= 10; c += 2) text(String(c), X0 - 14, py(c) + 6, { font: F.mono, size: 16, color: C.muted, alpha: ka, align: 'right' });
    text('S/N (dB)', X1 + 10, Y0 + 62, { font: F.math, size: 18, color: C.fg2, alpha: ka, align: 'right' });
    text('bit / s / Hz', X0 - 8, Y1 - 24, { font: F.math, size: 18, color: C.fg2, alpha: ka, align: 'right' });
    // regions
    const aR = win(lt, 5.4, 18, 0.9, 0.01);
    if (aR > 0) {
      hatch(() => { ctx.moveTo(X0, Y0); for (const [x, y] of CURVE) ctx.lineTo(x, y); ctx.lineTo(X1, Y0); ctx.closePath(); }, C.alt2, aR * 0.45, 10);
      hatch(() => { ctx.moveTo(X0, Y1 - 10); for (const [x, y] of CURVE) ctx.lineTo(x, y); ctx.lineTo(X1, Y1 - 10); ctx.closePath(); }, C.accent, aR * 0.3, 10, Math.PI / 4);
      label('reliable · 可靠', X1 - 20, Y0 - 40, aR * sstep(6.4, 7, lt), C.alt2, 15, 'right');
      label('impossible · 不可能', X0 + 30, Y1 + 30, aR * sstep(7.2, 7.8, lt), C.accent, 15);
    }
    ink(CURVE, clamp((lt - 1.8) / 2.4), C.fg, 2.4);
    // formula
    const kf = sstep(4.0, 4.8, lt);
    text('C = B log₂(1 + S/N)', M, 560, { font: F.math, size: 46, color: C.fg, alpha: kf });
    rule(M, 576, M + 420 * eout(clamp((lt - 4.4) / 0.8)), 576, C.accent, kf, 2);
    label('Channel capacity · 信道容量 · 1948', M, 612, sstep(4.6, 5.2, lt), C.muted, 16);
    text('R < C', M, 690, { font: F.math, style: 'italic', size: 40, color: C.accent, alpha: sstep(8.2, 8.8, lt) });
    text('速率低于容量，就能可靠传输', M + 150, 690, { size: 22, color: C.muted, alpha: sstep(8.4, 9, lt) });
    // the climb, at 10 dB
    const aC = win(lt, 9.8, 18, 0.5, 0.01);
    if (aC > 0) {
      const x = px(10), cmax = cap(10);
      ink([[x, Y0], [x, py(cmax)]], eout(clamp((lt - 9.8) / 0.8)), C.muted, 1, aC, [4, 6]);
      CLIMB.forEach(([yr, name, note, frac], i) => {
        const a = aC * sstep(10 + i, 10.4 + i, lt);
        const y = py(cmax * frac);
        dot(x, y, 5, C.accent, a);
        rule(x + 8, y, x + 40, y, C.muted, a, 1);
        text(yr, x + 48, y + 6, { font: F.latin, size: 16, color: C.muted, alpha: a });
        row(yr, name, note, M + i * 300, 790, a, 72);
      });
    }
  },
});
