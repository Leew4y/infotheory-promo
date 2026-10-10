// The film's frame grid and its styles: the first listed is the default, another with ?style=<id> in the page URL.
// Imported by the film entry before any scene, so scenes register against this grid and read the active style.
//
// Conventions of this film (its styles render them):
//   - captions are Chinese only; a caption's second slot (Sub[3], the "en" line elsewhere) carries the verse mark:
//     "1".."19" for a factual line (its number in script/storyboard.md, listed on the closing index page), "◇" for a
//     claim of the film, a counter-argument or a line of the essay, "" for the later parts of the same sentence;
//   - chapter labels are [Chinese title, ''].
import { defineFilm, selectStyle, useNarration } from '../../engine';
import script from './narration.json';
import lock from './narration.lock.json';
import vigil from '../../styles/vigil';

// vigil is the chosen look (2026-10-09); the other two directions (Chapel, Manifesto) are kept unused in backup/.
selectStyle([vigil]);
export default defineFilm({ id: 'math-lessons', fps: 30, bpm: 60, chapters: 4 });
// the voice (2026-10-10): narration.json, made by just narrate; lines placed at fixed times in the scenes
useNarration(script as never, lock as never);
