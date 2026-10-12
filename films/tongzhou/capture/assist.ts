// OPTIONAL capture (not wired into the plan): the demo page's section 「改需求：调度员说一句话」 (#264, web/src/components/
// AssistantExamples.tsx). Five cards from the scenario pack's assistant_examples.json (model deepseek-flash, recorded 2026-10-10;
// the page prints "原始记录 results/assistant_eval_deepseek-flash_2026-10-10.json"): the dispatcher's sentence, the structured
// request the model returned (or its question, or why it was not handled), and the before → after figures of the plan that the
// solving kernel re-planned and re-checked. The pointer visits the cards in order; on the first the raw request JSON is opened.
//   cd <product>/web && bun run dev --port 5190 --host 127.0.0.1      (any free port; set it in PORT below)
//   bun scripts/capture.ts --film tongzhou --id assist films/tongzhou/capture/assist.ts
// If it is wired in (not yet): edit [{ from: 2.55, to: 17.95 }] (15.4 s); camera in frame px on the scene clock, zoom 2.1 on one card
// at a time: (0,876,368,1) (0.9,876,368,1) (1.8,420,330,2.1) (3.2,420,330,2.1) (3.9,420,450,1.6) (5.2,420,450,1.6) (5.8,420,330,2.1)
// (6.6,533,330,2.1) (8.6,533,330,2.1) (9.2,876,330,2.1) (11.2,876,330,2.1) (11.8,1219,330,2.1) (13.4,1219,330,2.1) (13.9,1562,330,2.1)
// (15.0,1562,330,2.1); the cards are 331 px wide, 359 px high, at x = 24, 367, 710, 1054, 1397, y = 127 after the scroll.
// Viewport 1752x736 = 2.38 : 1, the aspect of the keynote demo area (1620x680); 736 px is the least height at which the front end's one-screen
// plan page still shows its 3D truck (below it the plan and loading pages hide or shrink it).
// (a Scenario, scripts/lib/scenario.ts; films may not import scripts, so the type is not named here)
import { driver } from './lib';

const PORT = 5190;
const SCENARIO = '演示批次 1 · 30 家门店（模拟数据）';
const card = (i: number) => `.ae-card >> nth=${i}`;

export default {
  url: `http://127.0.0.1:${PORT}/#/showcase`,
  viewport: { width: 1752, height: 736 },
  async run(act: any) { // act: scripts/lib/scenario.ts Act
    const d = driver(act);
    const p = d.page;
    await p.getByText(SCENARIO).first().waitFor({ state: 'visible', timeout: 15000 });
    await p.locator('.ae-card').first().waitFor({ state: 'attached', timeout: 15000 });
    if ((await p.locator('.ae-card').count()) !== 5) throw new Error('expected five example cards');
    if (!(await p.locator('.ae-source').innerText()).includes('deepseek')) throw new Error('the cards are not marked as model output');
    // the section heading to the top of the page (under the sticky bar), before the take starts
    await p.evaluate(() => {
      const h = [...document.querySelectorAll('h2')].find((e) => /改需求/.test(e.textContent || '')) as HTMLElement;
      scrollTo(0, h.getBoundingClientRect().top + scrollY - 64);
    });
    await p.waitForTimeout(1500);
    d.mark('start');
    await d.glide(900, 300, 400);
    await d.wait(300);
    // card 1: two requests, then the raw JSON of the request
    await d.over(card(0), { ms: 600, dx: 150, dy: 60 });
    await d.wait(1000);
    d.mark('card1');
    await d.click(`${card(0)} >> summary`, { ms: 600 });
    await d.wait(1300);
    d.mark('json');
    await d.click(`${card(0)} >> summary`, { ms: 200 }); // fold it again so the row keeps its height
    for (const i of [1, 2, 3, 4]) {
      await d.over(card(i), { ms: 600, dx: 150, dy: 60 });
      await d.wait(i === 3 ? 1800 : 1300);
      d.mark(`card${i + 1}`);
    }
    await d.glide(900, 420, 600);
    await d.wait(700);
    d.mark('end');
    const clar = await p.locator('.ae-card >> nth=3').innerText();
    if (!/追问/.test(clar)) throw new Error(`card 4 is not the clarification card: ${clar.slice(0, 80)}`);
  },
};
