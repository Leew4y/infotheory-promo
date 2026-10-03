/**
 * Scene registry. A scene owns a window of bars on the film's grid (see film.ts) and draws itself for a
 * local time `lt` onto the shared 2D canvas. Two kinds of scene: `page` (warm paper, ink, a chapter label
 * and a page number) and `plate` (the full-bleed dawn horizon, a quote). Registration order = film order.
 */
import { BAR, film } from './film';
import type { Grade } from './gl';

export type Sub = [number, number, string, string];
export type Sfx = [number, string, Record<string, number | string>?];
export interface Cam { z: number; x?: number; y?: number }

export interface SceneDef {
  name: string;
  kind: 'page' | 'plate';
  /** Start bar and length in bars. */
  start: number;
  len: number;
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
  t0: number;
  d: number;
}

export const SC: SceneDef[] = [];
export function scene(o: Omit<SceneDef, 't0' | 'd'>): SceneDef {
  film();
  const s: SceneDef = { ...o, t0: o.start * BAR, d: o.len * BAR };
  SC.push(s);
  return s;
}
/** A slow push-in: the only camera move on pages. */
export const camDrift = (amt = 0.025) => (lt: number, d: number): Cam => ({ z: 1 + (amt * lt) / d });
export const sceneAt = (t: number): SceneDef => {
  let sc = SC[0];
  for (const s of SC) if (t >= s.t0) sc = s;
  return sc;
};
