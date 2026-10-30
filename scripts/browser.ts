/**
 * Install the pinned browser (scripts/lib/browser-pin.ts): Chrome for Testing at one exact version, for this platform.
 *
 *   bun scripts/browser.ts        (just browser; just setup runs it)
 *   bun scripts/browser.ts --path  print only the installed executable's path (exit 1 if not installed), e.g. for
 *                                  CHROME_PATH="$(bun scripts/browser.ts --path)" with the spikes' own scripts
 *
 * Skipped when the install is already complete. Otherwise: download the archive from Chrome for Testing's storage into
 * .cache/chrome/<version>/ (streamed, sha256 computed on the way; size and sha256 must equal the pin, else nothing is
 * unpacked), unpack it into a temporary directory next to the install (macOS: ditto; Windows: the system's tar.exe, or
 * PowerShell's Expand-Archive without it; Linux: unzip), check the executable and its version (macOS and Linux:
 * `--version` must print the pinned version; Windows, where chrome.exe prints nothing: the archive's
 * <version>.manifest), write the marker, and move the directory into place. The archive is deleted afterwards. A failed
 * or interrupted run leaves no install that findChrome would use (the marker is written last); re-run it.
 * Prints the executable's path. Exit code 1 on a failed download or check, 2 on a platform without a pinned build.
 * Platforms: darwin-arm64 (tested), darwin-x64, win32-x64, linux-x64 (written for, not run there).
 */
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BUILDS, CHROME_VERSION, MARKER, PLATFORM_ID, archiveUrl, installDir, pinnedBuild, pinnedChrome, type PinnedBuild } from './lib/browser-pin';

const fail = (code: number, m: string): never => { console.error(m); process.exit(code); };
const b = pinnedBuild() ?? fail(2, `no pinned Chrome for Testing build for ${PLATFORM_ID} (pinned: ${Object.keys(BUILDS).join(', ')}); set CHROME_PATH to a Chrome ${CHROME_VERSION}`);
const ready = pinnedChrome();
if (Bun.argv.includes('--path')) {
  if (!ready) fail(1, `Chrome for Testing ${CHROME_VERSION} is not installed: run \`just browser\``);
  console.log(ready);
  process.exit(0);
}
if (ready) {
  console.log(`Chrome for Testing ${CHROME_VERSION} (${b.cft}) is installed: ${ready}`);
  process.exit(0);
}

const dir = installDir(b), base = path.dirname(dir);
const zip = path.join(base, `chrome-${b.cft}.zip`);
const tmp = path.join(base, `.${b.cft}.${process.pid}.tmp`), part = `${zip}.${process.pid}.part`;
const STALL_MS = 60_000;

/** Stream the archive to `part`, hashing it; abort when no data arrives for STALL_MS. */
async function download(url: string, b: PinnedBuild): Promise<void> {
  console.log(`downloading ${url} (${(b.bytes / 1e6).toFixed(0)} MB)`);
  const ctl = new AbortController();
  let timer = setTimeout(() => ctl.abort(), STALL_MS);
  const r = await fetch(url, { signal: ctl.signal });
  if (!r.ok || !r.body) throw new Error(`download failed: HTTP ${r.status} ${url}`);
  const hash = new Bun.CryptoHasher('sha256');
  const out = Bun.file(part).writer();
  let got = 0, shown = 0;
  try {
    for await (const chunk of r.body) {
      clearTimeout(timer);
      timer = setTimeout(() => ctl.abort(), STALL_MS);
      hash.update(chunk);
      out.write(chunk);
      got += chunk.length;
      if (got > b.bytes) throw new Error(`the archive is larger than the pinned ${b.bytes} bytes`);
      if (got - shown >= b.bytes / 10) { shown = got; console.log(`  ${((100 * got) / b.bytes).toFixed(0)} %`); }
    }
  } finally {
    clearTimeout(timer);
    await out.end();
  }
  const sha = hash.digest('hex');
  if (got !== b.bytes) throw new Error(`the archive has ${got} bytes, the pin says ${b.bytes}`);
  if (sha !== b.sha256) throw new Error(`the archive's sha256 is ${sha}, the pin says ${b.sha256}`);
}

