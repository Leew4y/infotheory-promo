// The closing index: every verse number shown in the film, with its source (script/narration.v4.md,
// research/sources.md), and the key: a numbered line has a source, an unnumbered one is the film's judgement (v4: the
// ◇ mark is no longer drawn), the essay's lines are named as such. No credit line: per Develata (2026-10-10) the film carries no name, so it can circulate freely.
import { text, label, rule, background, M, W, C, F, scene, sstep } from '../../../engine';
import { bell } from '../lib';

const ENTRIES: string[] = [
  'OpenAI，纳维–斯托克斯公告，2026-09-08（含无意申领奖金）',
  'Clay 研究所声明，2026-09-11；奖金：Clay 千禧年难题页',
  'Fefferman，Clay 千禧年难题题面，2000',
  'Silvestre，《科学美国人》，2026-09-21',
  'Córdoba，同一报道',
  'Fontenelle，科学院 1699 年卷序言；1742 年《全集》第五卷 p. 1',
  'Hardy《一个数学家的辩白》，1940，§21、§25',
  'RSA，CACM 1978；RFC 8446 §9.1；Hardy 卒年：Cain 注释本',
  'Hardy，同上，§29',
  'Aaronson，Shtetl-Optimized，2026-09-15',
  'Avigad，The Future of Mathematics，2026-10-05',
  'OpenAI，github.com/openai/math，2026-10-06',
  'openai/math，history.md，2026-10-07',
  'de Moura，Lean 内核漏洞复盘，2026-08-01',
  '同上；leanprover/lean4 #14576',
  'Russell，The Study of Mathematics，1907',
];

scene({
  name: 'colophon', kind: 'page', dur: 6.5, fi: 0.6, fo: 1.2,
  subs: [],
  sfx: [[0.4, 'chime', { midi: bell(1) }]],
  cam: () => ({ z: 1 }),
  draw(lt) {
    background();
    const a = sstep(0.3, 0.9, lt);
    text('索引', M, 160, { size: 40, color: C.fg, alpha: a, ls: 8 });
    rule(M, 186, M + 60, 186, C.accent, a, 1.5);
    const colW = (W - 2 * M) / 2;
    ENTRIES.forEach((e, i) => {
      const col = Math.floor(i / 8), row = i % 8;
      const x = M + col * colW, y = 262 + row * 58, ai = sstep(0.5 + i * 0.04, 1.0 + i * 0.04, lt);
      text(String(i + 1), x + 24, y, { font: F.mono, size: 22, color: C.accent, alpha: ai, align: 'right' });
      text(e, x + 48, y, { size: 22, color: C.fg2, alpha: ai });
    });
    label('页边数字是出处编号；没有编号的句子，是本片的判断与思辨。', M, 776, sstep(2.0, 2.6, lt), C.fg2, 20);
    label('出自一篇随笔的：开头两句；“什么值得我去做？”与“随笔设想”一段；“然后有一天，我们把火递了出去”。', M, 812, sstep(2.2, 2.8, lt), C.fg2, 20);
  },
});
