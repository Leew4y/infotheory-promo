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
