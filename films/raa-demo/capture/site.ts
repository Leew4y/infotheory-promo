// Recording of Repo-AI-Analysis (its dev server, http://127.0.0.1:5180/Repo-AI-Analysis/): the home page's report
// card, then Compare with three local-model runtimes (Ollama, vLLM, llama.cpp) and their score table.
//   bun scripts/capture.ts --film raa-demo --id site films/raa-demo/capture/site.ts
// (a Scenario, scripts/lib/scenario.ts; films may not import scripts, so the type is not named here)

const BASE = 'http://127.0.0.1:5180/Repo-AI-Analysis/';
const folder = (name: string) => `.raia-compare-folder:has-text("${name}") .raia-compare-folder-toggle`;
const option = (name: string) => `.raia-compare-option:has-text("${name}")`;

export default {
  url: BASE,
  viewport: { width: 1440, height: 810 },
  async run(act: any) { // act: scripts/lib/scenario.ts Act
    await act.wait(2200);
    act.mark('home');
    await act.move(560, 470, { ms: 900 }); // over the radar chart
    await act.wait(2600);
    await act.click('.VPNavBarMenuLink:has-text("Compare")', { ms: 700 });
    await act.wait(1400);
    act.mark('compare');
    await act.click(folder('ai-programs'), { ms: 600 });
    await act.wait(700);
    await act.click(folder('agent-infrastructure'), { ms: 600 });
    await act.wait(700);
    for (const r of ['Ollama', 'vLLM', 'llama.cpp']) {
      // the list scrolls inside its panel: bring the row into view, then move to it and click
      await act.page.locator(option(r)).first().scrollIntoViewIfNeeded();
      await act.wait(250);
      await act.click(option(r), { ms: 550 });
      await act.wait(900);
    }
    await act.wait(2200);
    act.mark('table');
    await act.scroll(520);
    await act.wait(3200);
    const url = act.page.url();
    if (!/repos=.*ollama.*vllm.*llama-cpp/.test(decodeURIComponent(url))) throw new Error(`the three repos were not selected: ${url}`);
  },
};
