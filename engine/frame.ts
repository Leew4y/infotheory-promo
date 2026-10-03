/**
 * Frame pipeline: scene layer (slow camera, fades through paper or dark) -> K motion-blur sub-frames
 * accumulated on the GPU -> grain and grade -> back onto the canvas -> sharp overlays: chapter label,
 * page number, typeset captions. frame(T) is a pure function of T.
 */
import { ctx, cv, text, label, rule, C, F_EN, F_ZH } from './draw';
import { accumulate, glc, GRADE, PLATE_GRADE, post, type Grade } from './gl';
import { SC, sceneAt, camDrift } from './scene';
import { film, TOTAL } from './film';
import { clamp, eout, W, H, win } from './util';

export interface SubLine { a: number; b: number; zh: string; en: string; plate: boolean }
export const SUBS = (): SubLine[] => SC.flatMap((s) => s.subs.map(([a, b, zh, en]) => ({ a: s.t0 + a, b: s.t0 + b, zh, en, plate: s.kind === 'plate' })));

export function drawLayer(t: number, jx: number, jy: number): void {
  t = clamp(t, 0, TOTAL - 1e-3);
  const sc = sceneAt(t);
  const lt = t - sc.t0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.fillStyle = sc.kind === 'plate' ? '#0d0b09' : C.cream;
  ctx.fillRect(0, 0, W, H);
  const cam = sc.cam ? sc.cam(lt, sc.d) : camDrift()(lt, sc.d);
  ctx.save();
  ctx.translate(W / 2 + jx + (cam.x ?? 0), H / 2 + jy + (cam.y ?? 0));
  ctx.scale(cam.z, cam.z);
  ctx.translate(-W / 2, -H / 2);
  sc.draw(lt, sc.d, t);
  ctx.restore();
  const fade = 1 - win(lt, 0, sc.d, sc.fi ?? 0.6, sc.fo ?? 0.6);
  if (fade > 0) {
    ctx.fillStyle = sc.fade ?? (sc.kind === 'plate' ? '#0d0b09' : C.cream);
    ctx.globalAlpha = fade;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

/** Top-left chapter label ("01 — 惊讶 · SURPRISE") and bottom-right page number, on pages only. */
function chapterLabel(lt: number, d: number, n: number, ch: [string, string]): void {
  const a = win(lt, 0.2, d, 0.8, 0.5);
  if (a <= 0) return;
  const x = 150, y = 132;
  const num = String(n).padStart(2, '0');
  text(num, x, y, { font: F_EN, size: 26, color: C.rust, alpha: a, ls: 2 });
  rule(x + 52, y - 9, x + 52 + 40 * eout(clamp((lt - 0.3) / 0.8)), y - 9, C.rust, a, 1.5);
  text(ch[0], x + 108, y, { size: 26, weight: 600, color: C.ink, alpha: a, ls: 3 });
  label(ch[1], x + 108 + ctx.measureText(ch[0]).width + 60, y - 1, a, C.grey, 17);
  label(`${num} / ${String(film().chapters).padStart(2, '0')}`, W - 150, H - 96, a * 0.9, C.grey, 16, 'right');
}

let subsCache: SubLine[] | null = null;
function captions(T: number): void {
  subsCache ??= SUBS();
  for (const s of subsCache) {
    if (T < s.a - 0.6 || T > s.b + 0.6) continue;
    const a = win(T, s.a, s.b, 0.55, 0.55);
    if (a <= 0) continue;
    const rise = (1 - eout(clamp((T - s.a) / 0.7))) * 10;
    if (s.plate) {
      text(s.zh, W / 2, 900 + rise, { size: 38, weight: 500, color: C.paper, alpha: a, align: 'center', ls: 3 });
      text(s.en, W / 2, 950 + rise, { font: F_EN, style: 'italic', size: 24, color: C.paper2, alpha: a * 0.9, align: 'center' });
    } else {
      rule(150, 900, 150 + 36, 900, C.rust, a, 1.5);
      text(s.zh, 150, 950 + rise, { size: 34, weight: 500, color: C.ink, alpha: a, ls: 2 });
      text(s.en, 150, 990 + rise, { font: F_EN, style: 'italic', size: 23, color: C.grey, alpha: a });
    }
  }
}

function overlays(T: number): void {
  const sc = sceneAt(T);
  if (sc.kind === 'page' && sc.chapter && sc.ch) chapterLabel(T - sc.t0, sc.d, sc.chapter, sc.ch);
  captions(T);
}

const SHUTTER = 0.5;
const JIT: [number, number][] = [[0.5, 0.5], [0.25, 0.75], [0.75, 0.25], [0.125, 0.625], [0.625, 0.125], [0.375, 0.375], [0.875, 0.875], [0.0625, 0.5625]];

/** Render the frame at time T. samples > 1 averages the scene's `mb` sub-frames over half a frame (motion blur). */
export function frame(T: number, fps = 30, samples = 1): void {
  T = clamp(T, 0, TOTAL - 1e-3);
  const sc = sceneAt(T);
  const K = samples > 1 ? Math.max(1, sc.mb ?? 3) : 1;
  for (let k = 0; k < K; k++) {
    let tk = K > 1 ? Math.max(0, T + ((k + 0.5) / K - 0.5) * (SHUTTER / fps)) : T;
    if (sceneAt(tk) !== sc) tk = T;
    drawLayer(tk, K > 1 ? JIT[k][0] - 0.5 : 0, K > 1 ? JIT[k][1] - 0.5 : 0);
    accumulate(k, K);
  }
  const g: Grade = { ...GRADE, ...(sc.kind === 'plate' ? PLATE_GRADE : {}), ...(sc.grade ?? {}) };
  post(T, g, fps);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(glc, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  overlays(T);
}

export { cv, F_ZH };
