/**
 * The engine's public API: everything a film (its film.ts, main.ts and scenes) may use. Films import only from here;
 * styles may also use the engine's internal modules. Enforced by scripts/check-imports.ts.
 */
export { ctx, text, measure, label, para, rgba, rule, ink, circlePts, circle, dot, hatch, arrow, rollNumber, bits, type TextOpts } from './draw';
export { C, F, M, COL, background, plate, statement, row, useStyle, type Palette, type Fonts, type PlateParams, type StylePackage } from './style';
export { scene, camDrift, type Cam, type SceneDef, type Sfx, type Sub } from './scene';
export { defineFilm, film, bars, BAR, BEAT, BPM, EIGHTH, FPS, FRAMES, TOTAL, type FilmMeta } from './film';
export { W, H, PI, TAU, clamp, lerp, sstep, eio, eout, ein, eexpo, win, mulberry, hash1, noise1 } from './util';
export type { Grade } from './gl';
export { boot, type BootOptions, type FontManifest } from './boot';
