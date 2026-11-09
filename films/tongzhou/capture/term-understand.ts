// Terminal replay of real command output for the understand scene (built by capture/term/build.py; the page paces itself).
//   python films/tongzhou/capture/term/build.py
//   bun scripts/capture.ts --film tongzhou --id term-understand films/tongzhou/capture/term-understand.ts
// (a Scenario, scripts/lib/scenario.ts; films may not import scripts, so the type is not named here)
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default {
  url: pathToFileURL(path.resolve('films/tongzhou/capture/term/understand.html')).href,
  viewport: { width: 1600, height: 672 },
  async run(act: any) { // act: scripts/lib/scenario.ts Act
    await act.wait(16500);
  },
};
