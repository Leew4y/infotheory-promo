// The film's timing grid (80 BPM, one bar = 3 s; 66 bars plus a 4 s tail = 202 s; eight chapters) and its style.
// Imported by the film entry before any scene, so scenes register against this grid and read this style.
import { defineFilm } from '../../engine/film';
import { useStyle } from '../../engine/style';
import paperDawn from '../../styles/paper-dawn';

useStyle(paperDawn);
export default defineFilm({ id: 'infotheory', bpm: 80, bars: 66, tail: 4, chapters: 8 });
