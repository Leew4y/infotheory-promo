/**
 * The film being rendered: frame rate, tempo of its bar grid, chapter count, and the resolved timeline.
 * A film's film.ts calls defineFilm() once, before any scene module registers (the film entry imports film.ts first).
 *
 * Timeline contract (docs/plan/reusable-engine.md, "全局契约"):
 *   - the authoritative unit is the film frame (an integer at `fps`);
 *   - a scene declares a duration in seconds; it lasts round(dur * fps) frames (half rounds up), at least 1;
 *   - scenes are laid end to end in registration order: start frames are the running sum of frame counts, so
 *     there are no gaps or overlaps, and no rounding error accumulates; a scene covers the half-open [start, end);
 *   - the film lasts the sum of its scenes' frames (a closing tail belongs to the last scene).
 * The timing values are live bindings that grow as scenes register: read them at draw time, not at module load.
 */
import { check, FilmSpec } from './schema';

export interface FilmMeta {
  id: string;
  /** Frames per second of the film's frame grid. */
  fps: number;
  /** Tempo of the bar grid used by bars() and the score; one bar is four beats. */
  bpm: number;
  /** Number of chapters, for the page-number overlay. */
  chapters: number;
}

export let FILM: FilmMeta | null = null;
export let FPS = 0;
export let BPM = 0;
export let BEAT = 0;
export let BAR = 0;
export let EIGHTH = 0;
/** Film length in frames and in seconds; both grow as scenes register. */
export let FRAMES = 0;
export let TOTAL = 0;

export function defineFilm(m: FilmMeta): FilmMeta {
  if (FILM) throw new Error(`film already defined: ${FILM.id}`);
  check(FilmSpec, m, 'film');
  FILM = m;
  FPS = m.fps;
  BPM = m.bpm;
  BEAT = 60 / BPM;
  BAR = BEAT * 4;
  EIGHTH = BEAT / 2;
  return m;
}

export function film(): FilmMeta {
  if (!FILM) throw new Error('no film defined: import the film module (defineFilm) before its scenes');
  return FILM;
}

/** Seconds -> whole frames for an ordinary duration (half rounds up). */
export const durFrames = (seconds: number): number => Math.floor(seconds * FPS + 0.5);

/** Append `n` frames to the film; returns the start frame. Called by scene() only. */
export function appendFrames(n: number): number {
  const start = FRAMES;
  FRAMES += n;
  TOTAL = FRAMES / FPS;
  return start;
}

/** Seconds spanned by `n` bars of the film's grid. */
export const bars = (n: number): number => n * BAR;
