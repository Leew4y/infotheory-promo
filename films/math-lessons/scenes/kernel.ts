// Chapter 4: a proof checker is checked too. An AI-assisted "disproof" passed Lean by exploiting a kernel bug
// (F-N04); once False is accepted, anything follows (F-M05). Small print: fixed an hour after the report, independent
// checking still works with current versions of both checkers, and a security AI then found more kernel bugs
// (F-N04, F-N05, F-N06). Then the fourth refrain.
import { text, label, rule, arrow, ink, background, M, COL, W, C, F, scene, sstep, clamp } from '../../../engine';
import { bell, verse, voiceLine } from '../lib';

const SX = M + 40, SY = 440;
const TARGETS = ['P', '¬P', '1 = 0', 'Collatz 猜想不成立', '任何命题'];

/** A checker's box with a crack in its frame (a bug), cracked by k (0..1). */
function checker(name: string, x: number, y: number, a: number, k: number): void {
  rule(x, y, x + 300, y, C.fg2, a, 1.5);
  rule(x, y + 90, x + 300, y + 90, C.fg2, a, 1.5);
  rule(x, y, x, y + 90, C.fg2, a, 1.5);
  rule(x + 300, y, x + 300, y + 90, C.fg2, a, 1.5);
  text(name, x + 24, y + 56, { size: 30, color: C.fg, alpha: a });
  ink([[x + 230, y], [x + 244, y + 26], [x + 228, y + 50], [x + 246, y + 90]], k, C.accent, 3, a);
}

scene({
  name: 'kernel', kind: 'page', dur: 21.0, chapter: 4, ch: ['检验', ''],
  // lines shown verbatim as display text on this page have no caption (the display text is their caption)
  subs: [
    [0.6, 4.07, '7 月，一份 AI 协助生成的“否证”', '16'],
    [4.07, 6.29, '通过了 Lean 的检查——', ''],
    [6.29, 8.76, '它利用了内核的漏洞。', ''],
    [8.76, 11.48, '接受了“假”，就能“证明”一切。', ''],
    [14.0, 17.22, '要紧的是独立，不一定是人工。', '◇'],
  ],
  sfx: [[0.6, 'chime', { midi: bell(16) }], [8.8, 'swell', { dur: 2 }], [12.03, 'low', { midi: 38 }], [17.4, 'chime', { midi: bell(17) }]],
  draw(lt) {
    background();
    const a = sstep(0.6, 1.4, lt);
    checker('Lean 内核', SX, 260, a, clamp((lt - 6.3) / 1.0));
    checker('nanoda', SX + 360, 260, a, clamp((lt - 6.9) / 1.0));
    label('两个独立的检查器 · 各有一个无关的漏洞（2026-07）', SX, 230, a, C.muted, 18);
    verse('16', SX - 40, 230, a, 32);
    const b = sstep(8.8, 9.4, lt);
    text('⊢ False', SX, SY + 120, { font: F.math, size: 60, color: C.accent, alpha: b });
    TARGETS.forEach((t, i) => {
      const k = clamp((lt - 9.0 - i * 0.25) / 0.6), ty = SY + 20 + i * 52;
      arrow(SX + 250, SY + 100, COL - 40 + 120 * k, ty, C.fg2, b * k, 1.4, 8);
      text(t, COL + 100, ty + 8, { font: t.length > 3 ? F.body : F.math, size: 28, color: C.fg, alpha: b * k });
    });
    voiceLine('公布，不等于检验。', W / 2, 790, sstep(12.03, 12.8, lt), 'film', { size: 46, align: 'center', mk: '◇' });
    const c = sstep(17.4, 18.2, lt);
    verse('17', M - 40, 860, c, 30);
    text('报告一小时后修复；独立检查仍然有效，但两边都要用最新版本；后来，一个专门的安全 AI 帮 Lean 团队找出了更多内核错误。', M, 860, { size: 21, color: C.fg2, alpha: c });
  },
});
