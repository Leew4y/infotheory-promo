// The film's frame grid and its styles: the first listed is the default, another with ?style=<id> in the page URL.
// Imported by the film entry before any scene, so scenes register against this grid and read the active style.
//
// Conventions of this film (its styles render them):
//   - captions are Chinese only; a caption's second slot (Sub[3], the "en" line elsewhere) carries the verse mark:
//     "1".."18" for a factual line (its number in script/storyboard.md, listed on the closing index page), "◇" for a
//     claim of the film, a counter-argument or a line of the essay, "" for the later parts of the same sentence;
//   - chapter labels are [Chinese title, ''].
import { defineFilm, selectStyle } from '../../engine';
import vigil from '../../styles/math-lessons-a';
import chapel from '../../styles/math-lessons-b';
import manifesto from '../../styles/math-lessons-c';

selectStyle([vigil, chapel, manifesto]);
export default defineFilm({ id: 'math-lessons', fps: 30, bpm: 60, chapters: 4 });
