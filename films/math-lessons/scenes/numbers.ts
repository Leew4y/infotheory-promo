// Chapter 1: what became of Hardy's "useless" number theory (F-H11, F-H15, F-H16, F-H17, F-H19): it became the basis
// of a public-key scheme after his death. Hardy had said "at present at any rate" and "Time may change all this"
// (F-H13), shown in small print: the change happened, it is not presented as Hardy refuted (revisions.md R7). The
// refrain does not follow here (that would read as "it became useful, so it is valuable"); it follows Hardy's defence.
import { text, rule, label, background, M, W, C, F, scene, sstep, clamp, placeNarration } from '../../../engine';
import { bell, verse } from '../lib';

const X0 = M + 40, X1 = W - M - 40, Y = 520;
const at = (year: number) => X0 + ((year - 1940) / (2018 - 1940)) * (X1 - X0);
const MARKS: [number, string, number][] = [[1940, 'Hardy：数论“无用”', 0.7], [1947, 'Hardy 去世', 3.0], [1978, '公钥密码方案（RSA）', 3.8], [2018, 'TLS 1.3 标准', 6.4]];

// spoken lines (narration.json) where their text first appears on screen
placeNarration(scene({
  name: 'numbers', kind: 'page', dur: 10.5, chapter: 1, ch: ['无用', ''],
  subs: [
    [0.5, 2.95, 'Hardy 眼中“无用”的数论，', '7'],
    [2.95, 6.4, '在他身后成了公钥密码的基础，', ''],
    [6.4, 9.35, '写进了互联网的加密标准。', ''],
  ],
  sfx: [[0.5, 'chime', { midi: bell(7) }]],
  draw(lt) {
    background();
    const k = clamp((lt - 0.5) / 6.4);
    rule(X0, Y, X0 + (X1 - X0) * k, Y, C.rule, 1, 2);
    verse('7', X0 - 50, Y + 8, sstep(0.5, 1.1, lt), 32);
    MARKS.forEach(([year, note, t], i) => {
      const a = sstep(t, t + 0.6, lt), x = at(year);
      rule(x, Y - 12, x, Y + 12, i === 1 ? C.muted : C.accent, a, 2);
      // 1947 sits close to 1940: its year and note both go above the line, the others' notes below
      const align = i === 3 ? 'right' : i === 0 ? 'left' : 'center';
      text(i === 1 ? `${year} †` : String(year), x, Y - 30, { font: F.mono, size: 24, color: C.fg2, alpha: a, align });
      text(note, x, i === 1 ? Y - 72 : Y + 56, { size: 24, color: i === 1 ? C.muted : C.fg, alpha: a, align });
    });
    // the Euler–Fermat identity the 1978 scheme rests on (F-M01), with its condition: M and n coprime
    const af = sstep(4.4, 5.2, lt), xf = at(1978) - 150;
    text('M', xf, 400, { font: F.math, style: 'italic', size: 44, color: C.fg, alpha: af });
    text('φ(n)', xf + 44, 380, { font: F.math, style: 'italic', size: 26, color: C.fg, alpha: af });
    text('≡ 1 (mod n)', xf + 104, 400, { font: F.math, size: 44, color: C.fg, alpha: af });
    text('当 gcd(M, n) = 1', xf + 104, 440, { font: F.math, size: 26, color: C.fg2, alpha: af });
    const ah = sstep(6.6, 7.4, lt);
    verse('5', M - 34, 700, ah, 30);
    label('Hardy 也写过：“时间也许会改变这一切。”（§25）', M, 700, ah, C.fg2, 20);
  },
}), { n06: 0.5 });
