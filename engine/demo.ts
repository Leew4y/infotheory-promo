/**
 * Demo scenes: a screen capture in a window on the page, with an edit (cut, trim, speed), a camera that zooms and pans
 * over the capture, a cursor and click ripples. The look of the window, cursor and ripple comes from the style
 * (StylePackage.demo); the capture and its edit from engine/capture.ts; loading from engine/media.ts.
 *
 * Contracts:
 *  - The capture frame shown is chosen from the output frame (frame.ts outputFrame, an index on the film's grid), never
 *    from a motion-blur sub-frame's time; the camera and the cursor move with the sub-frames, so they blur smoothly
 *    while the footage does not.
 *  - A click shows from the frame its time falls in (frame i covers [i / fps, (i + 1) / fps)): the ripple and the press
 *    start there, on every sub-frame of that frame, and never before it.
 *  - Without `dur` the scene lasts the edit rounded up to whole frames, so the last source frame is shown; a given `dur`
 *    shorter than the edit ends it early, a longer one holds the last frame.
 *  - Layout and timing of the window, ripple and press come from the style (StylePackage.demo); a scene may give `rect`.
 *  - The scene declares the frame it shows (need()), so the frame is loaded before it is drawn.
 *  - Cursor and clicks come from the capture's recorded events (mapped through the edit; events the edit cuts are noted
 *    and dropped), or from keyframes given in frame pixels on the scene's clock (for a recording without events).
 */
import { background, style } from './style';
import { ctx } from './draw';
import { outputFrame } from './frame';
import { FPS } from './film';
import { bitmap } from './media';
import { note } from './notes';
import { scene, type Sfx, type Sub, type SceneDef } from './scene';
import { narrationTiming, type NarrationTiming } from './narration';
import type { Grade } from './gl';
import { clamp } from './util';
import {
  cameraAt, cameraProblems, editDuration, editEvents, editProblems, sourceFrame, sourceTime, toFrame, viewTransform,
  type CamKey, type CaptureAsset, type Rect, type Segment,
} from './capture';

/** A cursor position in capture frame pixels at a scene-local time. */
export interface CursorKey { t: number; x: number; y: number }

export interface DemoOpts {
  name: string;
  asset: CaptureAsset;
  /** The parts of the recording to show (default: all of it). The scene lasts as long as the edit unless dur is given. */
  edit?: Segment[];
  dur?: number;
  /**
   * Narration over the capture (engine/narration.ts): the scene lasts max(narration with its lead and tail, the edit),
   * so the footage is never cut short; with `dur` given, at least `dur`. The lines become captions.
   */
  narration?: NarrationTiming;
  /** The window title (e.g. the product or page). */
  title?: string;
  /** Camera keyframes in frame pixels on the scene's clock (default: the whole frame). */
  camera?: CamKey[];
  /**
   * Cursor keyframes and clicks in frame pixels on the scene's clock; when given they replace the recorded events.
   * cursor: false shows no cursor (the clicks, recorded or given, still show).
   */
  cursor?: CursorKey[] | false;
  clicks?: CursorKey[];
  /** The window's rect on the canvas (default: the style's demo area, fitted to the capture's aspect). */
  rect?: Rect;
  fi?: number;
  fo?: number;
  mb?: number;
  /** The scene's grade over the style's (e.g. no grain or vignette on footage). */
  grade?: Partial<Grade>;
  chapter?: number;
  ch?: [string, string];
  subs?: Sub[];
  sfx?: Sfx[];
  /** Drawn over the capture, under the cursor: annotations. `at` maps frame pixels to canvas pixels at this moment. */
  overlay?: (lt: number, d: number, at: (x: number, y: number) => { x: number; y: number }) => void;
}

