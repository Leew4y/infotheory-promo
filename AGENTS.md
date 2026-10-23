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
| `just new-film <id> <style> --plan` | start a plan film (plate, narrated page, captioned page), then narrate and make fonts |
| `just plan-schema` / `just plan-check <film> [--json]` | generate the committed editor schemas; check the plan, modules, copy, references, assets and narration lock |
| `just scaffold <film>` | create missing plan scene modules and rewrite the ordered index; keep every existing module |
| `just render-scene <film> <scene-id> [--draft] [--style id]` | silent scene MP4 in `out/<film>/render/`; one JSON summary on stdout |
| `just render-range <film> <from> <to> [--draft] [--style id]` | silent half-open range in film seconds, snapped to frames; filenames use the start/end frame numbers |
| `just test-plan` | plan workflow, real short exports and deliberate failures of the plan checks |
| `just fonts <film>` | font subsets for the film's text, per style (run after changing any text) |
| `just glyphs <film> [--style id]` | glyph proof for review: the film's character set in every font of each style, drawn from the committed subsets at 48 px with code points and the character in the system font beside it → `out/<film>/glyphs/<style>/NN-<face>.png` + `index.json` |
| `just glyph-check <font-id>[,<id>] (--text <chars> \| --film <film> [--style id]) [--ref id] [--json]` | the glyph check `just fonts` runs, on catalog CJK fonts without subsetting: vet a font before a style uses it; exit 1 on an error |
| `just validate <film> [--style id]` | schema, timeline, rendering, text inside the 5 % safe area, no overlapping text, WCAG AA contrast (as exported, glyph by glyph, on sampled frames), display punctuation (warning); `--json` gives the diagnostics list |
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
| `just narrate <film> [--resynth ids\|all]` | synthesize plan lines (otherwise `narration.json`) into `films/<film>/narration/<id>.flac` and the lock (`narration.lock.json`); both committed |
| `just mix <film> [--music file\|none]` | final mix: music ducked under the narration, mastered to −16 LUFS → `out/<film>/master.wav` (the export uses it and refuses a stale one) |
| `just tts-setup`, `just test-narration` | local TTS (Fun-CosyVoice3-0.5B, pinned, into `.cache/tts/`); narration end-to-end cases on the fake voice |

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
- Font characters and glyphs. `just fonts` subsets to the film's characters: its string literals, the plan or
  `narration.json`, printable ASCII, and `films/<film>/fonts.extra.txt` if present, a plain text file whose
  characters are added as they are (newlines ignored). List there what code produces at run time and no literal
  contains: `toUpperCase()` (math-lessons lists Ó for CÓRDOBA), `String.fromCodePoint`, `Intl` formatting.
  A catalog entry may carry `"defects": { "note", "source" }`, a known fault of the upstream file (`just font-catalog`
  marks it DEFECTS; `zcool-xiaowei` has one). `just fonts` refuses such a font unless the style's `fonts.json` entry
  gives `"acceptDefects": "<why>"`, which only a person can agree to. Before writing anything, `just fonts` runs a
  glyph check (`scripts/glyph_check.py`, pinned fontTools) on each CJK face (tag `zh`) over the film's characters.
  Errors: two characters drawn alike (ZCOOL XiaoWei's 己 and 巳), a filled counter or solid block (its 回), and a
  full-width mark set at Latin width or filled (its 。). Warnings: punctuation sized or placed unlike Noto Serif SC /
  Noto Sans SC, ideographs not 1 em wide. An error stops `just fonts` (the old subsets stay) unless the face has
  `acceptDefects`. The check reads outlines: it cannot see that a glyph reads as another character (ZCOOL XiaoWei's
  受 reads as 要). After choosing or changing a style's fonts, run `just glyphs <film>` and read every cell; vet a
  candidate CJK font first with `just glyph-check <id> --film <film>`.
- Text on a full-frame plate goes over `backdrop(...)` so it stays readable.
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
  edits, camera or cursor keys fail at registration. Capture sources (videos) stay outside the repository; only
  manifests are committed. A failed import or recording leaves the previous asset and source as they were.
- Narration: lines in `film-plan.json` for a plan film, otherwise `films/<film>/narration.json` (`id`, `scene`, `text` for the captions, `en`, `read` for how the
  voice says numbers, versions, amounts, `pause`); `useNarration(script, lock)` in film.ts after `defineFilm`. Time a
  scene by its lines with `narratedScene({ name, kind, draw, lead, gap, tail, minDur })` or `demoScene({ ..., narration: {} })`
  (the footage is never cut short); the lines become the captions; `vo(id)` is a line's start on its scene's clock,
  the anchor for animations that land on a sentence. The lock records each line's speech spans (pauses measured from
  the committed audio), so within a line: `split: 16` makes phrase captions of at most 16 character widths, each shown
  from where it is spoken (Netflix-style timing); `shown: [ids] | true` gives lines displayed verbatim (quotes,
  refrains, plates) no caption; `voParts(id, parts)` gives where each part of a line is spoken, for animations that land
  on a phrase; `sfx` may be a function of `at(id)`. `placeNarration` retimes the scene's own captions to the speech the
  same way. Synthesis samples:
  a line's audio cannot be made again identically, so it is committed and a re-synthesis (`--resynth`) changes the
  timeline. Run `just fonts <film>` after changing captions. With narration, `demoScene`'s `dur` is a minimum (footage
  is never cut). A film with narration exports only with a current final mix (`just mix`; `just all` runs music → mix →
  export); write numbers, versions and amounts out in `read` (the voice has no text normaliser).
- Done means: `just check`, `just check-imports`, `just validate <film>` (0 errors in every style) and `just regress
  <film>` (every style with a baseline) pass, and the sheet has been looked at. The layout checks sample five frames
  per scene and judge axis-aligned boxes: a strong heuristic, not a proof. Report what was verified, what was not, and
  anything only inferred.

## Making a film

Follow `.claude/skills/make-film/SKILL.md` (brief -> plan -> material -> scenes -> cheap renders -> checks -> a
self-review round -> export -> the person). `films/raa-demo` is a worked example: a plan-driven demo of a real site,
with its capture scenario, narration, score and review notes.

## Designing a look

Follow `.claude/skills/design-style/SKILL.md` (brief -> directions -> style package -> sheet -> self-review -> person).
