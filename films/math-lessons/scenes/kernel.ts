// Chapter 4: a proof checker is checked too. An AI-assisted "disproof" passed the checker because the checker had a
// bug (F-N04; not "AI fooled Lean"); once False is accepted, anything follows (F-M05). Spoken in v4 for balance: the
// fix came an hour after the report, and a dedicated security AI then helped find more kernel bugs (F-N04, F-N06).
// Then the fourth refrain, shown, and R8's note kept in small print (audit R27).
import { text, label, rule, arrow, ink, background, M, COL, W, C, F, narratedScene, sstep, clamp, vo, voParts } from '../../../engine';
import { bell, verse, voiceLine } from '../lib';

const SX = M + 40, SY = 440;
const TARGETS = ['P', '¬P', '1 = 0', 'Collatz 猜想不成立', '任何命题'];
const K1 = ['7 月，一份 AI 协助生成的“否证”通过了证明检查程序——', '因为程序本身有漏洞。'];

/** A checker's box with a crack in its frame (a bug), cracked by k (0..1). */
function checker(name: string, x: number, y: number, a: number, k: number): void {
  rule(x, y, x + 300, y, C.fg2, a, 1.5);
  rule(x, y + 90, x + 300, y + 90, C.fg2, a, 1.5);
  rule(x, y, x, y + 90, C.fg2, a, 1.5);
  rule(x + 300, y, x + 300, y + 90, C.fg2, a, 1.5);
  text(name, x + 24, y + 56, { size: 30, color: C.fg, alpha: a });
  ink([[x + 230, y], [x + 244, y + 26], [x + 228, y + 50], [x + 246, y + 90]], k, C.accent, 3, a);
}

narratedScene({
  name: 'kernel', kind: 'page', chapter: 4, ch: ['检验', ''], split: 16, lead: 0.6, gap: 0.7, tail: 2.0, shown: ['n27'],
  sfx: (at) => [[at('kernel1'), 'chime', { midi: bell(14) }], [at('kernel2'), 'swell', { dur: 2 }], [at('fixed'), 'chime', { midi: bell(15) }], [at('n27'), 'low', { midi: 38 }]],
  draw(lt) {
    background();
    const [t1, tb] = voParts('kernel1', K1), t2 = vo('kernel2'), t3 = vo('fixed'), t4 = vo('n27');
    const a = sstep(t1, t1 + 0.8, lt);
    checker('Lean 内核', SX, 260, a, clamp((lt - tb) / 1.0));
    checker('nanoda', SX + 360, 260, a, clamp((lt - tb - 0.6) / 1.0));
    label('证明检查程序 · 两个独立的检查器各有一个无关的漏洞（2026-07）', SX, 230, a, C.muted, 18);
    verse('14', SX - 40, 230, a, 32);
    const b = sstep(t2, t2 + 0.6, lt) * (1 - 0.65 * sstep(t4 - 0.3, t4 + 0.5, lt));
    text('⊢ False', SX, SY + 120, { font: F.math, size: 60, color: C.accent, alpha: b });
    TARGETS.forEach((s, i) => {
      const k = clamp((lt - t2 - 0.2 - i * 0.25) / 0.6), ty = SY + 20 + i * 52;
      arrow(SX + 250, SY + 100, COL - 40 + 120 * k, ty, C.fg2, b * k, 1.4, 8);
      text(s, COL + 100, ty + 8, { font: s.length > 3 ? F.body : F.math, size: 28, color: C.fg, alpha: b * k });
    });
    const c = sstep(t3, t3 + 0.8, lt);
    verse('15', M - 34, 880, c, 30);
    text('报告一小时后推出修复；独立检查仍然有效，但两边都要用最新版本；后来，一个专门的安全 AI 帮 Lean 团队找出了更多内核错误。', M, 880, { size: 21, color: C.fg2, alpha: c });
    voiceLine('公布，不等于检验。', W / 2, 750, sstep(t4, t4 + 0.75, lt), 'film', { size: 50, align: 'center', mk: '◇' });
    const d = sstep(t4 + 1.6, t4 + 2.4, lt);
    text('要紧的是独立，不一定是人工。', W / 2, 810, { size: 32, color: C.fg2, alpha: d, align: 'center' });
    verse('◇', M - 34, 916, d, 30);
    text('还要核对：形式化的命题是不是原来的问题；新颖与重要，另行判断。', M, 916, { size: 21, color: C.fg2, alpha: d });
  },
});
