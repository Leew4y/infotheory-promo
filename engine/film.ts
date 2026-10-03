/**
 * The film being rendered: its timing grid and chapter count. A film's film.ts calls defineFilm() once, before any
 * scene module registers (the film entry imports film.ts first). The timing values are live bindings: read them at
 * registration or draw time, not at engine module load.
 */
export interface FilmMeta {
  id: string;
  /** Tempo of the bar grid; one bar is four beats. */
  bpm: number;
  /** Length in bars, plus a tail in seconds after the last bar. */
  bars: number;
  tail: number;
  /** Number of chapters, for the page-number overlay. */
  chapters: number;
}

export let FILM: FilmMeta | null = null;
export let BPM = 0;
export let BEAT = 0;
export let BAR = 0;
export let EIGHTH = 0;
export let TOTAL = 0;

export function defineFilm(m: FilmMeta): FilmMeta {
  if (FILM) throw new Error(`film already defined: ${FILM.id}`);
  FILM = m;
  BPM = m.bpm;
  BEAT = 60 / BPM;
  BAR = BEAT * 4;
  EIGHTH = BEAT / 2;
  TOTAL = m.bars * BAR + m.tail;
  return m;
}

export function film(): FilmMeta {
  if (!FILM) throw new Error('no film defined: import the film module (defineFilm) before its scenes');
  return FILM;
}

export const bars = (n: number): number => n * BAR;
