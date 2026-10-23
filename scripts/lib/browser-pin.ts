/**
 * The pinned browser: Chrome for Testing at one exact version, unpacked under .cache/chrome/<version>/<platform>/ by
 * `just browser` (scripts/browser.ts; `just setup` runs it). scripts/chrome.ts findChrome() prefers it to any installed
 * Chrome.
 *
 * Why a pin: pixels depend on the browser build (the regress baselines record it), an installed Chrome updates itself
 * silently, two machines rarely run the same build, and the branded macOS Chrome starts GoogleUpdater processes that
 * outlive it (test-export counted them as leaked processes). Chrome for Testing is Google's build for automation: it
 * does not update itself and its bundle carries no updater (checked on 155.0.8059.85 mac-arm64: no GoogleUpdater.app,
 * which the branded Chrome's framework has under Helpers/).
 *
 * The version is 155.0.8059.85, the build the darwin-arm64 regress baselines were recorded with (branded Chrome); the
 * Chrome for Testing build of it reproduces them bit for bit. It is not listed in Chrome for Testing's JSON endpoints
 * (known-good-versions-with-downloads.json of 2026-10-22 ends the 155 builds at 155.0.8059.84), but its archives are on
 * the official storage, storage.googleapis.com/chrome-for-testing-public, for all four platforms below. The sizes and
 * sha256 were computed from those archives on 2026-10-23; their md5 matched the storage's own x-goog-hash.
 * To move the pin: change CHROME_VERSION and every build's bytes and sha256 (download each archive and hash it), run
 * `just browser`, then `just regress` per film; re-record baselines only after a person approved the pixel change.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..', '..');
export const CHROME_VERSION = '155.0.8059.85';

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
    cft: 'mac-arm64', bytes: 192677818, sha256: 'b076e45ba9c98f9fb20a5bae06fd3d6954db012f4b51cc965c945e5bb9405afa',
    exe: ['chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
  },
  'darwin-x64': {
    cft: 'mac-x64', bytes: 203154428, sha256: 'f51dc6be5909ac0a79b7fdb5752de3ae8abea1ce0da019c60a37a6beb3c92c89',
    exe: ['chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
  },
  'win32-x64': {
    cft: 'win64', bytes: 206113632, sha256: 'a6c6c6aaf97fc698806bf255ced0ead040f02222e43d0519da1a811e8d639e54',
    exe: ['chrome-win64', 'chrome.exe'],
  },
  'linux-x64': {
    cft: 'linux64', bytes: 199006420, sha256: '8e59438837ac4b995d01ef4026bac85c95800376bb2e3c06ac4d54af1ebd5f9d',
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
