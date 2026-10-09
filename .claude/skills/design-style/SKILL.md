---
name: design-style
description: Design the look of a new film in this repo — from a brief to a style package (palette, fonts from the catalog, page ground, full-frame shader, layout, motion) checked by validate and a contact sheet, with the person choosing the direction. Use when a new film needs its own look, or when asked to restyle one.
---

# Designing a look for a film

The look of a film is a style package in `styles/<id>/`. Scenes never change for a style; they name roles
(`C.accent`, `F.latin`, `statement()`, `plate()`, `backdrop()`), and the style decides how those look.
Commands and repository rules: `AGENTS.md`.

## 0. Brief

Read `films/<film>/brief.md`. If it is missing, write it with the person first:

```markdown
# Brief: <film>
- Subject and the one thing the viewer should remember:
- Audience, and where it is shown (screen, projector, phone):
- Length:
- Tone, 3–5 words:
- Must appear (product names, numbers, screenshots):
- References (described in words):
- Avoid:
```

## 1. Directions (the person chooses)

Propose 2–3 directions that differ in kind, not in shade. Each: a name, a sentence of mood, palette (6 colours with
roles), font pairing chosen from `fonts/catalog.json` by tag, the page ground, the full-frame background idea
(what `progress` and `highlight` become), and one line on motion.

Make one sample frame per direction: `just new-style <id>-a` etc., set palette, fonts and ground roughly, add them to
the film's `selectStyle([...])`, `just fonts <film>`, then `just sheet <film> --times <a page moment>,<a plate moment>`.
Show the person the sheet with the directions side by side. They pick one (or tell you to pick; then say which and
why). Remove the directions that were not chosen.

## 2. Build the style

`styles/<id>/STYLE.md` first (the template has the sections), then `index.ts` and `shader.ts`:

- Palette: semantic roles only. Secondary text (`muted`) and the accent used as small text need 4.5:1 against the
  page as rendered (vignette and texture darken it); large text (>= 24 px) 3:1. Plate text over `backdrop()`.
- Fonts: chains list only families in the style's `fonts.json`; CJK display faces tagged `gb2312` go before a full CJK
  face (Noto Sans SC / Noto Serif SC) so rare characters still render. Every text must be covered (validate checks).
- Page ground: quiet enough that thin lines and 15 px labels read; texture at low contrast.
- Plate shader: `uP` = progress (opening -> close), `uQ` = highlight; deterministic in `uTime`; no visible banding.
- Layout: `margin` and `column` are the grid scenes use; captions and chapter labels must stay inside the 5 % safe area.
- Motion: fades and transitions continuous at both ends (no jump on the first or last frame of a fade).
- Demo look (`demo`: the window around a screen capture, the cursor, the click ripple, and the default window `area`
  with `rippleDur` / `pressDur`): part of the style, in its palette and spirit; the area stays clear of the style's own
  chapter label and captions. Check it with a demo scene if the film has captures.

## 3. Check and self-review (at least one round)

```bash
just fonts <film>
just validate <film>                   # every style of the film: 0 errors (safe area, overlap, contrast, glyphs);
                                       # read the warnings too (text at 0.5-0.9 alpha, overlaps mid-fade)
just regress <film>                    # styles that already have a baseline must still pass; a new style has none yet
just sheet <film> --style <id>,<an existing style>
just shots <film> <t>,<t+1/30>,<t+2/30> --style <id>   # consecutive frames around each fade or transition
```

Look at the sheet image yourself and review against this list, writing the result to
`films/<film>/review/<NN>-<id>.md` (round number, the sheet command, findings, what you changed):

1. Hierarchy: the statement reads first, then the diagram, then labels; nothing competes with the statement.
2. Contrast and legibility, including the smallest labels and plate text.
3. The background supports the text and diagrams; it does not compete with them.
4. Colour: one accent, used sparingly and meaningfully; diagram colours are distinguishable.
5. Type: the pairing works in Chinese and Latin; sizes and tracking are consistent.
6. Motion: fades and transitions are smooth and consistent with the tone. A still sheet cannot show this: look at
   consecutive frames around the first and last frame of a fade (`just shots`), or watch `just dev <film>`
   (`?style=<id>`), and say which you did.
7. Distinct: next to paper-dawn and nebula it is clearly a different look.
8. It matches the brief's tone, and avoids what the brief says to avoid.

Fix, re-run, review again until the list holds.

## 4. Hand over

Give the person the sheet (send the image) and a short note: the direction, what changed in review, the validate
and regress results, and anything unverified. Their comments start another round of step 3. When they approve:
record the new style's baseline with `just regress <film> --update --style <id>` (only then, and only for that
style; if an existing style's baseline changed too, show its before/after frames first), commit, and record the
outcome in `review/`.

## Don'ts

- No new fonts without the person's confirmation (adding to the catalog downloads files).
- No changes to scenes to suit a style; if a scene cannot work in a style, report it as a finding.
- No randomness that is not seeded; no `Date`, no `performance.now()` in drawing.
- Do not re-record baselines of the reference film (`infotheory`) without showing before/after frames.
