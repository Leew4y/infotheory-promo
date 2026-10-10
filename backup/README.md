# backup

Kept, not used. Nothing here is built, type-checked or imported (`tsconfig.json` and `just check-imports` cover only
engine/, films/, styles/, templates/, scripts/).

- `styles/math-lessons-b` (Chapel) and `styles/math-lessons-c` (Manifesto): the two style directions not chosen for
  math-lessons (2026-10-09, Develata chose vigil; set aside 2026-10-10). The packages are unchanged, so their relative
  imports (`../../engine/...`) assume their original place `styles/<id>/`.
- `films/math-lessons/fonts/math-lessons-{b,c}`: their font subsets as last generated (for the v3 text).

To use one again: move it back to `styles/<id>/`, import it in `films/<film>/film.ts` (`selectStyle`), run `just fonts <film>`
and `just validate <film> --style <id>`. The directions and their sheet: films/math-lessons/review/01-directions.md.
