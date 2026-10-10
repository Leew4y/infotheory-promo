// The film's frame grid and its styles: the first listed is the default, another with ?style=<id> in the page URL.
// Imported by the film entry before any scene, so scenes register against this grid and read the active style.
import { defineFilm, selectStyle } from '../../engine';
import style from '../../styles/paper-dawn';

selectStyle([style]);
export default defineFilm({ id: 'template', fps: 30, bpm: 80, chapters: 1 });
