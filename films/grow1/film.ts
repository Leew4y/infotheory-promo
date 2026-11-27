// 《长高一倍，体重变几倍？》: the first pilot short of the channel route 「离谱但精确」 (narrator 核算员), see
// D:/demo/.cache/market-research/route/route.md and pilot_short_1.md. Grid-paper look on the paper-dawn style.
// Delivered only as a vertical 9:16 cut composed by a Python script (captions from timeline.json), so scenes draw no
// captions; the export runs with --no-captions.
import { defineFilm, selectStyle, useNarration } from '../../engine';
import script from './narration.json';
import lock from './narration.lock.json';
import style from '../../styles/paper-dawn';

selectStyle([style]);
export default defineFilm({ id: 'grow1', fps: 30, bpm: 80, chapters: 0, punctuation: 'display' });
useNarration(script as never, lock as never);
