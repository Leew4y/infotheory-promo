// Chapter 2: Hardy, 1940 (F-H11): real mathematics is almost wholly "useless"; then what became of his number theory
// after his death (F-H15, F-H16, F-H17, F-H19): the basis of a public-key scheme, written into an Internet security
// standard. No "most useless", and "在他身后" rather than "he did not see" (audit R26); Hardy's own "Time may change all
// this" (F-H13) stays in small print. The refrain does not follow here (that would read as "it became useful, so it is
// valuable"); it follows Hardy's defence on the next page.
import { text, rule, label, background, M, W, C, F, narratedScene, sstep, clamp, vo, voParts } from '../../../engine';
import { bell, verse } from '../lib';

const X0 = M + 40, X1 = W - M - 40, Y = 560;
const at = (year: number) => X0 + ((year - 1940) / (2018 - 1940)) * (X1 - X0);
const NOTE = ['哈代眼中“无用”的数论，', '在他身后成了公钥密码的基础，', '写进了互联网的加密标准。'];

narratedScene({
  name: 'numbers', kind: 'page', chapter: 2, ch: ['无用', ''], split: 16, lead: 0.6, gap: 0.7, tail: 1.2,
  sfx: (at) => [[at('hardy1940'), 'chime', { midi: bell(7) }], [at('ntheory'), 'chime', { midi: bell(8) }]],
  draw(lt) {
    background();
    const t0 = vo('hardy1940'), [, t2, t3] = voParts('ntheory', NOTE);
    const a = sstep(t0, t0 + 0.8, lt);
    text('1940', M, 300, { font: F.mono, size: 26, color: C.accent, alpha: a });
    text('哈代', M + 110, 300, { size: 34, color: C.fg, alpha: a });
    text('G. H. Hardy', M + 200, 300, { font: F.latin, size: 28, color: C.fg2, alpha: a });
    text('真正的数学，几乎完全“无用”', M + 420, 300, { size: 34, color: C.accent, alpha: a });
    verse('7', M - 40, 300, a, 32);
    // the timeline: Hardy's death, the 1978 scheme, the 2018 standard
    const MARKS: [number, string, number][] = [[1940, '哈代：数论“无用”', t0 + 0.6], [1947, '哈代去世', t2 - 0.3], [1978, '公钥密码方案（RSA）', t2 + 0.6], [2018, 'TLS 1.3 标准', t3]];
    const k = clamp((lt - t0) / Math.max(1, t3 + 1 - t0));
    rule(X0, Y, X0 + (X1 - X0) * k, Y, C.rule, 1, 2);
    MARKS.forEach(([year, note, t], i) => {
      const ai = sstep(t, t + 0.6, lt), x = at(year);
      rule(x, Y - 12, x, Y + 12, i === 1 ? C.muted : C.accent, ai, 2);
      const align = i === 3 ? 'right' : i === 0 ? 'left' : 'center';
      text(i === 1 ? `${year} †` : String(year), x, Y - 30, { font: F.mono, size: 24, color: C.fg2, alpha: ai, align });
      text(note, x, i === 1 ? Y - 72 : Y + 56, { size: 26, color: i === 1 ? C.muted : C.fg, alpha: ai, align });
    });
    verse('8', X0 - 50, Y + 8, sstep(t2, t2 + 0.6, lt), 32);
    // the Euler–Fermat identity the 1978 scheme rests on (F-M01), with its condition
    const af = sstep(t2 + 0.8, t2 + 1.6, lt), xf = at(1978) - 150;
    text('M', xf, 440, { font: F.math, style: 'italic', size: 44, color: C.fg, alpha: af });
    text('φ(n)', xf + 44, 420, { font: F.math, style: 'italic', size: 26, color: C.fg, alpha: af });
    text('≡ 1 (mod n)', xf + 104, 440, { font: F.math, size: 44, color: C.fg, alpha: af });
    text('当 gcd(M, n) = 1', xf + 104, 480, { font: F.math, size: 26, color: C.fg2, alpha: af });
    const ah = sstep(t3 + 0.6, t3 + 1.4, lt);
    verse('7', M - 34, 760, ah, 30);
    label('哈代也写过：“时间也许会改变这一切。”（§25）', M, 760, ah, C.fg2, 20);
  },
});
