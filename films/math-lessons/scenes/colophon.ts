// The closing index: every verse number shown in the film, with its source (script/storyboard.md, research/sources.md),
// then the credit.
import { text, label, rule, background, M, W, C, F, scene, sstep } from '../../../engine';
import { bell } from '../lib';

const ENTRIES: string[] = [
  'Fontenelle，科学院 1699 年卷序言；1742 年《全集》第五卷 p. 1',
  '同上 p. 9；Huygens《摆钟论》，1673',
  'Huygens《摆钟论》第二部分，命题 XXV',
  'Fontenelle p. 9–11；Russell 1907；Flexner 1939，p. 545',
  'Hardy《一个数学家的辩白》，1940，§21',
  'Hardy，同上，§29',
  'RSA，CACM 1978；RFC 8446；Hardy 卒年：Cain 注释本',
  'OpenAI，github.com/openai/math，2026-10-06',
  '同上 README；OpenAI，2026-09-08',
  'Aaronson，Shtetl-Optimized，2026-09-15',
  'Avigad，The Future of Mathematics，2026-10-05',
  'Fefferman，Clay 千禧年难题题面，2000',
  'OpenAI，2026-09-08；Clay 研究所，2026-09-11',
  'Silvestre，《科学美国人》，2026-09-21',
  'openai/math，history.md，2026-10-07',
  'de Moura，Lean 内核漏洞复盘，2026-08-01',
  '同上；leanprover/lean4 #14576',
  'Russell，The Study of Mathematics，1907',
];

scene({
  name: 'colophon', kind: 'page', dur: 11.0, fi: 0.8, fo: 1.6,
  subs: [],
  sfx: [[0.5, 'chime', { midi: bell(1) }]],
  cam: () => ({ z: 1 }),
  draw(lt) {
    background();
    const a = sstep(0.4, 1.2, lt);
    text('索引', M, 170, { size: 40, color: C.fg, alpha: a, ls: 8 });
    rule(M, 196, M + 60, 196, C.accent, a, 1.5);
    const colW = (W - 2 * M) / 2;
    ENTRIES.forEach((e, i) => {
      const col = Math.floor(i / 9), row = i % 9;
      const x = M + col * colW, y = 270 + row * 54, ai = sstep(0.8 + i * 0.06, 1.3 + i * 0.06, lt);
      text(String(i + 1), x + 24, y, { font: F.mono, size: 20, color: C.accent, alpha: ai, align: 'right' });
      text(e, x + 48, y, { size: 20, color: C.fg2, alpha: ai });
    });
    label('出处细节与核查状态：research/sources.md、research/facts.md', M, 790, sstep(3.4, 4.2, lt), C.muted, 18);
    text('本片由 Develata 主制', W / 2, 900, { size: 34, color: C.fg, alpha: sstep(4.5, 5.5, lt), align: 'center', ls: 4 });
  },
});
