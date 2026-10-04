/**
 * Scene registry. A scene declares a duration; scenes are laid end to end in registration order on the film's
 * frame grid (the timeline contract is in film.ts). Each draws itself for a local time `lt` onto the shared 2D canvas. Two kinds of scene: `page` (warm paper, ink, a chapter label
 * and a page number) and `plate` (the full-bleed dawn horizon, a quote). Registration order = film order.
 */
import { appendFrames, durFrames, film, FPS } from './film';
import { check, SceneSpec } from './schema';
import { style } from './style';
import type { Grade } from './gl';

export type Sub = [number, number, string, string];
export type Sfx = [number, string, Record<string, number | string>?];
export interface Cam { z: number; x?: number; y?: number }

export interface SceneDef {
  name: string;
  kind: 'page' | 'plate';
  /** Duration in seconds; the scene lasts round(dur * fps) frames. bars(n) converts bars of the film's grid. */
  dur: number;
  /** Fade in / out seconds (default .6), colour the fade goes through (default: paper for pages, near-black for plates). */
  fi?: number;
  fo?: number;
  fade?: string;
  /** Motion-blur sub-frames in export (default 3). */
  mb?: number;
  grade?: Partial<Grade>;
  /** Chapter: number 1..8 and [zh, en]; pages without a chapter (preface, colophon) leave it out. */
  chapter?: number;
  ch?: [string, string];
  subs: Sub[];
  sfx?: Sfx[];
  cam?: (lt: number, d: number) => Cam;
  draw: (lt: number, d: number, t: number) => void;
  /** Resolved: start and end frame (half-open), start time and duration in seconds. */
  f0: number;
  f1: number;
  t0: number;
  d: number;
}

export const SC: SceneDef[] = [];
export function scene(o: Omit<SceneDef, 'f0' | 'f1' | 't0' | 'd'>): SceneDef {
  film();
  check(SceneSpec, o, `scene "${o.name}"`);
  const n = durFrames(o.dur);
  if (n < 1) throw new Error(`invalid scene "${o.name}":
  dur: ${o.dur}s is less than one frame at ${FPS} fps`);
  const f0 = appendFrames(n);
  const s: SceneDef = { ...o, f0, f1: f0 + n, t0: f0 / FPS, d: n / FPS };
  SC.push(s);
  return s;
}
/** A slow push-in: the only camera move on pages. */
export const camDrift = (amt?: number) => (lt: number, d: number): Cam => ({ z: 1 + ((amt ?? style().motion.drift) * lt) / d });
export const sceneAt = (t: number): SceneDef => {
  let sc = SC[0];
  for (const s of SC) if (t >= s.t0) sc = s;
  return sc;
};
