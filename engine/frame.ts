/**
 * Frame pipeline: scene layer (slow camera, fades through the style's fill) -> K motion-blur sub-frames
 * accumulated on the GPU -> grain and grade -> back onto the canvas -> sharp overlays from the style: chapter label,
 * page number, captions. frame(T) is a pure function of T.
 */
import { ctx, scaleText, textMark } from './draw';
import { accumulate, glc, post, type Grade } from './gl';
import { SC, sceneAt, camDrift } from './scene';
import { film, FPS, frameOf, TOTAL } from './film';
import { style, type SubLine } from './style';
import { clamp, sstep, W, H } from './util';
import { ensure, type MediaRef } from './media';

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
  const cam = sc.cam ? sc.cam(lt, sc.d) : camDrift()(lt, sc.d);
  const mark = textMark();
  ctx.save();
  ctx.translate(W / 2 + jx + (cam.x ?? 0), H / 2 + jy + (cam.y ?? 0));
  ctx.scale(cam.z, cam.z);
  ctx.translate(-W / 2, -H / 2);
  sc.draw(lt, sc.d, t);
  ctx.restore();
  // Fade-in over the first `fi` seconds, fade-out over the last `fo`; 0 means none. With fi > 0 the first frame
  // is entirely the fade colour: the scene rises out of it.
  const fi = sc.fi ?? S.motion.fadeIn, fo = sc.fo ?? S.motion.fadeOut;
  const shown = (fi > 0 ? sstep(0, fi, lt) : 1) * (fo > 0 ? 1 - sstep(sc.d - fo, sc.d, lt) : 1);
  const fade = 1 - shown;
  if (fade > 0) {
    S.transition(fade, sc.fade ?? fill);
    scaleText(mark, 1 - fade);
  }
}

/**
 * The output frame (its index on the film's frame grid) while frame() runs. Media (a capture's source frame) is chosen
 * from it, never from a motion-blur sub-frame's time: the global contract "sub-frames move the camera and vector
 * drawing, not footage". An index, not a time: local times computed from it are exact multiples of 1 / fps.
 */
let outF = 0;
export const outputFrame = (): number => outF;

/** The media frames the output frame at T needs (from its scene's need(), at the frame's local time). */
export function needsAt(T: number): MediaRef[] {
  T = clamp(T, 0, TOTAL - 1e-3);
  const sc = sceneAt(T);
  return sc.need ? sc.need((frameOf(T) - sc.f0) / FPS, sc.d) : [];
}
/** Load everything frame(T) will draw; resolves when it can be drawn synchronously. */
export const prepare = (T: number): Promise<void> => ensure(needsAt(T));

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
  outF = frameOf(T);
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