/** Unpack `zip` into `to` with the platform's own tool (symbolic links inside the macOS app bundle are kept). */
async function unpack(zip: string, to: string): Promise<void> {
  let cmd: string[];
  if (process.platform === 'darwin') cmd = ['ditto', '-x', '-k', zip, to];
  else if (process.platform === 'win32') {
    // System32's tar.exe is bsdtar, which reads zip; a GNU tar earlier on PATH (Git, MSYS) does not
    const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
    cmd = existsSync(tar) ? [tar, '-xf', zip, '-C', to]
      : ['powershell', '-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${to.replace(/'/g, "''")}'`];
  } else cmd = ['unzip', '-q', zip, '-d', to];
  const p = Bun.spawn(cmd, { stdout: 'ignore', stderr: 'pipe' });
  const [err, code] = [await new Response(p.stderr).text(), await p.exited];
  if (code !== 0) throw new Error(`unpacking with ${path.basename(cmd[0])} failed (${code}): ${err.trim()}`);
}

/** The unpacked build is the pinned version. */
async function checkVersion(root: string, b: PinnedBuild): Promise<void> {
  const exe = path.join(root, ...b.exe);
  if (!existsSync(exe)) throw new Error(`the archive has no ${b.exe.join('/')}`);
  if (process.platform === 'win32') {
    // chrome.exe --version prints nothing on Windows; the archive names its version in a manifest file
    if (!existsSync(path.join(root, b.exe[0], `${CHROME_VERSION}.manifest`))) throw new Error(`the archive has no ${b.exe[0]}/${CHROME_VERSION}.manifest`);
    return;
  }
  const p = Bun.spawn([exe, '--version'], { stdout: 'pipe', stderr: 'pipe' });
  const out = (await new Response(p.stdout).text()).trim();
  if ((await p.exited) !== 0 || !out.includes(CHROME_VERSION)) throw new Error(`${exe} --version printed "${out}", expected ${CHROME_VERSION}`);
}

/** Rename a directory; on Windows retried for 10 s (a virus scanner may still hold a file just unpacked). */
async function moveDir(from: string, to: string): Promise<void> {
  for (let t0 = performance.now(); ;) {
    try { renameSync(from, to); return; } catch (e) {
      if (process.platform !== 'win32' || performance.now() - t0 > 10_000) throw e;
      await Bun.sleep(250);
    }
  }
}

try {
  mkdirSync(base, { recursive: true });
  const have = existsSync(zip) && statSync(zip).size === b.bytes;
  if (have) {
    // an archive kept from an interrupted run: used only if its sha256 matches
    const hash = new Bun.CryptoHasher('sha256');
    for await (const chunk of Bun.file(zip).stream()) hash.update(chunk);
    if (hash.digest('hex') !== b.sha256) rmSync(zip, { force: true });
  }
  if (!existsSync(zip)) {
    await download(archiveUrl(b), b);
    renameSync(part, zip);
  }
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp);
  await unpack(zip, tmp);
  await checkVersion(tmp, b);
  writeFileSync(path.join(tmp, MARKER), JSON.stringify({ version: CHROME_VERSION, platform: b.cft, sha256: b.sha256, url: archiveUrl(b), installed: new Date().toISOString() }, null, 1) + '\n');
  if (pinnedChrome()) rmSync(tmp, { recursive: true, force: true }); // another run finished first
  else {
    rmSync(dir, { recursive: true, force: true }); // an incomplete install (no marker)
    await moveDir(tmp, dir);
  }
  rmSync(zip, { force: true });
} catch (e) {
  rmSync(part, { force: true });
  rmSync(tmp, { recursive: true, force: true });
  fail(1, `just browser: ${e instanceof Error ? e.message : String(e)}`);
}
const exe = pinnedChrome() ?? fail(1, `just browser: the install in ${dir} is not complete`);
console.log(`Chrome for Testing ${CHROME_VERSION} (${b.cft}) installed: ${exe}`);
