// Chapter 2: "no longer needed" (F-N23, the strongest first-hand form of the opposing view) is not "meaningless";
// Avigad's answer (F-N25); the counter-argument in full and the film's reply.
import { background, M, COL, W, scene, sstep, win } from '../../../engine';
import { bell, quote, voiceLine } from '../lib';

scene({
  name: 'needed', kind: 'page', dur: 28.5, chapter: 2, ch: ['二〇二六', ''],
  // lines shown verbatim as display text on this page have no caption (the display text is their caption)
  subs: [
    [0.6, 3.07, 'Aaronson 写道：他不再指望，', '10'],
    [3.07, 7.79, '自己还会因为“真正被需要”而证明一个定理。', ''],
    [12.11, 15.58, 'Avigad 写道：无论 AI 能不能思考，', '11'],
    [15.58, 18.05, '它都不能替我们思考。', ''],
    [18.6, 22.82, '反方会说：机器更快，人的投入就是浪费。', '◇'],
  ],
  sfx: [[0.6, 'chime', { midi: bell(10) }], [8.34, 'low', { midi: 38 }], [12.11, 'chime', { midi: bell(11) }], [18.6, 'low', { midi: 33, dur: 1.8 }]],
  draw(lt) {
    background();
    quote(['他不再指望，自己还会因为', '“真正被需要”而证明一个定理。'], ['如果还证明，只会是为了自己或别人的乐趣与启迪。'],
      'Scott Aaronson · Shtetl-Optimized · 2026-09-15', M, 330, win(lt, 0.8, 11.8, 0.8, 0.6), '10', 46, 'film', false);
    voiceLine('不再被需要，不等于没有意义。', W / 2, 760, win(lt, 8.34, 18.0, 0.7, 0.6), 'film', { size: 48, align: 'center', mk: '◇' });
    quote(['无论 AI 能不能思考，', '它都不能替我们思考。'], [], 'Jeremy Avigad · The Future of Mathematics · 2026-10-05', M, 330,
      win(lt, 12.2, 28.0, 0.8, 0.6) * (1 - 0.6 * sstep(18.4, 19.2, lt)), '11', 46);
    quote(['机器更快，', '人的投入就是浪费。'], [], '', COL + 40, 380, sstep(18.7, 19.5, lt), '◇', 46, 'counter');
    voiceLine('也许。可不停止探索，需要的只是这份意义。', W / 2, 760, sstep(22.9, 23.7, lt), 'film', { size: 40, align: 'center', mk: '◇' });
  },
});
