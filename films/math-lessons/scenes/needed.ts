// Chapter 2: "no longer needed" (F-N23, the strongest first-hand form of the opposing view) is not "meaningless";
// Avigad's answer (F-N25); then the counter-argument in its strongest form (meaning alone does not decide how limited
// funds and posts are allocated) and the film's concession and narrower claim (revisions.md R9).
import { background, M, COL, W, scene, sstep, win, placeNarration } from '../../../engine';
import { bell, quote, voiceLine } from '../lib';

// spoken lines (narration.json) where their text first appears on screen
placeNarration(scene({
  name: 'needed', kind: 'page', dur: 32.5, chapter: 2, ch: ['二〇二六', ''],
  // lines shown verbatim as display text on this page have no caption (the display text is their caption)
  subs: [
    [0.5, 2.95, 'Aaronson 写道：他不再指望，', '10'],
    [2.95, 7.65, '自己还会因为“真正被需要”而证明一个定理。', ''],
    [11.75, 15.2, 'Avigad 写道：无论 AI 能不能思考，', '11'],
    [15.2, 17.65, '它都不能替我们思考。', ''],
  ],
  sfx: [[0.5, 'chime', { midi: bell(10) }], [8.1, 'low', { midi: 38 }], [11.75, 'chime', { midi: bell(11) }], [18.1, 'low', { midi: 33, dur: 1.8 }]],
  draw(lt) {
    background();
    quote(['他不再指望，自己还会因为', '“真正被需要”而证明一个定理。'], ['如果还证明，只会是为了自己或别人的乐趣与启迪。'],
      'Scott Aaronson · Shtetl-Optimized · 2026-09-15', M, 330, win(lt, 0.7, 11.5, 0.8, 0.6), '10', 46, 'film', false);
    voiceLine('不再被需要，不等于没有意义。', W / 2, 760, win(lt, 8.1, 17.9, 0.7, 0.6), 'film', { size: 48, align: 'center', mk: '◇' });
    quote(['无论 AI 能不能思考，', '它都不能替我们思考。'], [], 'Jeremy Avigad · The Future of Mathematics · 2026-10-05', M, 330,
      win(lt, 11.8, 32.0, 0.8, 0.6) * (1 - 0.6 * sstep(17.9, 18.7, lt)), '11', 46);
    quote(['人做数学有意义，', '也不能单凭这一点，', '决定有限的经费与岗位怎样分配。'], [], '', COL + 40, 380, sstep(18.2, 19.0, lt), '◇', 46, 'counter');
    voiceLine('这是真的。本片只说：不应因此停止探索。', W / 2, 760, sstep(27.4, 28.2, lt), 'film', { size: 40, align: 'center', mk: '◇' });
  },
}), { n12: 0.5, n13: 8.1, n14: 11.75, n15: 18.2, n16: 27.4 });