/** Fit a frame of the asset's aspect inside the style's demo area. */
function defaultRect(asset: CaptureAsset): Rect {
  const box = style().demo.area;
  const s = Math.min(box.w / asset.width, box.h / asset.height);
  const w = asset.width * s, h = asset.height * s;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** Problems with cursor or click keyframes: finite numbers; cursor times strictly increasing. */
function keyProblems(what: string, keys: CursorKey[] | undefined, ordered: boolean): string[] {
  const out: string[] = [];
  (keys ?? []).forEach((k, i) => {
    if (![k.t, k.x, k.y].every(Number.isFinite)) out.push(`${what} ${i}: t, x, y must be finite numbers (got ${JSON.stringify(k)})`);
    if (ordered && i && !(k.t > keys![i - 1].t)) out.push(`${what} ${i}: t ${k.t} must be after the previous key's ${keys![i - 1].t}`);
  });
  return out;
}

/** Interpolation through keyframes with the style's easing, held at the ends. */
function along(keys: CursorKey[], lt: number, ease: (u: number) => number): { x: number; y: number } | null {
  if (!keys.length) return null;
  if (lt <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    if (lt < keys[i].t) {
      const a = keys[i - 1], b = keys[i];
      const e = ease((lt - a.t) / (b.t - a.t));
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
    }
  }
  return keys[keys.length - 1];
}

/** Register a demo scene (a page scene that shows a capture). */
export function demoScene(o: DemoOpts): SceneDef {
  const asset = o.asset;
  const edit = o.edit ?? [{ from: 0, to: asset.frames / asset.fps }];
  const problems = [...editProblems(edit, asset), ...cameraProblems(o.camera ?? []), ...keyProblems('cursor', o.cursor || undefined, true), ...keyProblems('clicks', o.clicks, false)];
  if (o.rect && !(['x', 'y', 'w', 'h'] as const).every((k) => Number.isFinite(o.rect![k])) || o.rect && !(o.rect.w > 0 && o.rect.h > 0)) problems.push(`rect: finite, with w and h > 0 (got ${JSON.stringify(o.rect)})`);
  if (problems.length) throw new Error(`demo scene "${o.name}" (capture ${asset.id}): ${problems.join('; ')}`);
  // cursor and clicks: given keyframes, or the recorded events seen through the edit
  let cursor = o.cursor || [];
  let clicks = o.clicks ?? [];
  if (!o.cursor && !o.clicks && asset.events.length) {
    const { shown, cut } = editEvents(edit, asset);
    for (const e of cut) if (e.type === 'click') note('capture-event-cut', `scene:${o.name}`, `a click recorded at ${e.t.toFixed(3)}s of capture "${asset.id}" falls in a part the edit cuts; it is not shown`);
    const pos = shown.filter((e) => e.x !== undefined && e.y !== undefined).map((e) => ({ t: e.lt, ...toFrame(asset, e.x!, e.y!), type: e.type }));
    if (o.cursor !== false) cursor = pos.map(({ t, x, y }) => ({ t, x, y }));
    clicks = pos.filter((e) => e.type === 'click').map(({ t, x, y }) => ({ t, x, y }));
  }
  const rect = o.rect ?? defaultRect(asset);
  const camera = o.camera ?? [];
  const frameAt = (lt: number) => sourceFrame(asset, sourceTime(edit, lt));
  // each click from the frame its time falls in: floor(t x fps + 1e-9), the frame contract for event times
  const hits = clicks.map((c) => ({ ...c, f: Math.floor(c.t * FPS + 1e-9) }));
  const footage = Math.ceil(editDuration(edit) * FPS - 1e-9) / FPS;
  const said = o.narration ? narrationTiming(o.name, { ...o.narration, minDur: Math.max(o.narration.minDur ?? 0, o.dur ?? footage) }) : null;
  // draw() runs after registration and reads the scene's start frame from self
  const self: SceneDef = scene({
    name: o.name, kind: 'page', dur: said ? said.dur : o.dur ?? footage, fi: o.fi, fo: o.fo, mb: o.mb, grade: o.grade, chapter: o.chapter, ch: o.ch,
    subs: [...(o.subs ?? []), ...(said?.subs ?? [])], sfx: o.sfx,
    // demo scenes hold the page still: camera moves happen inside the window
    cam: () => ({ z: 1 }),
    need: (lt) => [{ seq: asset.id, frame: frameAt(lt) }],
    draw(lt, d) {
      const S = style();
      background();
      const content = S.demo.window(rect, o.title ?? '', 1);
      const tr = viewTransform(asset, content, cameraAt(camera, asset, lt));
      const at = (x: number, y: number) => ({ x: tr.ox + x * tr.s, y: tr.oy + y * tr.s });
      ctx.save();
      ctx.beginPath();
      ctx.rect(content.x, content.y, content.w, content.h);
      ctx.clip();
      // the footage: the frame of the output frame (not of this sub-frame)
      const f = outputFrame() - self.f0;
      const bmp = bitmap({ seq: asset.id, frame: frameAt(f / FPS) });
      if (bmp) ctx.drawImage(bmp, tr.ox, tr.oy, asset.width * tr.s, asset.height * tr.s);
      if (o.overlay) o.overlay(lt, d, at);
      // a click's age: from the start of its frame, 0 on every sub-frame of that frame; null before it
      const age = (c: { f: number }) => (f >= c.f ? Math.max(0, lt - c.f / FPS) : null);
      for (const c of hits) {
        const a = age(c);
        if (a !== null && a < S.demo.rippleDur) { const p = at(c.x, c.y); S.demo.ripple(p.x, p.y, clamp(a / S.demo.rippleDur), 1); }
      }
      const cur = along(cursor, lt, S.demo.cursorEase);
      if (cur) {
        const press = hits.reduce((m, c) => { const a = age(c); return a === null ? m : Math.max(m, 1 - a / S.demo.pressDur); }, 0);
        const p = at(cur.x, cur.y);
        S.demo.cursor(p.x, p.y, clamp(press), 1);
      }
      ctx.restore();
    },
  });
  return said ? said.bind(self) : self;
}
