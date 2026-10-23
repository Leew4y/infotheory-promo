---
name: make-film
description: Make a demo or explainer film in this repo from a brief — plan (film-plan.json), scenes, screen captures, narration, music, renders, self-checks and revisions — with the person approving the direction and the final cut. Use when asked to make a new film, a hackathon demo video, or to revise one end to end.
---

# Making a film

The engine renders; you write the plan and the scenes, check, and revise. Commands, layout and rules: `AGENTS.md`.
A look of its own (if the film needs one): `.claude/skills/design-style/SKILL.md`. Keep every intermediate product in
the film's directory — the film's history is part of its deliverable (`films/math-lessons` is the worked example):

- `brief.md` / `brief.json`: what was asked and agreed;
- `research/`: sources with the excerpts you rely on, the fact table (each fact with its source and the exact wording
  it allows), the argument map; keep superseded versions (`facts.v2.md`) rather than overwriting;
- `script/`: narration, captions and storyboard drafts, versioned (`narration.v3.md`);
- `review/`: one `NN-<topic>.md` per review round or audit, with the sheets and frames it refers to, and
  `workflow-notes.md` for what in the tools or these instructions was unclear or failed.

## 0. Brief (with the person)

`films/<id>/brief.json` (schema: `schemas/brief.schema.json`) and, for anything longer, `brief.md`: the product, who
watches and where, target length, tone, what must be shown (screens, numbers, names), language, what to avoid. Ask
only what changes the film; take sensible defaults for the rest and say which. The brief and the research can be
written into `films/<id>/` before there is any film code: `just new-film` adds the template around them later. A
hackathon demo: 60–120 s; problem → what the product does (live screens) → how it works → result with a number → one
closing line.

## 1. Plan

`just new-film <id> <style> --plan` (also into a `films/<id>/` that holds only the brief and research; or keep an
existing film), then write `films/<id>/film-plan.json`
(`schemas/film-plan.schema.json`): scenes in order, each with its kind (page, plate, demo), its narration lines
(`lines`: text for the captions, `read` for how numbers, versions and amounts are said) or a fixed `dur` with
`captions`, its on-screen `copy` by key, and for demo scenes the `capture` (asset, edit, camera). The plan is the
only place for copy and timing: scenes draw, they do not hold text. `just plan-check <id>` must pass before anything
else.

Narration: about 4 Chinese characters per second with the default voice (`zh-male-professor`); a line of more than
~45 characters reads long on screen — split it. The film's length follows the voice (narrated scenes), never cut
footage (demo scenes keep at least their edit).

## 2. Material

- Screen captures: a scripted web demo with `just capture <id> <capture-id> <scenario.ts>` (Playwright, records
  clicks), or any recording with `just import-capture`. Add `--store-source` so the source video (at most 25 MB) is
  committed in `films/<id>/captures/sources/` and the film renders on another machine after `just captures <id>`;
  a larger source stays outside the repository: write down where it is (the review notes or the brief).
- Voice: `just narrate <id>` (the first run on a machine needs `just tts-setup`, a ~10 GB download: ask first).
  Synthesis is not repeatable: the FLACs are committed; `--resynth` changes timing.
- Music: a `score.py` (see `films/infotheory/score.py`, `films/math-lessons/score.py`) rendered with `just music <id>`,
  or `just mix <id> --music <file>` with a licensed track (record it in `assets.json`), or `--music none`.
- Any other file under `films/<id>/assets/` goes into `films/<id>/assets.json` with source, licence and sha256.

## 3. Scenes

`just scaffold <id>` writes a module per plan scene (never overwrites). Fill in `draw` with the style's roles
(`text`, `statement`, `plate`, `backdrop`, `C.*`, `F.*`, `M`, `COL`), texts from `copy(sceneId, key)`, animations
landing on `vo(lineId)` (or on a phrase: `voParts(lineId, parts)`). In a film's own `narratedScene` (not yet in a
plan film: the plan schema and `planScene` do not take them): `split: 16` for phrase captions synced to the voice,
`shown: [...]` for lines the page displays verbatim (quotes, refrains), so they are not captioned twice. With
`punctuation: 'display'` in `defineFilm` (the templates set it), captions hold one sentence each and large display
lines follow the display punctuation rule (AGENTS.md): no trailing ，、；：。 — the line break is the pause — except a 。
in a block whose other line ends in ？ or ！; use `displayText`. Then `just fonts <id>` and `just build <id>`.

## 4. Look at it, cheaply

- One scene: `just render-scene <id> <scene> --draft` (seconds); a stretch: `just render-range <id> <from> <to> --draft`.
- Moments in every style: `just sheet <id>`; single frames: `just shots <id> 12.5,40`. Against looks the film does
  not use: `just sheet-compare <id> <style>[,<style>]` (no edit to the film by hand; it is undone after one build).
- Look at the frames yourself (read the images) before showing anyone: legibility, what the eye goes to, whether the
  demo screen is readable at its size, whether a number on screen matches the narration.

## 5. Check (all must pass)

```bash
just plan-check <id>        # plan, modules, copy only from the plan, captures, narration lock, assets
just validate <id>          # rendering, safe area, overlaps, contrast, glyphs, display punctuation (+ plan diagnostics)
just mix <id>               # final mix: every line >= 6 dB over the music, -16 LUFS
```

## 6. Revise (at least one full round on your own)

Write down what is wrong (in `films/<id>/review/NN-*.md`): accuracy of every claim and number, clarity of the
argument in 60–120 s, pacing (no scene longer than its content), legibility, consistency of terms. Fix in the plan
first, then the scenes; re-narrate only changed lines. For anything factual, keep sources in `films/<id>/research/`.
Check the facts against `just texts <id>` (`out/<id>/texts.md`): every displayed string and every spoken line with
its scene and time, exactly as the sources hold them; it is also what to hand an outside fact-checker.

## 7. Export and hand over

`just export <id>` (final, ~9 fps on 4 workers: a 90 s film takes about 5 minutes; check that no other export runs).
Hand the person the MP4, the sheet and a short note: what was verified, what was not, what you chose for them.
The person approves the film; do not publish it. No credit line on screen unless the person asks for one.
