// Recording for the scene `guide`, one continuous take in one page:
//  1. the product's 「装车」 page (web/ of the 1010-ai-hackathon repo, Vite dev server), scenario 「演示批次 1 · 30 家门店（模拟数据）」,
//     vehicle R01, mode 到站卸货: the timeline 「出发前 / 到达第 k 站」 is stepped to stops 1, 2, 3 (unloaded boxes leave the truck,
//     the current stop's boxes stand on the landing area), then 「加固点」 and 「透视」 are switched on;
//  2. the on-site loading sheet examples/scenarios/kernel-seed1/sheets/装车单_R01.html (file://): the summary of faces to fix and,
//     further down, a step that says to add a locking bar or air bag after the face is loaded;
//  3. the offline guide examples/offline-seed1/guide_kernel-seed1.html (file://), the same 3D loading guide that opens by double-click.
// The page loads of 2 and 3 show a blank page for a moment: the plan's edit cuts those (marks nav-sheet / sheet-ready,
// nav-offline / offline-ready are the cut points).
//   cd <product>/web && bun run dev --port 5190 --host 127.0.0.1      (any free port; set it in PORT below)
//   bun scripts/capture.ts --film tongzhou --id guide films/tongzhou/capture/guide.ts
// PRODUCT (env) is the product checkout that holds examples/; the default is the worktree this was recorded from.
// Viewport 1848x776 = 2.38 : 1, the aspect of the keynote demo area (1620x680); 776 px is the height the front end's one-screen
// layouts need (below it the plan and loading pages scroll).
// (a Scenario, scripts/lib/scenario.ts; films may not import scripts, so the type is not named here)
import { driver } from './lib';

const PORT = 5190;
const PRODUCT = process.env.PRODUCT ?? 'E:/gitclone/1010-ai-hackathon/.claude/worktrees/studytempest-207-loading-reinforcement-37ed9f';
const SCENARIO = '演示批次 1 · 30 家门店（模拟数据）';
const SHEET = `file:///${PRODUCT}/examples/scenarios/kernel-seed1/sheets/装车单_R01.html`;
const OFFLINE = `file:///${PRODUCT}/examples/offline-seed1/guide_kernel-seed1.html`;
const mark = (k: number) => `.lr-slider [title^="第 ${k} 站"]`; // timeline label of stop k (title is 「第 1 站 · 门店 21 · 07:14 到」)

export default {
  url: `http://127.0.0.1:${PORT}/#/loading?scenario=kernel-seed1&route=R01`,
  viewport: { width: 1848, height: 776 },
  async run(act: any) { // act: scripts/lib/scenario.ts Act
    const d = driver(act);
    const p = d.page;
    await p.getByText(SCENARIO).first().waitFor({ state: 'visible', timeout: 15000 });
    await p.getByText('装车复核').waitFor({ state: 'visible', timeout: 15000 });
    await p.locator(mark(3)).waitFor({ state: 'visible', timeout: 15000 });
    await p.waitForTimeout(3000); // the 3D truck draws
    d.mark('start');
    await d.glide(900, 330, 400);
    await d.wait(300);
    // the timeline: stops 1, 2, 3
    for (const k of [1, 2, 3]) {
      await d.click(mark(k), { ms: 600 });
      await d.wait(800);
      d.mark(`stop${k}`);
    }
    // 加固点 and 透视 on
    await d.click('button.ant-btn:has-text("加固点")', { ms: 800 });
    await d.wait(1000);
    d.mark('brace');
    await d.click('button.ant-btn:has-text("透视")', { ms: 600 });
    await d.glide(1100, 330, 400); // off the button: its tooltip closes
    await d.wait(300);
    d.mark('xray');
    if (!(await p.locator('button.ant-btn:has-text("加固点")').first().getAttribute('class'))?.includes('ant-btn-primary')) throw new Error('加固点 is not on');
    if (!(await p.locator('button.ant-btn:has-text("透视")').first().getAttribute('class'))?.includes('ant-btn-primary')) throw new Error('透视 is not on');

    // the on-site loading sheet
    d.mark('nav-sheet');
    await p.goto(SHEET, { waitUntil: 'load' });
    await p.getByText('装完上面这一步后').first().waitFor({ state: 'attached', timeout: 10000 });
    await p.waitForTimeout(400);
    d.mark('sheet-ready');
    await d.glide(900, 420, 400);
    await d.wait(1300); // the summary box: 要加固 45 面（准备横向锁杆或气囊）
    d.mark('sheet-summary');
    // down to the first step that says to add the locking bar or air bag
    const y = await p.evaluate(() => { const el = [...document.querySelectorAll('.what')].find((e) => /加横向锁杆或气囊/.test(e.textContent || '')) as HTMLElement; return el.getBoundingClientRect().top + scrollY; });
    d.mark('sheet-scroll');
    await d.scrollTo(y - 260, 1000);
    await d.wait(300);
    d.mark('sheet-hint');
    await d.wait(2800);
    if (!(await p.getByText('加横向锁杆或气囊').first().isVisible())) throw new Error('the locking-bar hint is not on screen');

    // the offline guide, opened as a file
    d.mark('nav-offline');
    await p.goto(OFFLINE, { waitUntil: 'load' });
    await p.locator('.js-plotly-plot').first().waitFor({ state: 'attached', timeout: 20000 });
    await p.waitForTimeout(1500);
    d.mark('offline-ready');
    // the 3D guide: scroll to the slider and step it, 出发前 → 到达第 2 站 → 到达第 4 站 (the boxes of the unloaded stops leave)
    await d.glide(700, 520, 400);
    d.mark('offline-scroll');
    await d.scrollTo(300, 700);
    await d.wait(400);
    const rail = await p.locator('.slider-rail-rect').first().boundingBox();
    const grip = await p.locator('.slider-grip-rect').first().boundingBox();
    if (!rail || !grip) throw new Error('the guide has no stop slider');
    const at = (k: number) => rail.x + (k / 5) * rail.width; // the slider has 6 steps: 出发前, 到达第 1 … 5 站
    await d.glide(grip.x + grip.width / 2, grip.y + grip.height / 2, 600);
    d.mark('grip');
    await d.page.mouse.down();
    await d.glide(at(2), grip.y + grip.height / 2, 1300);
    await d.wait(500);
    await d.glide(at(4), grip.y + grip.height / 2, 1300);
    await d.page.mouse.up();
    await d.wait(1500);
    d.mark('end');
    if (!/装卸指引/.test(await p.title())) throw new Error(`not the offline guide: ${await p.title()}`);
  },
};
