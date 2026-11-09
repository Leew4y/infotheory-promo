// The result card: both baselines side by side, never one alone (AGENTS.md of 1010-ai-hackathon); figures from
// README 主表 (results/sweep_100_seeds_pharmacy_pyvrp_server_2026-10-11.json, mock data).
import { planScene, copy, background, text, rule, vo, C, F, sstep, eout, clamp } from '../../../engine';
import { T, block, mockTag } from '../lib';

const SIDES = [{ k: 'a', line: 's1', x: 150 }, { k: 'b', line: 's2', x: 990 }];

planScene('result', {
  draw(lt) {
    background();
    const a0 = sstep(0.1, 0.7, lt);
    text(copy('result', 'head'), 150, 232, { size: T.head, weight: 700, color: C.fg, alpha: a0 });
    mockTag(copy('result', 'mock'), a0);
    for (const s of SIDES) {
      const t = vo(s.line) - 0.2, a = sstep(t, t + 0.7, lt), rise = (1 - eout(clamp((lt - t) / 0.7))) * 12;
      text(copy('result', `${s.k}Label`), s.x, 350, { size: T.body, weight: 500, color: C.muted, alpha: a });
      text(copy('result', `${s.k}Value`), s.x, 500 + rise, { font: F.latin, size: T.figure, weight: 700, color: s.k === 'a' ? C.accent : C.fg, alpha: a, ls: -2 });
      block(copy('result', `${s.k}Detail`), s.x, 580, 720, { size: T.small + 2, color: C.fg, alpha: a, lh: 36 });
    }
    rule(150, 760, 1770, 760, C.rule, a0, 1.5);
    text(copy('result', 'source'), 150, 806, { font: F.mono, size: 18, color: C.muted, alpha: a0 });
    text(copy('result', 'ontime'), 150, 840, { size: 20, color: C.muted, alpha: a0 }); // #243：「准时」的口径
  },
});
