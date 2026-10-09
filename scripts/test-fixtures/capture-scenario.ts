// Scenario for scripts/test-capture.ts: four clicks on the test page, with pauses.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Scenario } from '../lib/scenario';

export default {
  url: pathToFileURL(path.join(import.meta.dir, 'capture-page.html')).href,
  async run(act) {
    for (const id of ['#b1', '#b2', '#b3', '#b4']) {
      await act.click(id, { ms: 500 });
      await act.wait(500);
    }
  },
} satisfies Scenario;
