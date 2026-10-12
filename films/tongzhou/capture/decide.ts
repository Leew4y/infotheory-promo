// Recording of the product's 「方案」 page (web/ of the 1010-ai-hackathon repo, Vite dev server) for the scene `decide`:
// scenario 「演示批次 1 · 30 家门店（模拟数据）」, route chips R02 then R03 (the map frames the chosen vehicle, colours only
// its route, and every stop carries its arrival time and leg km/min), a stop of the cargo strip, the small 3D truck coloured
// by stop, then the schedule rows (one row per vehicle; the panel scrolls inside itself).
//   cd <product>/web && bun run dev --port 5190 --host 127.0.0.1      (any free port; set it in PORT below)
//   bun scripts/capture.ts --film tongzhou --id decide films/tongzhou/capture/decide.ts
// Viewport 1752x736 = 2.38 : 1, the aspect of the keynote demo area (1620x680); 736 px is the least height at which the front end's one-screen
// plan page still shows its 3D truck (below it the plan and loading pages hide or shrink it).
// (a Scenario, scripts/lib/scenario.ts; films may not import scripts, so the type is not named here)
import { driver } from './lib';

const PORT = 5190;
const SCENARIO = '演示批次 1 · 30 家门店（模拟数据）';
const chip = (r: string) => `button.route-chip:has-text("${r}")`;

export default {
  url: `http://127.0.0.1:${PORT}/#/plan?scenario=kernel-seed1&route=R01`,
  viewport: { width: 1752, height: 736 },
  async run(act: any) { // act: scripts/lib/scenario.ts Act
    const d = driver(act);
    const p = d.page;
    await p.getByText(SCENARIO).first().waitFor({ state: 'visible', timeout: 15000 });
    await p.locator(chip('R03')).waitFor({ state: 'visible', timeout: 15000 });
    await p.getByText('配送时序').first().waitFor({ state: 'visible', timeout: 15000 });
    await p.waitForTimeout(2500); // the 3D truck loads lazily
    d.mark('start');
    await d.glide(560, 330, 500);
    await d.wait(200);
    await d.click(chip('R02'), { ms: 600 });
    await d.wait(1500);
    d.mark('r02');
    await d.click(chip('R03'), { ms: 500 });
    await d.wait(1500);
    d.mark('r03');
    // a stop of the cargo strip: its boxes on the truck
    await d.click('.truck-seg >> nth=1', { ms: 700 });
    await d.wait(900);
    d.mark('stop2');
    await d.glide(1400, 440, 600); // over the 3D truck
    await d.wait(500);
    d.mark('schedule');
    // the schedule is a panel with its own scroll: R01 … R06 (the page itself does not scroll at this height)
    await d.glide(900, 660, 600);
    await d.scrollEl('.sched', 400, 1800);
    await d.wait(6000);
    d.mark('end');
    if (!(await p.locator(chip('R03')).getAttribute('class'))?.includes('active')) throw new Error('R03 is not the selected vehicle');
    if (!(await p.getByText('R06').last().isVisible())) throw new Error('the schedule does not show all six vehicles');
  },
};
