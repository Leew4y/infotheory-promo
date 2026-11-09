// Terminal replay of real command output for the bills scene (built by capture/term/build.py; the page paces itself).
//   python films/tongzhou/capture/term/build.py
//   bun scripts/capture.ts --film tongzhou --id term-bills films/tongzhou/capture/term-bills.ts
// (a Scenario, scripts/lib/scenario.ts; films may not import scripts, so the type is not named here)
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default {
  url: pathToFileURL(path.resolve('films/tongzhou/capture/term/bills.html')).href,
  viewport: { width: 1600, height: 672 },
  async run(act: any) { // act: scripts/lib/scenario.ts Act
    await act.wait(7500);
  },
};
