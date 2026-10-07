/**
 * Shared headless-Chrome setup for the tools that render the page (export, regress, validate).
 *
 * Every launch uses the CPU 2D canvas (--disable-accelerated-2d-canvas): the accelerated canvas made pixels depend on
 * render order (phase 0a, spikes/RESULTS.md). WebGL runs either on the platform GPU (ANGLE D3D11 on Windows, the
 * browser's default backend elsewhere) or on SwiftShader, the software path that is pixel-deterministic.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

export type Gpu = 'platform' | 'swiftshader';

/** Chrome or Edge executable: $CHROME_PATH, then the usual install locations per platform. */
export function findChrome(): string {
  const c = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((p) => p && existsSync(p));
  if (!c) throw new Error('Chrome / Edge not found (set CHROME_PATH)');
  return c;
}

export function chromeArgs(gpu: Gpu, o: { cpu2d?: boolean } = {}): string[] {
  return [
    '--window-size=1920,1080', '--ignore-gpu-blocklist', '--mute-audio', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    ...(o.cpu2d === false ? [] : ['--disable-accelerated-2d-canvas']),
    ...(gpu === 'swiftshader' ? ['--use-angle=swiftshader'] : process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
  ];
}

/**
 * Kill a process and all its descendants and wait (bounded) until the root is gone. Windows: taskkill /T /F.
 * Elsewhere: SIGKILL to the process group (puppeteer starts Chrome detached, i.e. as a group leader), then the pid.
 * Returns false if the root is still running after `waitMs`.
 */
export async function killTree(pid: number | undefined, waitMs = 5000): Promise<boolean> {
  if (!pid) return true;
  const alive = () => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; } };
  if (!alive()) return true;
  if (process.platform === 'win32') {
    await Bun.spawn(['taskkill', '/PID', String(pid), '/T', '/F'], { stdout: 'ignore', stderr: 'ignore' }).exited;
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch {}
    try { process.kill(pid, 'SIGKILL'); } catch {}
  }
  const t0 = performance.now();
  while (alive() && performance.now() - t0 < waitMs) await Bun.sleep(50);
  return !alive();
}

/** A static file server for a built page directory; '/' is index.html. */
export function serveDist(dist: string): { url: string; stop: () => void } {
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    async fetch(req) {
      const p = decodeURIComponent(new URL(req.url).pathname);
      if (p === '/favicon.ico') return new Response(null, { status: 204 });
      const f = Bun.file(path.join(dist, p === '/' ? 'index.html' : p));
      return (await f.exists()) ? new Response(f) : new Response('not found', { status: 404 });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
}

/**
 * Open the built film `film` in export mode, in one of its styles ('' = the default), and wait until it can render.
 * Fails fast and with the page's own message when the page throws while loading (e.g. an unknown style id), when it
 * renders another film or names no style or another style than requested (a stale dist/), or when __ready() throws
 * (e.g. a missing font bundle).
 */
export async function loadFilm(page: import('puppeteer-core').Page, url: string, film: string, style: string, timeout = 60_000): Promise<{ style: string; styles: string[] }> {
  const thrown = new Promise<never>((_, reject) => page.once('pageerror', (e) => reject(new Error(`page threw while loading: ${e instanceof Error ? e.message : String(e)}`))));
  thrown.catch(() => {});
  await Promise.race([page.goto(`${url}/?export=1${style ? `&style=${encodeURIComponent(style)}` : ''}`, { waitUntil: 'load' }), thrown]);
  await Promise.race([page.waitForFunction(() => typeof window.__frame === 'function', { timeout }), thrown]);
  const got = await page.evaluate(() => ({ film: window.__film, style: window.__style, styles: window.__styles }));
  if (got.film !== film) throw new Error(`the page renders film "${got.film}", not "${film}" (stale dist/? run just build ${film})`);
  if (typeof got.style !== 'string' || !got.style || !Array.isArray(got.styles)) throw new Error('the page names no style (__style / __styles missing: a build from before style selection? run just build ${film})');
  if (style && got.style !== style) throw new Error(`the page renders style "${got.style}", not "${style}" (stale dist/? run just build ${film})`);
  const ready = await Promise.race([page.waitForFunction(() => {
    try { return window.__ready() ? 'ok' : false; } catch (e) { return `error: ${e instanceof Error ? e.message : String(e)}`; }
  }, { timeout }), thrown]);
  const r = await ready.jsonValue();
  if (r !== 'ok') throw new Error(`the page is not ready: ${r}`);
  return { style: got.style, styles: got.styles };
}
