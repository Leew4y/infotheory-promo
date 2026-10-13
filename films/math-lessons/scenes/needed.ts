// Chapter 3: "no longer needed" (F-N23, by role in the voice, named on the page; his second half shown, F-N23/F-N24)
// is not "meaningless"; Avigad's answer (F-N25, by role in the voice); then the counter-argument in its strongest form
// (meaning alone does not decide how limited funds and posts are allocated) and the film's concession and narrower
// claim (revisions.md R9). Quotes, refrain and counter-argument are shown verbatim (no captions).
import { background, M, COL, W, narratedScene, sstep, win, vo } from '../../../engine';
import { bell, quote, voiceLine } from '../lib';

narratedScene({
  name: 'needed', kind: 'page', chapter: 3, ch: ['被需要', ''], lead: 0.6, gap: 0.7, tail: 1.6,
  shown: ['aaronson', 'n13', 'avigad', 'n15', 'n16'],
  sfx: (at) => [[at('aaronson'), 'chime', { midi: bell(10) }], [at('n13'), 'low', { midi: 38 }], [at('avigad'), 'chime', { midi: bell(11) }], [at('n15'), 'low', { midi: 33, dur: 1.8 }]],
  draw(lt) {
    background();
    const ta = vo('aaronson'), tr = vo('n13'), tv = vo('avigad'), tc = vo('n15'), tf = vo('n16');
    quote(['他不再指望，自己还会因为', '“真正被需要”而证明一个定理。'], ['如果还证明，只会是为了自己或别人的乐趣与启迪。', '部分出于对 AI 失配的担忧，他仍想让“洞见与理解”留在数学的中心，能留多久就留多久。'],
      '理论计算机科学家 Scott Aaronson · Shtetl-Optimized · 2026-09-15', M, 330, win(lt, ta, tv - 0.3, 0.8, 0.6), '10', 46, 'film', false);
    voiceLine('不再被需要，不等于没有意义。', W / 2, 780, win(lt, tr, tv + 6.0, 0.7, 0.6), 'film', { size: 50, align: 'center', mk: '◇' });
    quote(['无论 AI 能不能思考，', '它都不能替我们思考。'], [], 'Jeremy Avigad · 卡内基梅隆大学 ICARM 主任 · The Future of Mathematics · 2026-10-05', M, 330,
      win(lt, tv, 1e9, 0.8, 0.6) * (1 - 0.6 * sstep(tc - 0.2, tc + 0.6, lt)), '11', 46);
    quote(['人做数学有意义，', '也不能单凭这一点，', '决定有限的经费与岗位怎样分配。'], [], '', COL + 40, 380, sstep(tc, tc + 0.8, lt), '◇', 44, 'counter');
    voiceLine('这是真的。本片只说：不应因此停止探索。', W / 2, 780, sstep(tf, tf + 0.8, lt), 'film', { size: 42, align: 'center', mk: '◇' });
  },
});
