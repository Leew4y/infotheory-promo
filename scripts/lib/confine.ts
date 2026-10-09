/**
 * Path confinement for the local file servers (scripts/chrome.ts serveDist, the vite dev server's /media): a request
 * path may only reach a file inside its root. Checked on real paths (links resolved), so a symlink or junction inside
 * the root cannot lead outside it.
 */
import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';

/** The real path of the file `rel` (a URL path, already decoded) names under `root`, or null if it is not a file inside root. */
export function confined(root: string, rel: string): string | null {
  if (rel.includes('\0') || rel.includes('\\')) return null;
  try {
    const base = realpathSync(root);
    const f = realpathSync(path.resolve(base, '.' + path.posix.normalize('/' + rel)));
    if (!f.startsWith(base + path.sep)) return null;
    return statSync(f).isFile() ? f : null;
  } catch {
    return null; // missing, unreadable, a broken link
  }
}
