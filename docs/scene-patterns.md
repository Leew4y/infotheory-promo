# Writing a scene

How the scenes in this repository are written, with the code they use. `AGENTS.md` says what is forbidden; this says what
works. Every snippet is copied from the file named beside it: read that file for the whole scene.

## Shape

A scene file is constants and small pure helpers, then one `scene({ ... })`. `draw(lt)` starts with `background()` and
draws everything from `lt`, the scene's local time in seconds. Plan films use `planScene('<id>', { draw })` and take their
text from `copy(id, key)`; hand-written films use `scene` or `narratedScene`.

```ts
scene({
  name: 'entropy', kind: 'page', dur: bars(6), mb: 3, chapter: 2, ch: ['熵', 'Entropy'],
```
`films/infotheory/scenes/entropy.ts`. `bars(n)` keeps the scene on the music's grid.

Write geometry as constants from `M`, `COL`, `W`, `H`, and colours and fonts as `C.*` and `F.*`, so the scene works in every
style. A portrait film branches on `portrait()` (`templates/film/scenes/idea.ts`).

## Time

Every moving value is a function of `lt`. Four shapes cover nearly all of it:

| Want | Write | Note |
|---|---|---|
| Appear at `t0` | `sstep(t0, t0 + 0.6, lt)` | 0 before, 1 after, smooth between |
| Appear, then leave | `win(lt, 1.4, 5.2, 0.9, 0.7)` | fade in 0.9 s, out 0.7 s |
| Progress of a move | `clamp((lt - t0) / dur)` | linear 0 to 1 |
| Shape that progress | `eout(...)`, `eio(...)` | ease out, ease in and out |

**Name a block, and multiply its alpha into everything inside.** The block leaves as one, and nothing runs while it is
hidden.

```ts
    const aD = 1 - sstep(9.0, 9.8, lt);
    if (aD > 0) {
```
`films/infotheory/scenes/entropy.ts`

**Stagger with the index.**

```ts
        const a = aD * sstep(0.9 + i * 0.12, 1.2 + i * 0.12, lt);
```
`films/infotheory/scenes/entropy.ts`

**Let one progress drive a sequence.**

```ts
    circle(x0, y, 56, clamp(k * 3));
    circle(xm, y, 56, clamp(k * 3 - 1), C.accent);
    circle(x1, y, 56, clamp(k * 3 - 2));
```
`templates/film/scenes/idea.ts`

## Drawing in

`ink(pts, k, ...)` draws a polyline up to fraction `k`, and `circle` and the rest take the same `k`: a line that is being
written reads better than one that fades in.

```ts
    ink([[X0, Y1 - 10], [X0, Y0], [X1 + 10, Y0]], ka, C.fg2, 1.5);
```
`films/infotheory/scenes/surprise.ts`

## Numbers

Interpolate the data and compute the number from it, so what is on screen is true at every frame.

```ts
      const p = mixP(mixP(FLAT, PEAK, m1), SPIKE, m2);
```
```ts
      const H = entropy(p);
```
`films/infotheory/scenes/entropy.ts`

## Landing on the voice

In a narrated scene, take times from the narration and never write them by hand: the animation stays on the sentence
after a re-synthesis.

```ts
    const [t1, tb] = voParts('kernel1', K1), t2 = vo('kernel2'), t3 = vo('fixed'), t4 = vo('n27');
```
`films/math-lessons/scenes/kernel.ts`. `vo(id)` is where a line starts; `voParts(id, parts)` is where each part of it is
spoken. Sound effects use the same clock, through `at`:

```ts
  sfx: (at) => [[at('kernel1'), 'chime', { midi: bell(14) }],
```

## What repeats

Drawing used by several scenes of one film goes in that film's `lib.ts`, in the style's roles (`films/math-lessons/lib.ts`).
Films do not import each other: something two films need belongs in `engine/` or a style.

## What goes wrong

| Do not | Do instead |
|---|---|
| Keep a variable that `draw` changes, at module level or anywhere else (`just regress` reports the frame as order-dependent) | Compute it from `lt` |
| Use `Math.random` or the clock | `mulberry`, `hash1`, `noise1` with a fixed seed |
| Put text straight on a full-frame plate | `backdrop(...)` under it |
| Show the same sentence large and as a caption | A keyword, a number or a diagram; or `shown` for a line displayed verbatim |
| Write a colour, font name or a style's margin into a scene | `C.*`, `F.*`, `M`, `COL` |
| End a large display line in ，、；：。 | `displayText(s)` |
| Leave a chart label faint because it looks elegant | `just validate` reports text under contrast at partial alpha: keep labels readable |
