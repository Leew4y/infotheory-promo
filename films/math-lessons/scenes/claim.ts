// Chapter 1, the hook (v4): OpenAI announced a solution of a Millennium Prize problem, the Navier–Stokes equation
// (F-N07; only "announced"), each problem carries a million-dollar prize (F-H22, S24) which OpenAI says it will not
// claim (F-N10), and Clay said the problem appears to be solved (F-N11; "apparently" is never "clearly" or
// "confirmed"). The page shows the equation itself, the prize as a number, and the two statements as short tags.
import { text, label, rule, measure, background, M, COL, C, F, narratedScene, sstep, vo, voParts } from '../../../engine';
import { bell, count, verse } from '../lib';

narratedScene({
  name: 'claim', kind: 'page', chapter: 1, ch: ['题目', ''], split: 16, lead: 0.6, gap: 0.7, tail: 1.2,
  sfx: (at) => [[at('claim1'), 'chime', { midi: bell(1) }], [at('claim2'), 'chime', { midi: bell(2) }]],
  draw(lt) {
    background();
    const t1 = vo('claim1'), t2 = vo('claim2');
    const a = sstep(t1 - 0.4, t1 + 0.4, lt);
    label('千禧年难题之一 · 纳维–斯托克斯方程', M, 250, a, C.muted, 20);
    verse('1', M - 40, 250, a, 32);
    // the equation (incompressible Navier–Stokes with a force f): the object of the problem
    const e = sstep(t1 + 0.3, t1 + 1.3, lt);
    const it = { font: F.math, style: 'italic' as const, color: C.fg, alpha: e };
    const fw = Math.max(measure('∂u', 44, F.math), measure('∂t', 44, F.math));
    text('∂u', M + fw / 2, 342, { ...it, size: 44, align: 'center' });
    rule(M, 358, M + fw, 358, C.fg, e, 2);
    text('∂t', M + fw / 2, 404, { ...it, size: 44, align: 'center' });
    text('+ (u·∇)u = νΔu − ∇p + f', M + fw + 18, 386, { ...it, size: 54 });
    text('∇·u = 0', M, 470, { ...it, size: 42, color: C.fg2 });
    // the prize (F-H22): 100 (万美元) settling digit by digit while the sentence names it
    count('100', '万美元 · 每题', COL + 60, 680, lt, t1 + 2.6, 1.6, sstep(t1 + 2.2, t1 + 2.9, lt), 120);
    label('OpenAI 表示无意申领奖金', COL + 60, 740, sstep(t1 + 4.0, t1 + 4.8, lt), C.muted, 18);
    // the two statements, as tags (the captions carry the words)
    const b = sstep(t1 + 1.0, t1 + 1.8, lt), c = sstep(t2, t2 + 0.8, lt);
    text('OpenAI 宣布：给出了一个解', M, 640, { size: 34, color: C.fg, alpha: b });
    label('2026-09-08 · 附 Lean 形式化', M, 684, b, C.muted, 18);
    // "评审，刻意不急" as large as the claim it qualifies (PR #9 review: small print tilted the opening toward "solved")
    const [, tc] = voParts('claim2', ['出题的 Clay 研究所说：问题看来已经解决；', '评审，刻意不急。']);
    text('Clay 研究所：问题看来已经解决', M, 770, { size: 34, color: C.accent, alpha: c });
    text('评审，刻意不急', M, 822, { size: 34, color: C.fg, alpha: sstep(tc - 0.1, tc + 0.6, lt) });
    label('2026-09-11', M, 862, c, C.muted, 18);
    verse('2', M - 40, 770, c, 32);
  },
});
