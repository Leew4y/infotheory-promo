# AGENTS.md

Instructions for coding agents (Claude Code, Codex) working in this repository. People: see README.md (Chinese).

## What this is

An engine for short explainer / demo films rendered in the browser (Canvas2D + WebGL2) and exported frame-exactly
with headless Chrome and ffmpeg. A person describes the film; the agent writes or changes scenes and styles, renders,
checks, and revises. The plan and its records: `docs/plan/reusable-engine.md`.

## Layout and boundaries

- Libraries (reusable): `engine/` (render core, drawing primitives, page hooks), `styles/<id>/` (style packages: the
  look), `fonts/catalog.json` (the font library), `audio/synth.py` (synthesizer), `templates/` (new film / new style).
- A film is `films/<id>/`: `film.ts` (grid and its styles), `main.ts`, `scenes/` (one scene per file, order in
  `scenes/index.ts`), optional `score.py` (music placed by scene and bar), its font subsets `fonts/<style>/`, its
  regress baselines `regress/<style>.json`. Scenes and music belong to the film; only the look is shared.
- Imports (enforced by `just check-imports`): films use `engine/index.ts` and `styles/<id>/index.ts` only; styles
  use `engine/` and themselves; nothing imports another film, another style, or a template.
- `films/infotheory` is the reference film. Do not change its content; style or engine changes that alter its pixels
  are behaviour changes: say so, show before/after frames to the person, and only then re-record its baselines.

## Commands

Every film command takes the film id first (default `infotheory`); outputs go to `out/<film>/`.

| Command | What |
|---|---|
| `just new-film <id> <style>` / `just new-style <id>` | start from a template |
| `just fonts <film>` | font subsets for the film's text, per style (run after changing any text) |
| `just validate <film> [--style id]` | schema, timeline, rendering, text inside the 5 % safe area, no overlapping text, WCAG AA contrast (as exported, glyph by glyph, on sampled frames); `--json` gives the diagnostics list |
| `just sheet <film> [--style a,b]` | contact sheet of representative moments in every style: `out/<film>/sheet/sheet.jpg` + `sheet.json` |
| `just shots <film> 5,20.5 [--style id]` | single frames |
| `just dev <film>` | preview at http://127.0.0.1:5174 (`?style=<id>`) |
| `just regress <film>` | pixel regression per style (`--update` only after a person approved the change) |
| `just export <film> [workers crf] [--noaudio] [--style id]` | the video |
| `just check`, `just check-imports`, `just test-validate`, `just test-export <film>` | type check, boundaries, tests |
| `just font-catalog` | download and verify the whole font library |
| `just import-capture <film> <id> <video> [--fps 30] [--crop W:H:X:Y] [--events f.jsonl --sync rec=video]` | a screen recording (OBS, any video) becomes capture `<id>`: manifest `films/<film>/captures/<id>.json`, frames in `.cache/captures/<film>/<id>/` |
| `just capture <film> <id> <scenario.ts>` | record a web demo with Playwright (`scripts/lib/scenario.ts`), with click and pointer events; the source video goes to `out/<film>/sources/` |
| `just captures <film> <dir>` | re-derive every capture's frames from its source videos (by name in `<dir>`, checked by sha256) |
| `just test`, `just test-capture`, `just bench-capture` | unit tests; capture end-to-end cases; capture throughput and memory |
| `just narrate <film> [--resynth ids\|all]` | synthesize `films/<film>/narration.json` into `films/<film>/narration/<id>.flac` and the lock (`narration.lock.json`); both committed |
| `just mix <film> [--music file\|none]` | final mix: music ducked under the narration, mastered to −16 LUFS → `out/<film>/master.wav` (the export uses it and refuses a stale one) |
| `just tts-setup`, `just test-narration` | local TTS (Fun-CosyVoice3-0.5B, pinned, into `.cache/tts/`); narration end-to-end cases on the fake voice |

## Rules

- `frame(t)` is a pure function of `t`: no `Math.random`, no wall clock, no state carried between frames; use
  `mulberry`, `hash1`, `noise1` with fixed seeds.
- Text only through `text()` / `label()` / the style's blocks, in the style's font roles (`F.body`, `F.latin`, `F.math`,
  `F.mono`) and palette roles (`C.fg`, `C.muted`, `C.accent`, ...). No hex colours, font names or pixel margins that
  belong to a style inside scenes; geometry from `M`, `COL`, `W`, `H`.
- Fonts come only from `fonts/catalog.json`; a style lists the ids it uses in `fonts.json`. Adding a font to the
  catalog (a download) needs the person's confirmation.
- Text on a full-frame plate goes over `backdrop(...)` so it stays readable.
- Product demos: `demoScene({ name, asset, edit, camera, cursor, clicks, title, ... })` (engine/demo.ts) with an asset
  imported from `films/<film>/captures/<id>.json`. The edit lists source segments `{ from, to, speed }` in recording order,
  without overlap (cuts between them; no reordering or repeats);
  the camera is keyframes `{ t, x, y, zoom }` in frame pixels on the scene's clock; cursor and clicks come from the
  recorded events, or keyframes for a recording without events; a click shows from the frame its time falls in. Invalid
  edits, camera or cursor keys fail at registration. Capture sources (videos) stay outside the repository; only
  manifests are committed. A failed import or recording leaves the previous asset and source as they were.
- Narration: lines in `films/<film>/narration.json` (`id`, `scene`, `text` for the captions, `en`, `read` for how the
  voice says numbers, versions, amounts, `pause`); `useNarration(script, lock)` in film.ts after `defineFilm`. Time a
  scene by its lines with `narratedScene({ name, kind, draw, lead, gap, tail, minDur })` or `demoScene({ ..., narration: {} })`
  (the footage is never cut short); the lines become the captions; `vo(id)` is a line's start on its scene's clock,
  the only anchor for animations that land on a sentence (timing is per sentence, not per word). Synthesis samples:
  a line's audio cannot be made again identically, so it is committed and a re-synthesis (`--resynth`) changes the
  timeline. Run `just fonts <film>` after changing captions.
- Done means: `just check`, `just check-imports`, `just validate <film>` (0 errors in every style) and `just regress
  <film>` (every style with a baseline) pass, and the sheet has been looked at. The layout checks sample five frames
  per scene and judge axis-aligned boxes: a strong heuristic, not a proof. Report what was verified, what was not, and
  anything only inferred.

## Designing a look

Follow `.claude/skills/design-style/SKILL.md` (brief -> directions -> style package -> sheet -> self-review -> person).
