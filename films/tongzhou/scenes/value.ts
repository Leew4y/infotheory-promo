// The opening value card (the organiser's mid-event notice): four rows, each 「题目或现有做法 → 新增能力 → 价值」,
// landing on the narration line that speaks it; the cost against both baselines along the bottom.
// Every figure is copied from the README table 「比题目和现有做法多做了什么」 (frozen rerun, mock data).
import { planScene, copy, background, text, rule, vo, C, sstep, eout, clamp } from '../../../engine';
import { T, block, mockTag } from '../lib';

const COLS = [{ x: 150, w: 440 }, { x: 640, w: 520 }, { x: 1210, w: 560 }];
const ROWS = [
  { k: 'r1', line: 'o2', y: 384 },
  { k: 'r2', line: 'o3', y: 502 },
  { k: 'r3', line: 'o4', y: 620 },
  { k: 'r4', line: 'o5', y: 706 },
];

planScene('value', {
  draw(lt) {
    background();
    const a0 = sstep(0.1, 0.7, lt);
    text(copy('value', 'head'), 150, 232, { size: T.head, weight: 700, color: C.fg, alpha: a0 });
    mockTag(copy('value', 'mock'), a0);
    (['colFrom', 'colNew', 'colValue'] as const).forEach((key, i) =>
      text(copy('value', key), COLS[i].x, 312, { size: T.small, weight: 500, color: C.muted, alpha: a0 }));
    rule(150, 334, 1770, 334, C.rule, a0, 1.5);
    for (const r of ROWS) {
      const t = vo(r.line) - 0.2, a = sstep(t, t + 0.6, lt), rise = (1 - eout(clamp((lt - t) / 0.6))) * 10;
      block(copy('value', `${r.k}From`), COLS[0].x, r.y + rise, COLS[0].w, { size: T.small, color: C.muted, alpha: a, lh: 32 });
      block(copy('value', `${r.k}New`), COLS[1].x, r.y + rise, COLS[1].w, { size: T.small + 2, weight: 500, color: C.fg, alpha: a, lh: 34 });
      const below = block(copy('value', `${r.k}Value`), COLS[2].x, r.y + rise, COLS[2].w, { size: T.small + 2, weight: 700, color: C.accent, alpha: a, lh: 34 });
      if (r.k === 'r1' || r.k === 'r4') text(copy('value', `${r.k}Note`), COLS[2].x, below + 2, { size: 19, color: C.muted, alpha: a });
    }
    const tc = vo('o5') + 0.4, ac = sstep(tc, tc + 0.6, lt);
    rule(150, 800, 1770, 800, C.rule, ac, 1.5);
    text(copy('value', 'cost'), 150, 852, { size: T.body, weight: 700, color: C.fg, alpha: ac });
  },
});
