/**
 * Phase 0d: GPU capability check and sample frames on this machine.
 *
 *   bun run build && bun spikes/0d-macos/gpu-check.ts [--out spikes/0d-macos]
 *
 * Launches Chrome the way the exporter would on this platform (ANGLE d3d11 on Windows, browser default elsewhere;
 * CPU 2D canvas), then reports: WebGL2 availability, renderer, EXT_color_buffer_float, OES_texture_float_linear,
 * RGBA16F framebuffer completeness, shader compile/link of a half-float render, and renders three film frames
 * (a horizon plate, a page, a plate-to-page transition) to PNG for a visual check. Exit code 1 if a required capability is missing.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dir, '../..');
const argv = Bun.argv.slice(2);
const OUT = path.resolve(ROOT, argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'spikes/0d-macos');
const DIST = path.join(ROOT, 'dist');
if (!existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/index.html missing: run `bun run build` first');
const CHROME = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
if (!CHROME) throw new Error('Chrome not found (set CHROME_PATH)');
mkdirSync(path.join(OUT, 'frames'), { recursive: true });

const server = Bun.serve({
  hostname: '127.0.0.1', port: 0,
  async fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/favicon.ico') return new Response(null, { status: 204 });
    const f = Bun.file(path.join(DIST, p === '/' ? 'index.html' : p));
    return (await f.exists()) ? new Response(f) : new Response('not found', { status: 404 });
  },
});
const ARGS = ['--window-size=1920,1080', '--ignore-gpu-blocklist', '--mute-audio', '--no-first-run', '--disable-accelerated-2d-canvas',
  ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }, args: ARGS });
const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e instanceof Error ? e.message : String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://127.0.0.1:${server.port}/?export=1`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.__frame === 'function' && window.__ready(), { timeout: 60_000 });

const caps = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  if (!gl) return { webgl2: false } as Record<string, unknown>;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const cbf = !!gl.getExtension('EXT_color_buffer_float');
  const tfl = !!gl.getExtension('OES_texture_float_linear');
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 64, 64, 0, gl.RGBA, gl.HALF_FLOAT, null);
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  const fbo = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return [s, gl.getShaderParameter(s, gl.COMPILE_STATUS)] as const; };
  const [vs, vok] = sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }');
  const [fs, fok] = sh(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float; out vec4 o; void main(){ o = vec4(0.25, 0.5, 0.75, 1.); }');
  const pr = gl.createProgram()!;
  gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
  const linked = gl.getProgramParameter(pr, gl.LINK_STATUS);
  gl.useProgram(pr);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, 64, 64); gl.drawArrays(gl.TRIANGLES, 0, 3);
  const px = new Float32Array(4);
  gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.FLOAT, px);
  const halfFloatRender = Math.abs(px[0] - 0.25) < 1e-3 && Math.abs(px[1] - 0.5) < 1e-3 && Math.abs(px[2] - 0.75) < 1e-3;
  return {
    webgl2: true,
    renderer: String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
    EXT_color_buffer_float: cbf, OES_texture_float_linear: tfl, rgba16fFramebufferComplete: fbo,
    shaderCompile: vok && fok, programLink: linked, halfFloatRender, glError: gl.getError(),
  };
});

// sample frames: horizon plate (dawn), a page (surprise), the dusk1 -> compress transition
const frames = [[10, 'dawn-plate'], [33, 'surprise-page'], [65.8, 'dusk1-fade']] as const;
for (const [t, name] of frames) {
  await page.evaluate((t) => void window.__frame(t, 30), t);
  const png: string = await page.evaluate(() => (document.getElementById('c') as HTMLCanvasElement).toDataURL('image/png'));
  writeFileSync(path.join(OUT, 'frames', `${name}.png`), Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'));
}
const required = ['webgl2', 'EXT_color_buffer_float', 'rgba16fFramebufferComplete', 'shaderCompile', 'programLink', 'halfFloatRender'];
const missing = required.filter((k) => !caps[k]);
const result = { platform: `${process.platform} ${process.arch}`, chrome: await browser.version(), args: ARGS, caps, pageErrors: errors, missing, pass: missing.length === 0 && errors.length === 0 };
writeFileSync(path.join(OUT, 'gpu-check.json'), JSON.stringify(result, null, 1));
console.log(`${result.pass ? 'PASS' : 'FAIL'} gpu-check: missing [${missing.join(', ')}], ${errors.length} page errors -> ${path.join(OUT, 'gpu-check.json')}`);
await browser.close();
server.stop(true);
process.exit(result.pass ? 0 : 1);
