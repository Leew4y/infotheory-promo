// Recording of the product (web/ of the 1010-ai-hackathon repo, Vite dev server) for the scene `cost`:
//  1. the 「方案」 page, scenario 「演示批次 1 · 30 家门店（模拟数据）」: the pointer rests on the 「成本」 figure and its card opens
//     (per vehicle: fixed cost, per-km fee, vehicle cost, total, and the note that loading labour and driver pay are not included);
//  2. the scenario is switched to 「共享仓演示批次 1 · 30 家门店（模拟数据）」 in the selector, then the 「单据」 page opens on
//     「运费分摊」: per owner, the cost of delivering alone, the shared cost after pooling, and the saving.
// The owners' bill text written by the language model (last sentence of the narration) is not in the front end of this checkout.
//   cd <product>/web && bun run dev --port 5190 --host 127.0.0.1      (any free port; set it in PORT below)
//   bun scripts/capture.ts --film tongzhou --id cost films/tongzhou/capture/cost.ts
// Viewport 1848x776 = 2.38 : 1, the aspect of the keynote demo area (1620x680); 776 px is the height the front end's one-screen
// layouts need (below it the plan and loading pages scroll).
// (a Scenario, scripts/lib/scenario.ts; films may not import scripts, so the type is not named here)
import { driver } from './lib';

const PORT = 5190;
const SCENARIO = '演示批次 1 · 30 家门店（模拟数据）';
const SHARED = '共享仓演示批次 1 · 30 家门店（模拟数据）';

export default {
  url: `http://127.0.0.1:${PORT}/#/plan?scenario=kernel-seed1&route=R01`,
  viewport: { width: 1848, height: 776 },
  async run(act: any) { // act: scripts/lib/scenario.ts Act
    const d = driver(act);
    const p = d.page;
    await p.getByText(SCENARIO).first().waitFor({ state: 'visible', timeout: 15000 });
    const cost = '.usage-cell:has-text("成本")';
    await p.locator(cost).waitFor({ state: 'visible', timeout: 15000 });
    // warm what the second half opens, so the recording shows no loading spinner: the lazy 「单据」 page (dev server modules)
    // and the shared-warehouse scenario files
    await p.evaluate('import("/src/pages/Docs.tsx")');
    await p.evaluate("Promise.all(['instance', 'plan', 'report', 'kernel'].map((f) => fetch('/scenarios/sharedwh-seed1/' + f + '.json').then((r) => r.text())))");
    await p.waitForTimeout(2500);
    d.mark('start');
    await d.over(cost, { ms: 600, dx: 70, dy: 40 });
    await p.getByText('合计（元）').waitFor({ state: 'visible', timeout: 5000 }); // the breakdown card
    await d.wait(1300);
    d.mark('breakdown');
    // the shared-warehouse scenario
    await d.click('.ant-select', { ms: 500 });
    await p.locator('.ant-select-item-option:has-text("共享仓演示批次 1")').waitFor({ state: 'visible', timeout: 5000 });
    await d.wait(250);
    await d.click(`.ant-select-item-option:has-text("共享仓演示批次 1")`, { ms: 400 });
    await p.getByText('8 辆车送完').waitFor({ state: 'visible', timeout: 10000 });
    await d.wait(100);
    d.mark('shared');
    await d.click('.topnav-tab:has-text("单据")', { ms: 600 });
    await p.getByText('运费分摊').first().waitFor({ state: 'visible', timeout: 10000 });
    await d.wait(500);
    d.mark('table');
    await d.over('table >> nth=0 >> tbody tr >> nth=1', { ms: 900, dx: 500 }); // along the owners' rows
    await d.wait(700);
    await d.over('table >> nth=0 >> tbody tr >> nth=4', { ms: 1300, dx: 500 }); // the total row
    await d.wait(3500);
    d.mark('end');
    if (!(await p.getByText(SHARED).first().isVisible())) throw new Error('the shared-warehouse scenario is not selected');
    const t = (await p.locator('table').first().innerText()).replace(/\s+/g, ' ');
    if (!/拼单后分摊/.test(t) || !/合计/.test(t)) throw new Error(`not the freight-share table: ${t.slice(0, 120)}`);
  },
};
