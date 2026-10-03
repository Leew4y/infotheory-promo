/**
 * Frame pipeline: scene layer (slow camera, fades through the style's fill) -> K motion-blur sub-frames
 * accumulated on the GPU -> grain and grade -> back onto the canvas -> sharp overlays from the style: chapter label,
 * page number, captions. frame(T) is a pure function of T.
 */
import { ctx } from './draw';
import { accumulate, glc, post, type Grade } from './gl';
import { SC, sceneAt, camDrift } from './scene';
import { film, TOTAL } from './film';
import { style, type SubLine } from './style';
import { clamp, W, H, win } from './util';

export type { SubLine };
export const SUBS = (): SubLine[] => SC.flatMap((s) => s.subs.map(([a, b, zh, en]) => ({ a: s.t0 + a, b: s.t0 + b, zh, en, plate: s.kind === 'plate' })));

export function drawLayer(t: number, jx: number, jy: number): void {
  t = clamp(t, 0, TOTAL - 1e-3);
  const sc = sceneAt(t);
  const lt = t - sc.t0;
  const S = style();
  const fill = sc.kind === 'plate' ? S.fills.plate : S.fills.page;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, W, H);
  const cam = sc.cam ? sc.cam(lt, sc.d) : camDrift(S.motion.drift)(lt, sc.d);
  ctx.save();
  ctx.translate(W / 2 + jx + (cam.x ?? 0), H / 2 + jy + (cam.y ?? 0));
  ctx.scale(cam.z, cam.z);
  ctx.translate(-W / 2, -H / 2);
  sc.draw(lt, sc.d, t);
  ctx.restore();
  const fade = 1 - win(lt, 0, sc.d, sc.fi ?? S.motion.fadeIn, sc.fo ?? S.motion.fadeOut);
  if (fade > 0) {
    ctx.fillStyle = sc.fade ?? fill;
    ctx.globalAlpha = fade;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

let subsCache: SubLine[] | null = null;
function overlays(T: number): void {
  const sc = sceneAt(T);
  const S = style();
  if (sc.kind === 'page' && sc.chapter && sc.ch) S.chapterLabel(T - sc.t0, sc.d, sc.chapter, sc.ch, film().chapters);
  subsCache ??= SUBS();
  S.captions(T, subsCache);
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
  const S = style();
  const g: Grade = { ...S.grade, ...(sc.kind === 'plate' ? S.plateGrade : {}), ...(sc.grade ?? {}) };
  post(T, g, fps);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(glc, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  overlays(T);
}
