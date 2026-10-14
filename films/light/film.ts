// The film's frame grid (30 fps), bar grid (80 BPM, one bar = 3 s), nine chapters, and its style (nebula).
// Imported by the film entry before any scene, so scenes register against this grid and read the active style.
import { defineFilm, selectStyle } from '../../engine';
import nebula from '../../styles/nebula';

selectStyle([nebula]);
export default defineFilm({ id: 'light', fps: 30, bpm: 80, chapters: 9, punctuation: 'display' });
