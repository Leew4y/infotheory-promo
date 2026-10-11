// Recording of the product's demo page `#/showcase` (顶栏右侧「演示」) for the scene `check`: the 「校验结果」 panel with its
// six counts (each count's definition shows as a tooltip while the pointer rests on it), then the 「和基线并列（同一种子）」
// table (同等服务质量基线 ②'', 按站装车 and 基线 (a) rows are 不合格, our row is 合格). Scenario 「演示批次 1 · 30 家门店（模拟数据）」.
//   cd <product>/web && bun run dev --port 5190 --host 127.0.0.1      (any free port; set it in PORT below)
//   bun scripts/capture.ts --film tongzhou --id check films/tongzhou/capture/check.ts
// Viewport 1752x736 = 2.38 : 1, the aspect of the keynote demo area (1620x680).
// (a Scenario, scripts/lib/scenario.ts; films may not import scripts, so the type is not named here)

import { driver } from './lib';

const PORT = 5190;
const SCENARIO = '演示批次 1 · 30 家门店（模拟数据）';
// the six counts of 「校验结果」 (the collapsed 「交叉复核」 block below also uses .check-row)
const COUNTS = '.panel:not(.contract-details) .check-row';

export default {
  url: `http://127.0.0.1:${PORT}/#/showcase`,
  viewport: { width: 1752, height: 736 },
  async run(act: any) { // act: scripts/lib/scenario.ts Act
    const d = driver(act);
    const p = d.page;
    await p.getByText(SCENARIO).first().waitFor({ state: 'visible', timeout: 15000 });
    await p.getByText('和基线并列（同一种子）').waitFor({ state: 'visible', timeout: 15000 });
    await p.getByText('校验结果').first().waitFor({ state: 'visible', timeout: 15000 });
    if ((await p.locator(COUNTS).count()) !== 6) throw new Error('the verification panel does not have six counts');
    await p.waitForTimeout(1500);
    const cell = (i: number) => `tbody tr.ant-table-row >> nth=${i} >> td >> nth=0`; // the plan's name; its tooltip says how the baseline is built
    d.mark('start');
    await d.over('text=合格 >> nth=0', { ms: 700, dx: 20 }); // the big 「合格」: hover shows the verdict's definition
    await d.wait(1300);
    d.mark('verdict');
    // the six counts, top to bottom, in one slow sweep
    await d.over(`${COUNTS} >> nth=0`, { ms: 500, dx: 150 });
    await d.wait(300);
    await d.over(`${COUNTS} >> nth=5`, { ms: 4200, dx: 150 });
    await d.wait(300);
    d.mark('counts');
    // the baseline table: the rows that fail, then our row
    await d.over(cell(1), { ms: 700 }); // 同等服务质量基线 ②''
    await d.wait(1500);
    d.mark('baseline');
    await d.over(cell(3), { ms: 500 }); // 按站装车 · 装到 70%
    await d.wait(1100);
    await d.over(cell(6), { ms: 500 }); // 基线 (a) · 装到 70%
    await d.wait(1100);
    d.mark('ours');
    await d.over(cell(0), { ms: 700 }); // 我们的方案
    await d.wait(3600);
    d.mark('end');
    const first = (await p.locator('tbody tr.ant-table-row').first().innerText()).replace(/\s+/g, ' ');
    if (!/我们的方案/.test(first) || !/合格/.test(first)) throw new Error(`the first table row is not our qualified plan: ${first}`);
    if ((await p.locator('tbody tr.ant-table-row').count()) < 5) throw new Error('the baseline table has fewer than 5 rows');
  },
};
