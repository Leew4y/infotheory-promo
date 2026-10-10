---
name: make-film
description: Make a demo or explainer film in this repo from a brief — plan (film-plan.json), scenes, screen captures, narration, music, renders, self-checks and revisions — with the person approving the direction and the final cut. Use when asked to make a new film, a hackathon demo video, or to revise one end to end.
---

# Making a film

The engine renders; you write the plan and the scenes, check, and revise. Commands, layout and rules: `AGENTS.md`.
A look of its own (if the film needs one): `.claude/skills/design-style/SKILL.md`. Keep every intermediate product in
the film's directory (brief, plan, scripts, review notes) — the film's history is part of its deliverable.

## 0. Brief (with the person)

`films/<id>/brief.json` (schema: `schemas/brief.schema.json`) and, for anything longer, `brief.md`: the product, who
watches and where, target length, tone, what must be shown (screens, numbers, names), language, what to avoid. Ask
only what changes the film; take sensible defaults for the rest and say which. A hackathon demo: 60–120 s; problem →
what the product does (live screens) → how it works → result with a number → one closing line.

## 1. Plan

`just new-film <id> <style> --plan` (or keep an existing film), then write `films/<id>/film-plan.json`
(`schemas/film-plan.schema.json`): scenes in order, each with its kind (page, plate, demo), its narration lines
(`lines`: text for the captions, `read` for how numbers, versions and amounts are said) or a fixed `dur` with
`captions`, its on-screen `copy` by key, and for demo scenes the `capture` (asset, edit, camera). The plan is the
only place for copy and timing: scenes draw, they do not hold text. `just plan-check <id>` must pass before anything
else.

Narration: about 5 Chinese characters per second with this voice (`cosyvoice-zero-shot`); a line of more than
~45 characters reads long on screen — split it. The film's length follows the voice (narrated scenes), never cut
footage (demo scenes keep at least their edit).

## 2. Material

- Screen captures: a scripted web demo with `just capture <id> <capture-id> <scenario.ts>` (Playwright, records
  clicks), or any recording with `just import-capture`. Source videos stay outside the repository.
- Voice: `just narrate <id>` (the first run on a machine needs `just tts-setup`, a ~10 GB download: ask first).
  Synthesis is not repeatable: the FLACs are committed; `--resynth` changes timing.
- Music: a `score.py` (see `films/infotheory/score.py`, `films/math-lessons/score.py`) rendered with `just music <id>`,
  or `just mix <id> --music <file>` with a licensed track (record it in `assets.json`), or `--music none`.
- Any other file under `films/<id>/assets/` goes into `films/<id>/assets.json` with source, licence and sha256.

## 3. Scenes

`just scaffold <id>` writes a module per plan scene (never overwrites). Fill in `draw` with the style's roles
(`text`, `statement`, `plate`, `backdrop`, `C.*`, `F.*`, `M`, `COL`), texts from `copy(sceneId, key)`, animations
landing on `vo(lineId)`. Then `just fonts <id>` and `just build <id>`.

## 4. Look at it, cheaply

- One scene: `just render-scene <id> <scene> --draft` (seconds); a stretch: `just render-range <id> <from> <to> --draft`.
- Moments in every style: `just sheet <id>`; single frames: `just shots <id> 12.5,40`.
- Look at the frames yourself (read the images) before showing anyone: legibility, what the eye goes to, whether the
  demo screen is readable at its size, whether a number on screen matches the narration.

## 5. Check (all must pass)

```bash
just plan-check <id>        # plan, modules, copy only from the plan, captures, narration lock, assets
just validate <id>          # rendering, safe area, overlaps, contrast, glyphs (+ plan diagnostics)
just mix <id>               # final mix: every line >= 6 dB over the music, -16 LUFS
```

## 6. Revise (at least one full round on your own)

Write down what is wrong (in `films/<id>/review/NN-*.md`): accuracy of every claim and number, clarity of the
argument in 60–120 s, pacing (no scene longer than its content), legibility, consistency of terms. Fix in the plan
first, then the scenes; re-narrate only changed lines. For anything factual, keep sources in the film's directory.

## 7. Export and hand over

`just export <id>` (final, ~9 fps on 4 workers: a 90 s film takes about 5 minutes; check that no other export runs).
Hand the person the MP4, the sheet and a short note: what was verified, what was not, what you chose for them.
The person approves the film; do not publish it. No credit line on screen unless the person asks for one.
