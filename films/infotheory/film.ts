// The film's frame grid (30 fps), bar grid (80 BPM, one bar = 3 s), eight chapters, and its styles.
// The scenes add up to 66 bars plus a 4 s tail on the last scene = 202 s = 6060 frames.
// Imported by the film entry before any scene, so scenes register against this grid and read the active style:
// the first listed by default, another with ?style=<id> in the page URL.
import { defineFilm, selectStyle } from '../../engine';
import paperDawn from '../../styles/paper-dawn';
import nebula from '../../styles/nebula';

selectStyle([paperDawn, nebula]);
export default defineFilm({ id: 'infotheory', fps: 30, bpm: 80, chapters: 8 });
