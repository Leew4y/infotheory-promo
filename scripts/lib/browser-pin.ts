/**
 * The pinned browser: Chrome for Testing at one exact version, unpacked under .cache/chrome/<version>/<platform>/ by
 * `just browser` (scripts/browser.ts; `just setup` runs it). scripts/chrome.ts findChrome() prefers it to any installed
 * Chrome.
 *
 * Why a pin: pixels depend on the browser build (the regress baselines record it), an installed Chrome updates itself
 * silently, two machines rarely run the same build, and the branded macOS Chrome starts GoogleUpdater processes that
 * outlive it (test-export counted them as leaked processes). Chrome for Testing is Google's build for automation: it
 * does not update itself and its bundle carries no updater (checked on 155.0.8059.85 and 157.0.8103.38 mac-arm64: no GoogleUpdater.app,
 * which the branded Chrome's framework has under Helpers/).
 *
 * The version is 157.0.8103.38, the Stable channel of Chrome for Testing's last-known-good-versions-with-downloads.json on
 * 2026-11-09. Sizes and sha256 were computed from the archives on storage.googleapis.com/chrome-for-testing-public that day.
 * To move the pin: change CHROME_VERSION and every build's bytes and sha256 (download each archive and hash it), run
 * `just browser`, then `just regress` per film; re-record baselines only after a person approved the pixel change.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..', '..');
export const CHROME_VERSION = '157.0.8103.38';

export interface PinnedBuild {
  /** Chrome for Testing's platform name. */
  cft: string;
  bytes: number;
  sha256: string;
  /** The executable inside the unpacked archive. */
  exe: string[];
}

/** By `${process.platform}-${process.arch}`. */
export const BUILDS: Record<string, PinnedBuild> = {
  'darwin-arm64': {
    cft: 'mac-arm64', bytes: 196562867, sha256: '3406b38b52b7d341d74450eb7b369be038c9fec9894c8b8a9e9e9f97333caf2f',
    exe: ['chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
  },
  'darwin-x64': {
    cft: 'mac-x64', bytes: 207117913, sha256: 'c6fcc2869b0d5a421e880d7bcdabe96e4261c4100e125fc4e4daf6346474efa6',
    exe: ['chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
  },
  'win32-x64': {
    cft: 'win64', bytes: 210600182, sha256: 'ae0deef27d449e1d7529df7705d609bab102de48464da13567ed3dd2ee1a0586',
    exe: ['chrome-win64', 'chrome.exe'],
  },
  'linux-x64': {
    cft: 'linux64', bytes: 203502190, sha256: '8cdeb344e9b2cefe59f4aea8d1d93d5d93054c03cde217665c16fc1f62e72a66',
    exe: ['chrome-linux64', 'chrome'],
  },
};

export const PLATFORM_ID = `${process.platform}-${process.arch}`;
export const pinnedBuild = (): PinnedBuild | null => BUILDS[PLATFORM_ID] ?? null;
export const archiveUrl = (b: PinnedBuild) => `https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/${b.cft}/chrome-${b.cft}.zip`;
/** Where versions are unpacked, and where this version's build for this platform goes. */
export const CHROME_CACHE = path.join(ROOT, '.cache', 'chrome');
export const installDir = (b: PinnedBuild) => path.join(CHROME_CACHE, CHROME_VERSION, b.cft);
/** Written last into an install, after the archive's sha256 and the unpacked version were checked. */
export const MARKER = 'installed.json';

/** The pinned build's executable if `just browser` installed it completely, else null. */
export function pinnedChrome(): string | null {
  const b = pinnedBuild();
  if (!b) return null;
  const dir = installDir(b);
  try {
    const m = JSON.parse(readFileSync(path.join(dir, MARKER), 'utf8'));
    if (m.version !== CHROME_VERSION || m.sha256 !== b.sha256) return null;
  } catch { return null; }
  const exe = path.join(dir, ...b.exe);
  return existsSync(exe) ? exe : null;
}
