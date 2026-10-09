/**
 * Demo scenes: a screen capture in a window on the page, with an edit (cut, trim, speed), a camera that zooms and pans
 * over the capture, a cursor and click ripples. The look of the window, cursor and ripple comes from the style
 * (StylePackage.demo); the capture and its edit from engine/capture.ts; loading from engine/media.ts.
 *
 * Contracts:
 *  - The capture frame shown is chosen from the output frame's time (frame.ts outputTime), never from a motion-blur
 *    sub-frame's; the camera and the cursor move with the sub-frames, so they blur smoothly while the footage does not.
 *  - The scene declares the frame it shows (need()), so the frame is loaded before it is drawn.
 *  - Cursor and clicks come from the capture's recorded events (mapped through the edit; events the edit cuts are noted
 *    and dropped), or from keyframes given in frame pixels on the scene's clock (for a recording without events).
 */
import { background, style } from './style';
import { ctx } from './draw';
import { outputTime } from './frame';
import { bitmap } from './media';
import { note } from './notes';
import { scene, type Sfx, type Sub, type SceneDef } from './scene';
import type { Grade } from './gl';
import { M } from './style';
import { clamp, W, H } from './util';
import {
  cameraAt, editDuration, editEvents, editProblems, sourceFrame, sourceTime, toFrame, viewTransform,
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
  /** The window title (e.g. the product or page). */
  title?: string;
  /** Camera keyframes in frame pixels on the scene's clock (default: the whole frame). */
  camera?: CamKey[];
  /** Cursor keyframes and clicks in frame pixels on the scene's clock; when given they replace the recorded events. */
  cursor?: CursorKey[];
  clicks?: CursorKey[];
  /** The window's rect on the canvas (default: the page's text column width, below the chapter label, above the captions). */
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

const RIPPLE = 0.6;

/** Fit a frame of the asset's aspect inside the default demo area of the page. */
function defaultRect(asset: CaptureAsset): Rect {
  const box = { x: M, y: 190, w: W - 2 * M, h: H - 190 - 230 };
  const s = Math.min(box.w / asset.width, box.h / asset.height);
  const w = asset.width * s, h = asset.height * s;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** Linear interpolation through keyframes, held at the ends. */
function along(keys: CursorKey[], lt: number): { x: number; y: number } | null {
  if (!keys.length) return null;
  if (lt <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    if (lt < keys[i].t) {
      const a = keys[i - 1], b = keys[i];
      const u = (lt - a.t) / (b.t - a.t);
      const e = u * u * (3 - 2 * u);
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
    }
  }
  return keys[keys.length - 1];
}

/** Register a demo scene (a page scene that shows a capture). */
export function demoScene(o: DemoOpts): SceneDef {
  const asset = o.asset;
  const edit = o.edit ?? [{ from: 0, to: asset.frames / asset.fps }];
  const problems = editProblems(edit, asset);
  if (problems.length) throw new Error(`demo scene "${o.name}" (capture ${asset.id}): ${problems.join('; ')}`);
  // cursor and clicks: given keyframes, or the recorded events seen through the edit
  let cursor = o.cursor ?? [];
  let clicks = o.clicks ?? [];
  if (!o.cursor && !o.clicks && asset.events.length) {
    const { shown, cut } = editEvents(edit, asset);
    for (const e of cut) if (e.type === 'click') note('capture-event-cut', `scene:${o.name}`, `a click recorded at ${e.t.toFixed(3)}s of capture "${asset.id}" falls in a part the edit cuts; it is not shown`);
    const pos = shown.filter((e) => e.x !== undefined && e.y !== undefined).map((e) => ({ t: e.lt, ...toFrame(asset, e.x!, e.y!), type: e.type }));
    cursor = pos.map(({ t, x, y }) => ({ t, x, y }));
    clicks = pos.filter((e) => e.type === 'click').map(({ t, x, y }) => ({ t, x, y }));
  }
  const rect = o.rect ?? defaultRect(asset);
  const camera = o.camera ?? [];
  const frameAt = (lt: number) => sourceFrame(asset, sourceTime(edit, lt));
  // draw() runs after registration and reads the scene's start from self
  const self: SceneDef = scene({
    name: o.name, kind: 'page', dur: o.dur ?? editDuration(edit), fi: o.fi, fo: o.fo, mb: o.mb, grade: o.grade, chapter: o.chapter, ch: o.ch,
    subs: o.subs ?? [], sfx: o.sfx,
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
      // the footage: the frame of the output time (not of this sub-frame)
      const bmp = bitmap({ seq: asset.id, frame: frameAt(outputTime() - self.t0) });
      if (bmp) ctx.drawImage(bmp, tr.ox, tr.oy, asset.width * tr.s, asset.height * tr.s);
      if (o.overlay) o.overlay(lt, d, at);
      for (const c of clicks) {
        const k = (lt - c.t) / RIPPLE;
        if (k >= 0 && k < 1) { const p = at(c.x, c.y); S.demo.ripple(p.x, p.y, clamp(k), 1); }
      }
      const cur = along(cursor, lt);
      if (cur) {
        const press = clicks.reduce((m, c) => Math.max(m, 1 - Math.abs(lt - c.t) / 0.12), 0);
        const p = at(cur.x, cur.y);
        S.demo.cursor(p.x, p.y, clamp(press), 1);
      }
      ctx.restore();
    },
  });
  return self;
}
