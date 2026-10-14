// 1. Chapter 01: Galileo's two lanterns (Discorsi, 1638, pp. 43-44). Proposed at two or three miles; tried only at
// less than a mile; "if not instantaneous, extremely fast". The lights answer each other; no delay can be seen.
import { text, rule, statement, background, C, F, M, scene, clamp, lerp, eio, sstep, win, bars } from '../../../engine';
import { lantern, pulse, dimension, source } from '../kit';

const GROUND = 740, AX = 400, LS = 1.9, LAMP = GROUND - 150 * LS + 5 * LS;
/** B's position: far (two or three miles) during caption 1, near (less than a mile) during caption 2. */
const bx = (lt: number) => lerp(1600, 820, eio(clamp((lt - 6.6) / 1.2)));
/** One exchange starting at t: A opens, its light reaches B, B opens, B's light comes back. */
const EXCH = [2.2, 4.4, 9.2, 11.4];
const TRAVEL = 0.22;

scene({
  name: 'lanterns', kind: 'page', dur: bars(5), mb: 3, chapter: 1, ch: ['灯笼', 'Lanterns'],
  subs: [
    [1, 6.5, '伽利略在 1638 年的书里提议：两人各提一盏灯，相隔两三里，一个开灯，另一个看见就开灯。', 'In 1638 Galileo proposed two lanterns two or three miles apart: one uncovers, the other answers on seeing it.'],
    [7, 13.5, '书中说只在不到一里的距离试过：分不清是否瞬时，“即使不是瞬时，也极快”。', 'The book says it was tried only at less than a mile: no telling whether it was instant; "if not instantaneous, extremely fast".'],
  ],
  sfx: [[0.1, 'page'], ...EXCH.map((t) => [t, 'tick'] as [number, string]), [9.6, 'tone', { midi: 67 }]],
  draw(lt) {
    background();
    statement('先试试看', 'First, try it', lt);
    const a = sstep(0.6, 1.2, lt);
    const x2 = bx(lt);
    // the ground
    rule(300, GROUND, 1760, GROUND, C.rule, a, 1.5);
    // lanterns: open after each exchange step
    let openA = 0, openB = 0;
    for (const t of EXCH) {
      openA = Math.max(openA, win(lt, t, t + 1.4, 0.12, 0.3));
      openB = Math.max(openB, win(lt, t + TRAVEL + 0.08, t + 1.4, 0.12, 0.3));
      pulse(AX, LAMP, x2, LAMP, (lt - t) / TRAVEL, a, undefined, 0.12);
      pulse(x2, LAMP, AX, LAMP, (lt - t - TRAVEL - 0.1) / TRAVEL, a, undefined, 0.12);
    }
    lantern(AX, GROUND, openA, a, LS);
    lantern(x2, GROUND, openB, a, LS);
    text('A', AX, GROUND + 40, { font: F.mono, size: 30, color: C.fg2, alpha: a, align: 'center' });
    text('B', x2, GROUND + 40, { font: F.mono, size: 30, color: C.fg2, alpha: a, align: 'center' });
    // the distance: proposed, then what was tried
    dimension(AX, x2, GROUND + 80, '提议：相隔两三里（miglia）', a * (1 - sstep(6.4, 6.8, lt)), clamp((lt - 1.2) / 0.8));
    dimension(AX, x2, GROUND + 80, '实际只试过：不到一里', sstep(7.8, 8.3, lt), 1);
    // the verdict on the right
    const aq = sstep(9.8, 10.6, lt);
    text('se non instantanea, velocissima', 1060, 330, { font: F.latin, style: 'italic', size: 34, color: C.accent, alpha: aq });
    text('即使不是瞬时，也极快', 1060, 400, { size: 52, weight: 500, color: C.fg, alpha: aq });
    source('1638 · Discorsi · pp. 43-44', sstep(1.4, 2.0, lt));
  },
});
