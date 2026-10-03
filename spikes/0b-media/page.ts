/**
 * Phase 0b diagnostic page: the existing engine (src/engine, unmodified) with one "capture" scene type
 * that draws a pre-split image sequence. Built by run.ts with Bun.build; served with ?media=jpg|png&n=<frames>&cam=0|1.
 *
 * Contract under test: the source frame is chosen from the OUTPUT frame number only, never from the
 * motion-blur sub-frame time. The page records every draw so the checker can assert it.
 */
import { scene } from '../../engine/scene';
import { frame } from '../../engine/frame';
import { cv, ctx } from '../../engine/draw';
import { gpuName } from '../../engine/gl';
import { BAR, readBarcode } from './barcode';

const q = new URLSearchParams(location.search);
const MEDIA = q.get('media') ?? 'jpg';
const NSRC = +(q.get('n') ?? 2700);
const CAP = +(q.get('cache') ?? 32);
const CAM = q.get('cam') === '1';
const FPS = 30;

// ---- image sequence loader: on-demand fetch + decode, LRU of at most CAP ImageBitmaps
const cache = new Map<number, ImageBitmap>();
const pending = new Map<number, Promise<void>>();
const pad = (i: number) => String(i).padStart(5, '0');
function load(i: number): Promise<void> {
  if (cache.has(i)) {
    const b = cache.get(i)!;
    cache.delete(i);
    cache.set(i, b);
    return Promise.resolve();
  }
  let p = pending.get(i);
  if (!p) {
    p = fetch(`/media/${MEDIA}/${pad(i)}.${MEDIA}`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`missing source frame ${i}`))))
      .then((b) => createImageBitmap(b))
      .then((bmp) => {
        cache.set(i, bmp);
        pending.delete(i);
        while (cache.size > CAP) {
          const [k, old] = cache.entries().next().value!;
          cache.delete(k);
          old.close();
        }
      });
    pending.set(i, p);
  }
  return p;
}

// ---- the capture scene
let outFrame = 0;
const srcFor = (f: number) => Math.min(Math.max(f, 0), NSRC - 1);
const draws: { tk: number; src: number; have: boolean; level: number }[] = [];
const PATCH = { x: 1680, y: 40, w: 200, h: 60 };
function drawCapture(_lt: number, _d: number, t: number): void {
  const src = srcFor(outFrame);
  const bmp = cache.get(src);
  if (bmp) ctx.drawImage(bmp, 0, 0, 1920, 1080);
  else {
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0, 0, 1920, 1080);
  }
  // Accumulation patch: grey level from the sub-frame offset (-, 0, +) -> 30, 100, 230. K=3 should average to 120.
  const off = t - outFrame / FPS;
  const level = off < -1e-6 ? 30 : off > 1e-6 ? 230 : 100;
  ctx.fillStyle = `rgb(${level},${level},${level})`;
  ctx.fillRect(PATCH.x, PATCH.y, PATCH.w, PATCH.h);
  draws.push({ tk: t, src, have: !!bmp, level });
}
const common = {
  // fi/fo = 0 disables the scene fade. Any fi > 0 makes a scene's first frame fully faded (win() is 0 at lt = 0),
  // which would hide the barcode; with 0, win() evaluates 0/0 = NaN and `fade > 0` is false. Phase 1 should make
  // "no fade" explicit instead of relying on NaN.
  kind: 'page' as const, len: 15, fi: 0, fo: 0, mb: 3, subs: [],
  grade: { bloom: 0, ca: 0, vig: 0, grain: 0, sat: 1, split: 0 },
  cam: CAM ? (lt: number, d: number) => ({ z: 1 + (0.2 * lt) / d, x: 40 * Math.sin(lt * 2) }) : () => ({ z: 1 }),
  draw: drawCapture,
};
scene({ ...common, name: 'capture-a', start: 0 });
scene({ ...common, name: 'capture-b', start: 15 });

declare global {
  interface Window {
    __prepare: (f: number, ahead?: number) => Promise<void>;
    __render: (f: number, samples: number) => void;
    __probe: () => { code: number; white: number; black: number; patch: number; expectedPatch: number; draws: typeof draws };
    __jpeg: () => string;
    __gpu: () => string;
    __cacheSize: () => number;
  }
}
window.__prepare = async (f, ahead = 8) => {
  const want: number[] = [];
  for (let i = f; i < Math.min(f + ahead, NSRC); i++) want.push(i);
  await load(srcFor(f));
  void Promise.all(want.map(load)).catch(() => {});
};
window.__render = (f, samples) => {
  outFrame = f;
  draws.length = 0;
  frame(f / FPS, FPS, samples);
};
window.__probe = () => {
  const strip = ctx.getImageData(0, BAR.y, 1920, BAR.h).data;
  const r = readBarcode(strip, 1920, 0);
  const p = ctx.getImageData(PATCH.x + 50, PATCH.y + 15, 100, 30).data;
  let s = 0;
  for (let i = 0; i < p.length; i += 4) s += p[i];
  const patch = s / (p.length / 4);
  const expectedPatch = draws.reduce((a, d) => a + d.level, 0) / Math.max(1, draws.length);
  return { ...r, patch, expectedPatch, draws: [...draws] };
};
window.__jpeg = () => cv.toDataURL('image/jpeg', 0.95);
window.__gpu = gpuName;
window.__cacheSize = () => cache.size;
