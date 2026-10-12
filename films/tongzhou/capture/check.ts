// Recording of the product's demo page `#/showcase` (顶栏右侧「演示」) for the scene `check`, scrolled to the section
// 「和基线对照、校验口径」: the 「校验结果」 panel (verdict 「模型内合格」 and its six counts; the sticky top bar shows the
// pill 「模型内合格 · 违规 0 · 未检查 4 项」), then the 「和基线并列（同一种子）」 table (同等服务质量基线 ②'', 按站装车 and
// 基线 (a) rows are 「模型内不合格」, our row is 「模型内合格」; hovering a plan name shows how that baseline is built).
// Scenario 「演示批次 1 · 30 家门店（模拟数据）」. The tooltip of the first count (违规) quotes dev jargon (#125, verify()), so the
// pointer never rests on that row.
//   cd <product>/web && bun run dev --port 5190 --host 127.0.0.1      (any free port; set it in PORT below)
//   bun scripts/capture.ts --film tongzhou --id check films/tongzhou/capture/check.ts
// Viewport 1752x736 = 2.38 : 1, the aspect of the keynote demo area (1620x680); 736 px is the least height at which the front end's one-screen
// plan page still shows its 3D truck (below it the plan and loading pages hide or shrink it).
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
    await p.getByText('和基线并列（同一种子）').waitFor({ state: 'attached', timeout: 15000 });
    if ((await p.locator(COUNTS).count()) !== 6) throw new Error('the verification panel does not have six counts');
    // the section heading to the top of the page (under the sticky bar), before the take starts
    await p.evaluate(() => {
      const h = [...document.querySelectorAll('h2')].find((e) => /和基线对照/.test(e.textContent || '')) as HTMLElement;
      scrollTo(0, h.getBoundingClientRect().top + scrollY - 64);
    });
    await p.waitForTimeout(1500);
    const cell = (i: number) => `tbody tr.ant-table-row >> nth=${i} >> td >> nth=0`; // the plan's name; its tooltip says how the baseline is built
    d.mark('start');
    await d.glide(900, 420, 500);
    // the six counts, top to bottom, in one slow sweep (from the second one on: the first has the jargon tooltip)
    await d.over(`${COUNTS} >> nth=1`, { ms: 600, dx: 160 });
    await d.wait(300);
    await d.over(`${COUNTS} >> nth=5`, { ms: 3800, dx: 160 });
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
    await d.wait(5600);
    d.mark('end');
    const first = (await p.locator('tbody tr.ant-table-row').first().innerText()).replace(/\s+/g, ' ');
    if (!/我们的方案/.test(first) || !/模型内合格/.test(first)) throw new Error(`the first table row is not our plan, qualified in the model: ${first}`);
    if ((await p.locator('tbody tr.ant-table-row').count()) < 5) throw new Error('the baseline table has fewer than 5 rows');
    if (!(await p.getByText('模型内合格 · 违规 0').first().isVisible())) throw new Error('the header pill 「模型内合格」 is not visible');
  },
};
