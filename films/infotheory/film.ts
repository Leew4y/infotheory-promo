// The film's timing grid: 80 BPM (one bar = 3 s), 66 bars plus a 4 s tail = 202 s; eight chapters.
import { defineFilm } from '../../engine/film';

export default defineFilm({ id: 'infotheory', bpm: 80, bars: 66, tail: 4, chapters: 8 });
