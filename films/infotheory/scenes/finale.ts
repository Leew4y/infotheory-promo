// 12. Morning over the horizon with the closing lines (a plate), then a page of sources (its own page scene, so it keeps the paper grade).
import { text, label, rule } from '../../../engine/draw';
import { background, plate, M, C, F } from '../../../engine/style';
import { scene } from '../../../engine/scene';
import { clamp, eout, sstep, win, W, H } from '../../../engine/util';
import { BAR } from '../../../engine/film';

const SOURCES: [string, string, string][] = [
  ['1948', 'C. E. Shannon', 'A Mathematical Theory of Communication. Bell System Technical Journal.'],
  ['1950', 'R. W. Hamming', 'Error Detecting and Error Correcting Codes.'],
  ['1951', 'C. E. Shannon', 'Prediction and Entropy of Printed English.'],
  ['1961', 'R. Landauer', 'Irreversibility and Heat Generation in the Computing Process.'],
  ['1973', 'J. D. Bekenstein', 'Black Holes and Entropy.'],
  ['1993', 'C. Berrou, A. Glavieux, P. Thitimajshima', 'Near Shannon Limit Error-Correcting Coding and Decoding: Turbo-Codes.'],
  ['1996', 'D. J. C. MacKay, R. M. Neal', 'Near Shannon Limit Performance of Low Density Parity Check Codes.'],
  ['2009', 'E. Arıkan', 'Channel Polarization: A Method for Constructing Capacity-Achieving Codes.'],
];

scene({
  name: 'morning', kind: 'plate', start: 61, len: 3.2, fi: 0.9, fo: 0.8, fade: C.bg, mb: 3,
  subs: [],
  sfx: [[0, 'swell', { dur: 6 }], [1.6, 'tone', { midi: 64 }], [5.6, 'tone', { midi: 60 }]],
  cam: (lt, d) => ({ z: 1 + (0.035 * lt) / d }),
  draw(lt) {
    plate({ time: lt + 140, light: 0.9, sun: 0.32 });
    const a1 = win(lt, 1.4, 5.2, 0.9, 0.7);
    text('它把不确定，变成可以计算的量。', W / 2, 390, { size: 52, weight: 500, color: C.fgOnDark, alpha: a1, align: 'center', ls: 5 });
    text('It turns uncertainty into a quantity.', W / 2, 448, { font: F.latin, style: 'italic', size: 26, color: C.mutedOnDark, alpha: a1, align: 'center' });
    const a2 = win(lt, 5.6, 9.6, 0.9, 0.6);
    text('1948 年，一篇论文，一门学科。', W / 2, 390, { size: 52, weight: 500, color: C.fgOnDark, alpha: a2, align: 'center', ls: 5 });
    text('One paper in 1948, and a new science.', W / 2, 448, { font: F.latin, style: 'italic', size: 26, color: C.mutedOnDark, alpha: a2, align: 'center' });
  },
});

scene({
  name: 'sources', kind: 'page', start: 64.2, len: 1.8 + 4 / BAR, fi: 0.8, fo: 2.4, mb: 3,
  subs: [],
  sfx: [[0.1, 'page'], ...SOURCES.map((_, i) => [0.6 + i * 0.5, 'tick'] as [number, string]), [6.6, 'chime', { midi: 69 }]],
  cam: (lt, d) => ({ z: 1 + (0.015 * lt) / d }),
  draw(lt) {
    background();
    label('Sources · 参考', M, 132, sstep(0.2, 0.8, lt));
    SOURCES.forEach(([yr, who, what], i) => {
      const a = eout(clamp((lt - 0.6 - i * 0.5) / 0.6));
      const y = 240 + i * 74;
      text(yr, M, y, { font: F.latin, size: 22, color: C.accent, alpha: a });
      text(who, M + 96, y, { font: F.latin, size: 22, color: C.fg, alpha: a });
      text(what, M + 96, y + 30, { font: F.latin, style: 'italic', size: 19, color: C.muted, alpha: a });
    });
    rule(M, H - 150, M + 260 * eout(clamp((lt - 5) / 1.0)), H - 150, C.accent, 1, 1.5);
    text('信息论', M, H - 96, { size: 34, weight: 500, color: C.fg, alpha: sstep(5.2, 6, lt), ls: 6 });
    label('Information theory · the measure of uncertainty', M + 150, H - 98, sstep(5.6, 6.4, lt), C.muted, 15);
  },
});
