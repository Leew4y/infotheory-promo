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
  regress baselines `regress/<style>.<os-arch>.json`. Scenes and music belong to the film; only the look is shared.
  Around the code, all committed (the film's history is part of its deliverable; `films/math-lessons` is the example):
  - `brief.json` (schema `schemas/brief.schema.json`) and/or `brief.md`: product, audience, length, tone, what to show;
  - `research/`: sources and their excerpts, the fact table, the argument map, with versions kept (`facts.v2.md`);
  - `script/`: narration, captions and storyboard drafts, versioned (`narration.v3.md`);
  - `review/`: `NN-<topic>.md` review rounds and audits (with their sheets and frames), `workflow-notes.md`;
  - a plan film's `film-plan.json`; narration `narration.json` (hand-written films), `narration/<id>.flac` and
    `narration.lock.json`; `assets/` with `assets.json`;
  - screen captures: manifests `captures/<id>.json`, scenario scripts `capture/<name>.ts`, and source videos of at
    most 25 MB in `captures/sources/` (larger ones stay outside the repository; see Rules). No `.json` file goes under
    `captures/sources/` (a plan film's glob would read it as a manifest).
  Research and brief may come first: `just new-film` adds the template to a `films/<id>/` that has no film code yet.
- Imports (enforced by `just check-imports`): films use `engine/index.ts` and `styles/<id>/index.ts` only; styles
  use `engine/` and themselves; nothing imports another film, another style, or a template.
- `films/infotheory` is the reference film. Do not change its content; style or engine changes that alter its pixels
  are behaviour changes: say so, show before/after frames to the person, and only then re-record its baselines.

## Commands

Every film command takes the film id first (default `infotheory`); outputs go to `out/<film>/`.

| Command | What |
|---|---|
| `just new-film <id> <style>` / `just new-style <id>` | start from a template; `films/<id>/` may already hold the brief, `research/`, `script/`, `review/` (no film code: no `film.ts`, `main.ts`, `scenes/`, `film-plan.json`): the template is added around them, nothing replaced |
| `just new-film <id> <style> --plan` | start a plan film (plate, narrated page, captioned page), then narrate and make fonts |
| `just new-film <id> <style> [--plan] --portrait` | the same with a 1080 × 1920 frame (phones): `size` in `film-plan.json` / `defineFilm` |
| `just plan-schema` / `just plan-check <film> [--json]` | generate the committed editor schemas; check the plan, modules, copy, references, assets and narration lock |
| `just scaffold <film>` | create missing plan scene modules and rewrite the ordered index; keep every existing module |
| `just render-scene <film> <scene-id> [--draft] [--style id] [--res px]` | silent scene MP4 in `out/<film>/render/`; one JSON summary on stdout |
| `just render-range <film> <from> <to> [--draft] [--style id]` | silent half-open range in film seconds, snapped to frames; filenames use the start/end frame numbers |
| `just test-plan` | plan workflow, real short exports and deliberate failures of the plan checks |
| `just fonts <film>` | font subsets for the film's text, per style (run after changing any text) |
| `just validate <film> [--style id]` | schema, timeline, rendering, text inside the 5 % safe area, no overlapping text, WCAG AA contrast (as exported, glyph by glyph, on sampled frames), display punctuation (warning); `--json` gives the diagnostics list |
| `just sheet <film> [--style a,b]` | contact sheet of representative moments in every style: `out/<film>/sheet/sheet.jpg` + `sheet.json` |
| `just sheet-compare <film> <style>[,<style>] [--times t1,t2]` | the same sheet with styles the film does not use (its styles first) → `out/<film>/sheet-compare/`: for one build it writes their font bundles and adds them to `film.ts` / `film-plan.json`, then restores both byte for byte (also after Ctrl+C; a killed run is undone by the next one) |
| `just texts <film> [--style id]` | every displayed and spoken text for fact-checking → `out/<film>/texts.md` + `texts.json`: per scene with film times, plan title/copy/captions, narration lines (`text`, `read`, `en`, lines without a caption marked), then the literals of the film's code (in a hand-written film: its captions and labels) |
| `just shots <film> 5,20.5 [--style id]` | single frames |
| `just dev <film>` | preview at http://127.0.0.1:5174 (`?style=<id>`) |
| `just regress <film>` | pixel regression per style against this platform's baseline `regress/<style>.<os>-<arch>.json` (`--update` only after a person approved the change) |
| `just export <film> [workers crf] [--noaudio] [--style id] [--res <px>] [--maxrate <Mbit/s>] [--for x]` | the video; `--res` = pixels on the short side (1440, 2160; 720 for a small preview), rendered at that scale, not upscaled, named `<film>[-<style>]-<res>p.mp4`; `--for x` caps the bitrate at 20 Mbit/s and warns past 140 s / 512 MB |
| `just check`, `just check-imports`, `just test-validate`, `just test-export <film>` | type check, boundaries, tests |
| `just font-catalog` | download and verify the whole font library |
| `just import-capture <film> <id> <video> [--fps 30] [--crop W:H:X:Y] [--events f.jsonl --sync rec=video] [--store-source]` | a screen recording (OBS, any video) becomes capture `<id>`: manifest `films/<film>/captures/<id>.json`, frames in `.cache/captures/<film>/<id>/`; `--store-source` also puts the video in `films/<film>/captures/sources/` (at most 25 MB) |
| `just capture <film> <id> <scenario.ts> [--store-source]` | record a web demo with Playwright (`scripts/lib/scenario.ts`), with click and pointer events; the source video goes to `out/<film>/sources/`, with `--store-source` to `films/<film>/captures/sources/` (at most 25 MB) |
| `just captures <film> [dir]` | re-derive every capture's frames from its source videos (by name in `dir`, default `films/<film>/captures/sources/`, checked by sha256) |
| `just test`, `just test-capture`, `just bench-capture` | unit tests; capture end-to-end cases; capture throughput and memory |
| `just narrate <film> [--resynth ids\|all]` | synthesize plan lines (otherwise `narration.json`) into `films/<film>/narration/<id>.flac` and the lock (`narration.lock.json`); both committed |
| `just mix <film> [--music file\|none]` | final mix: music ducked under the narration, mastered to −16 LUFS → `out/<film>/master.wav` (the export uses it and refuses a stale one) |
| `just tts-setup`, `just test-narration` | local TTS into `.cache/tts/`: on Apple silicon the `speech` tool and Fun-CosyVoice3-0.5B in MLX (2.3 GB, pinned, backend `cosyvoice3-mlx`), elsewhere the PyTorch model (5.4 GB, backend `cosyvoice3`); narration end-to-end cases on the fake voice |
| `just voice-design <voice> --describe "A=<text>" [...]` / `--pick A` | Apple silicon: design voice prompts from descriptions (Qwen3-TTS VoiceDesign, pinned), check them (transcribed back, pitch), audition each read by CosyVoice3 (`out/voice-design/<voice>/*-sample.mp3`), keep one as `voices/<voice>/` with its provenance |
| `just doctor`, `just mac-setup` | what this machine has and the command for each gap (read-only); macOS from scratch (`Brewfile`, setup, tts-setup, doctor) |

## Rules

- A plan film's copy and timing live in `film-plan.json`; scenes draw. `usePlan(plan, lock?, captures?)` follows
  `defineFilm`, and each `scenes/<id>.ts` makes one direct `planScene('<id>', { draw, ... })` call. `copy(id, key)`
  rejects unknown keys. The template bundles capture manifests with an eager glob (third argument to `usePlan`);
  `capture.asset` is a film-relative `captures/<id>.json` path. Boot requires exactly the planned registrations and
  styles in order. The ID `index` is reserved. Omitted bpm/chapters mean 80/0; narrated plans require `voice`.
  `title` also supplies the chapter label when `chapter` is present. Narrated scenes omit `dur` and `captions`;
  their lines supply captions and sentence timing. Non-narrated demos may omit `dur` and use the footage length.
- `plan-check`'s copy rule is deliberately a heuristic: a decoded string/template text part containing CJK or at
  least four English words separated by whitespace must equal displayed text in the plan (title, copy, captions, lines, capture title).
  Comments are ignored; computed strings and shorter English literals are not proof-checked. JSON Schema covers
  editor structure; Zod also enforces cross-field refinements. After changing the contract, run `just plan-schema`.
  Scaffold never removes old modules: after deleting a plan scene, remove its module explicitly.
- Every file shipped in a film's `assets/` is listed in its `assets.json` with film-relative `path`, `kind`, non-empty
  `source` and `license`, and matching lowercase `sha256`; optional `generator`, `seed`, `notes` record provenance.
  Captures, narration FLACs and fonts retain their own manifests/locks. No general asset loader is needed for this phase.
- `frame(t)` is a pure function of `t`: no `Math.random`, no wall clock, no state carried between frames; use
  `mulberry`, `hash1`, `noise1` with fixed seeds.
- Text only through `text()` / `label()` / the style's blocks, in the style's font roles (`F.body`, `F.latin`, `F.math`,
  `F.mono`) and palette roles (`C.fg`, `C.muted`, `C.accent`, ...). No hex colours, font names or pixel margins that
  belong to a style inside scenes; geometry from `M`, `COL`, `W`, `H`.
- Fonts come only from `fonts/catalog.json`; a style lists the ids it uses in `fonts.json`. Adding a font to the
  catalog (a download) needs the person's confirmation.
- Text on a full-frame plate goes over `backdrop(...)` so it stays readable.
- Frame and resolution: a film's frame is `size` in `film-plan.json` / `defineFilm` (default [1920, 1080], both even;
  [1080, 1920] for phones). `W`, `H`, `M`, `COL` and `portrait()` are live values set when the film is defined: scenes
  and style functions read them at draw time; a style module never computes geometry from them at its top level (it
  loads before the film is defined; use a getter, as the styles' `demo.area`). A style supports portrait with
  `layout.portrait` and portrait branches in its overlays (captions above the bottom quarter, where phone apps put their
  own text; its own type larger); landscape geometry must stay as it was (regress). Everything is drawn in frame units;
  the export's `--res` scales the canvas (`SCALE`): an offscreen canvas a style draws at frame size and then copies
  with an identity transform must have `W·SCALE × H·SCALE` pixels, and a shader effect sized in pixels uses
  `gl_FragCoord.xy / uScale`. validate, regress, sheet and shots render at scale 1.
- Display punctuation (Chinese, Develata 2026-10-13; a film opts in with `defineFilm({ ..., punctuation: 'display' })`,
  as the templates, math-lessons, raa-demo and infotheory do): on screen a line break is the pause. A large display line (>= 32
  px) does not end in ，、；：。; ？！, a dash and an ellipsis stay; a block that also ends a line in ？ or ！ keeps its 。
  so the sentences read in parallel. Pass display lines through `displayText(s, stop)`; small print (sources, notes)
  keeps its punctuation; captions hold one sentence each (cut at 。；？！) and drop the same marks from their Chinese
  line (the engine does it), and so does
  `statement()`. `just validate` warns (`display-punctuation`).
- Product demos: `demoScene({ name, asset, edit, camera, cursor, clicks, title, ... })` (engine/demo.ts) with an asset
  imported from `films/<film>/captures/<id>.json`. The edit lists source segments `{ from, to, speed }` in recording order,
  without overlap (cuts between them; no reordering or repeats);
  the camera is keyframes `{ t, x, y, zoom }` in frame pixels on the scene's clock; cursor and clicks come from the
  recorded events, or keyframes for a recording without events; a click shows from the frame its time falls in. Invalid
  edits, camera or cursor keys fail at registration. Manifests are committed; frames are derived and are not. A
  source video of at most 25 MB may be committed in `captures/sources/` (`--store-source`; this replaces the earlier
  rule that every source stays outside, so that a demo renders on another machine); a larger one stays outside the
  repository, and whoever recorded it says where it is. Before rendering (validate, export, shots, render-scene,
  render-range, sheet, regress), every capture manifest of the film must have all its frames in
  `.cache/captures/<film>/<id>/`; otherwise the tool stops (exit 2) naming the capture, its source and sha256 and the
  command that rebuilds the frames (`just captures <film> [dir]`), or saying that the source is not on this machine.
  A failed import or recording leaves the previous asset and source as they were.
- Narration: lines in `film-plan.json` for a plan film, otherwise `films/<film>/narration.json` (`id`, `scene`, `text` for the captions, `en`, `read` for how the
  voice says numbers, versions, amounts, `pause`); `useNarration(script, lock)` in film.ts after `defineFilm`. Time a
  scene by its lines with `narratedScene({ name, kind, draw, lead, gap, tail, minDur })` or `demoScene({ ..., narration: {} })`
  (the footage is never cut short); the lines become the captions; `vo(id)` is a line's start on its scene's clock,
  the anchor for animations that land on a sentence. The lock records each line's speech spans (pauses measured from
  the committed audio), so within a line: `split: 16` makes phrase captions of at most 16 character widths, each shown
  from where it is spoken (Netflix-style timing); `shown: [ids] | true` gives lines displayed verbatim (quotes,
  refrains, plates) no caption; `voParts(id, parts)` gives where each part of a line is spoken, for animations that land
  on a phrase; `sfx` may be a function of `at(id)`. `placeNarration` retimes the scene's own captions to the speech the
  same way. A line's audio is committed and a re-synthesis (`--resynth`) changes the timeline: another machine or
  backend gives other audio (on Apple silicon the same seed repeats exactly, on CUDA it is not guaranteed). Each lock
  line records its backend (`cosyvoice3` PyTorch, `cosyvoice3-mlx` Apple silicon) and is kept as long as its reading,
  voice and seed are unchanged, whichever machine runs `just narrate`; new or changed lines use this machine's backend
  (`--backend` to choose). New plan films use the voice `zh-female-warm` (chosen by The-Walls, 2026-10-23); a voice is
  a designed or licensed prompt clip, never a clone of a real person without their consent. Run `just fonts <film>` after changing captions. With narration, `demoScene`'s `dur` is a minimum (footage
  is never cut). A film with narration exports only with a current final mix (`just mix`; `just all` runs music → mix →
  export); write numbers, versions and amounts out in `read` (the voice has no text normaliser).
- Done means: `just check`, `just check-imports`, `just validate <film>` (0 errors in every style) and `just regress
  <film>` (every style with a baseline for this platform) pass, and the sheet has been looked at. Baselines are per
  platform because text rasterises differently on macOS and Windows; record a missing one for your platform from a
  known-good commit (`scripts/regress.ts` header: a worktree build and `--dist ... --update`), never from your change,
  and say which platform's baselines you could not run. The layout checks sample five frames
  per scene and judge axis-aligned boxes: a strong heuristic, not a proof. Report what was verified, what was not, and
  anything only inferred.

## Making a film

Follow `.claude/skills/make-film/SKILL.md` (brief -> plan -> material -> scenes -> cheap renders -> checks -> a
self-review round -> export -> the person). `films/raa-demo` is a worked example: a plan-driven demo of a real site,
with its capture scenario, narration, score and review notes.

## Designing a look

Follow `.claude/skills/design-style/SKILL.md` (brief -> directions -> style package -> sheet -> self-review -> person).
