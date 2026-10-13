// Chapter 1: the two roads of the Clay statement (F-M04; audit R22). The voice paraphrases (no force: every admissible
// flow stays smooth for all time; or find one flow and a smooth force that make it break down in finite time); the
// page gives the four statements exactly: (A) R³ and (B) periodic with f ≡ 0, for every admissible initial velocity;
// (C) R³ and (D) periodic, some admissible initial velocity and some smooth f with no smooth solution for all time.
// Each column lights as its road is spoken; at "机器走的是第二条" the breakdown column is marked: OpenAI announced it had
// established (C) and also (D) (F-N07, S7b). The film does not judge the proof.
import { text, label, rule, background, M, C, F, W, narratedScene, sstep, clamp, eout, vo, voParts } from '../../../engine';
import { bell, verse, voiceLine } from '../lib';

const X0 = M, X1 = W - M, Y0 = 250, ROW = 170, HEAD = 96, LEFT = 300;
const COLW = (X1 - X0 - LEFT) / 2;
const ROAD1 = '要么证明，没有外力时，任何合乎条件的水流都永远不会“破裂”；', ROAD2 = '要么找到一种水流，再配一个光滑的外力，让它在有限时间里“破裂”。';

narratedScene({
  name: 'paths', kind: 'page', chapter: 1, ch: ['题目', ''], split: 16, lead: 0.6, gap: 0.6, tail: 2.0,
  sfx: (at) => [[at('paths'), 'chime', { midi: bell(3) }], [at('second'), 'tone', { midi: 69 }]],
  draw(lt) {
    background();
    const [r1, r2] = voParts('paths', [ROAD1, ROAD2]), t2 = vo('second');
    const a = sstep(0.3, 1.1, lt);
    label('Clay 千禧年难题 · 纳维–斯托克斯方程 · 题面（Fefferman，2000）· 四个命题，证明任意一个即可', X0, Y0 - 40, a, C.muted, 18);
    verse('3', X0 - 40, Y0 - 40, a, 32);
    // column heads, each lit as its road is spoken
    const heads: [string, string, number][] = [['没有外力', '任意合乎条件的初始水流，光滑解永远存在', r1], ['可选光滑外力', '存在一种初始水流，光滑解在有限时间破裂', r2]];
    heads.forEach(([h, sub, t], i) => {
      const x = X0 + LEFT + i * COLW + 24, ha = sstep(t - 0.2, t + 0.6, lt);
      text(h, x, Y0 + 46, { size: 34, color: C.fg, alpha: Math.max(0.35 * a, ha), ls: 3 });
      text(sub, x, Y0 + 80, { size: 20, color: C.fg2, alpha: Math.max(0.35 * a, ha) });
    });
    ['R³', 'R³ / Z³（周期）'].forEach((d, j) => text(d, X0, Y0 + HEAD + j * ROW + 100, { font: F.math, size: 36, color: C.fg2, alpha: a }));
    rule(X0, Y0 + HEAD, X1, Y0 + HEAD, C.rule, a, 1.5);
    rule(X0 + LEFT, Y0, X0 + LEFT, Y0 + HEAD + 2 * ROW, C.rule, a, 1.5);
    rule(X0 + LEFT + COLW, Y0, X0 + LEFT + COLW, Y0 + HEAD + 2 * ROW, C.rule, a, 1.5);
    rule(X0, Y0 + HEAD + ROW, X1, Y0 + HEAD + ROW, C.rule, a, 1);
    ['(A)', '(B)', '(C)', '(D)'].forEach((k, n) => {
      const col = n >> 1, row = n & 1, x = X0 + LEFT + col * COLW + 24, y = Y0 + HEAD + row * ROW;
      const ca = sstep((col ? r2 : r1) + 0.3 + row * 0.3, (col ? r2 : r1) + 1.1 + row * 0.3, lt);
      text(k, x, y + 56, { font: F.latin, size: 30, color: C.muted, alpha: ca });
      if (col === 0) text('f ≡ 0', x, y + 126, { font: F.math, style: 'italic', size: 48, color: C.accent, alpha: ca });
      else {
        text('光滑的', x, y + 126, { size: 36, color: C.fg, alpha: ca });
        text('f', x + 120, y + 126, { font: F.math, style: 'italic', size: 48, color: C.accent, alpha: ca });
      }
    });
    // the second road: OpenAI announced it had established (C) and also (D)
    const k = eout(clamp((lt - t2) / 0.8));
    if (k > 0) {
      const x = X0 + LEFT + COLW, y = Y0 + HEAD;
      rule(x + 6, y + 6, x + 6 + (COLW - 12) * k, y + 6, C.accent, 1, 3);
      rule(x + 6, y + 2 * ROW - 6, x + 6 + (COLW - 12) * k, y + 2 * ROW - 6, C.accent, 1, 3);
      label('OpenAI 宣布：成立 (C)，也成立 (D)', x + COLW - 24, y + 56, sstep(t2 + 0.4, t2 + 1.2, lt), C.accent, 18, 'right');
      verse('1', x + COLW - 24 - 380, y + 56, sstep(t2 + 0.4, t2 + 1.2, lt), 28);
    }
    const g = sstep(r2 + 1.5, r2 + 2.3, lt);
    label('“破裂”：光滑解在有限时间内不再存在（出现奇点）', X0, Y0 + HEAD + 2 * ROW + 50, g, C.fg2, 20);
    voiceLine('本片不判断这个证明的对错。', X0 + 40, Y0 + HEAD + 2 * ROW + 104, sstep(t2 + 1.2, t2 + 2.0, lt), 'film', { size: 24, mk: '◇' });
  },
});
