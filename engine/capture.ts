/**
 * Screen captures as film material: the asset manifest, the edit (recording time -> film time) and the geometry
 * (capture pixels -> canvas). Pure functions, no drawing; engine/demo.ts draws with them.
 *
 * An asset is made by scripts/import-capture.ts (from any video file) or scripts/capture.ts (a scripted Playwright
 * recording). Its frames are a fixed-rate JPEG sequence in .cache/captures/<film>/<id>/ (derived, never committed);
 * the manifest films/<film>/captures/<id>.json is committed: rate, frame count, sizes, the source's sha256, and the
 * recorded input events if there are any.
 */

/**
 * An input event of the recording, on the asset's clock (seconds from its first frame, full precision), in viewport CSS
 * pixels. A click recorded by scripts/capture.ts also names its target element (a short selector) and the element's
 * box in viewport CSS pixels.
 */
export interface CaptureEvent {
  t: number; type: 'click' | 'move' | 'key' | 'mark'; x?: number; y?: number; label?: string;
  target?: string; box?: { x: number; y: number; w: number; h: number };
}

export interface CaptureAsset {
  id: string;
  /** Frame rate of the sequence and its number of frames; frame i shows the recording at i / fps seconds. */
  fps: number;
  frames: number;
  /** Size of a frame in pixels. */
  width: number;
  height: number;
  /** The recorded viewport in CSS pixels (it fills the source video) and its device pixel ratio. */
  viewport: { width: number; height: number };
  dpr: number;
  /** The part of the source video the frames show, in source pixels (null: all of it); frames are not scaled. */
  crop: { x: number; y: number; w: number; h: number } | null;
  source: { file: string; sha256: string; bytes: number; duration: number; width: number; height: number; fps: number };
  events: CaptureEvent[];
  made: Record<string, string | number>;
}

/**
 * The edit of a capture in a scene: the parts of the recording to show, in order. Each segment plays source seconds
 * [from, to) at `speed` (default 1); segments follow each other without gaps on the film's clock. What lies between or
 * outside the segments (idle stretches, a fumble) is cut. Segments are in recording order and do not overlap: an edit cuts
 * and trims; it does not reorder or repeat.
 */
export interface Segment { from: number; to: number; speed?: number }

/**
 * Tolerance of edit boundaries: a time within EPS of a segment's end counts as the next segment's start, so frame
 * times (i / fps, sums of segment lengths) that differ from the exact boundary by float error switch on the right frame.
 */
const EPS = 1e-9;

/** Film seconds the edit lasts. */
export function editDuration(edit: Segment[]): number {
  return edit.reduce((s, g) => s + (g.to - g.from) / (g.speed ?? 1), 0);
}

/** Problems with an edit against its asset (empty when it is valid): positive lengths and speeds, inside the recording, in order. */
export function editProblems(edit: Segment[], asset: CaptureAsset): string[] {
  const out: string[] = [];
  const len = asset.frames / asset.fps;
  if (!edit.length) out.push('the edit has no segment');
  edit.forEach((g, i) => {
    if (!(Number.isFinite(g.from) && Number.isFinite(g.to)) || !(g.to > g.from)) out.push(`segment ${i}: needs from < to (got ${g.from}, ${g.to})`);
    if (!(Number.isFinite(g.speed ?? 1) && (g.speed ?? 1) > 0)) out.push(`segment ${i}: speed must be > 0 (got ${g.speed})`);
    if (g.from < 0 || g.to > len + EPS) out.push(`segment ${i}: [${g.from}, ${g.to}) reaches outside the recording [0, ${len.toFixed(3)})`);
    if (i && g.from < edit[i - 1].to - EPS) out.push(`segment ${i}: starts at ${g.from}, before segment ${i - 1} ends (${edit[i - 1].to}); an edit cannot reorder or repeat`);
  });
  return out;
}

/** The source time shown at film-local time lt (clamped to the edit: before it the first frame, after it the last). */
export function sourceTime(edit: Segment[], lt: number): number {
  let start = 0;
  for (const g of edit) {
    const len = (g.to - g.from) / (g.speed ?? 1);
    if (lt < start + len - EPS) return g.from + Math.max(0, lt - start) * (g.speed ?? 1);
    start += len;
  }
  const last = edit[edit.length - 1];
  return last.to - 1e-6;
}

/** The film-local time at which source time `src` is shown, or null if the edit cuts it. Half-open segments. */
export function filmTime(edit: Segment[], src: number): number | null {
  let start = 0;
  for (const g of edit) {
    const s = g.speed ?? 1;
    if (src >= g.from - EPS && src < g.to - EPS) return start + Math.max(0, src - g.from) / s;
    start += (g.to - g.from) / s;
  }
  return null;
}

/** The asset frame showing source time `src`: floor(src x fps + 1e-9), clamped to the sequence. */
export function sourceFrame(asset: CaptureAsset, src: number): number {
  return Math.min(asset.frames - 1, Math.max(0, Math.floor(src * asset.fps + EPS)));
}

/** The recorded events as seen in the film: their film-local times, with those the edit cuts listed apart. */
export function editEvents(edit: Segment[], asset: CaptureAsset): { shown: (CaptureEvent & { lt: number })[]; cut: CaptureEvent[] } {
  const shown: (CaptureEvent & { lt: number })[] = [], cut: CaptureEvent[] = [];
  for (const e of asset.events) {
    const lt = filmTime(edit, e.t);
    if (lt === null) cut.push(e);
    else shown.push({ ...e, lt });
  }
  return { shown, cut };
}

/** A rectangle on the canvas. */
export interface Rect { x: number; y: number; w: number; h: number }

/**
 * A camera on the capture: the point of the frame (in frame pixels) at the centre of the view, and the zoom (1 = the
 * whole frame fits the view). Keyframes are on the film-local clock.
 */
export interface CamKey { t: number; x?: number; y?: number; zoom?: number }

/** Problems with camera keyframes (empty when valid): finite values, zoom > 0, strictly increasing times. */
export function cameraProblems(keys: CamKey[]): string[] {
  const out: string[] = [];
  keys.forEach((k, i) => {
    for (const f of ['t', 'x', 'y', 'zoom'] as const)
      if ((f === 't' || k[f] !== undefined) && !Number.isFinite(k[f])) out.push(`camera key ${i}: ${f} must be a finite number (got ${k[f]})`);
    if (k.zoom !== undefined && Number.isFinite(k.zoom) && !(k.zoom > 0)) out.push(`camera key ${i}: zoom must be > 0 (got ${k.zoom})`);
    if (i && !(k.t > keys[i - 1].t)) out.push(`camera key ${i}: t ${k.t} must be after the previous key's ${keys[i - 1].t}`);
  });
  return out;
}

/** The view of a capture frame at local time lt: centre (frame px) and zoom, eased between keyframes (smoothstep). */
export function cameraAt(keys: CamKey[], asset: CaptureAsset, lt: number): { x: number; y: number; zoom: number } {
  const full = { x: asset.width / 2, y: asset.height / 2, zoom: 1 };
  if (!keys.length) return full;
  const val = (k: CamKey) => ({ x: k.x ?? full.x, y: k.y ?? full.y, zoom: k.zoom ?? 1 });
  if (lt <= keys[0].t) return val(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    if (lt < keys[i].t) {
      const a = val(keys[i - 1]), b = val(keys[i]);
      const u = (lt - keys[i - 1].t) / (keys[i].t - keys[i - 1].t);
      const e = u * u * (3 - 2 * u);
      // zoom eases in log space so that zooming in and out feel alike
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * e) };
    }
  }
  return val(keys[keys.length - 1]);
}

/**
 * The mapping from frame pixels to canvas pixels for a view into `rect`: the frame is scaled to fit the rect (zoom 1)
 * times the zoom, with the view centre at the rect's centre, then held inside the frame so no empty area shows.
 */
export function viewTransform(asset: CaptureAsset, rect: Rect, view: { x: number; y: number; zoom: number }): { s: number; ox: number; oy: number } {
  const s = Math.min(rect.w / asset.width, rect.h / asset.height) * Math.max(1, view.zoom);
  const halfW = rect.w / 2 / s, halfH = rect.h / 2 / s;
  const cx = Math.min(Math.max(view.x, Math.min(halfW, asset.width / 2)), Math.max(asset.width - halfW, asset.width / 2));
  const cy = Math.min(Math.max(view.y, Math.min(halfH, asset.height / 2)), Math.max(asset.height - halfH, asset.height / 2));
  return { s, ox: rect.x + rect.w / 2 - cx * s, oy: rect.y + rect.h / 2 - cy * s };
}

/** Viewport CSS pixels (as events report them) to frame pixels: to source pixels, less the crop origin, to frame pixels. */
export function toFrame(asset: CaptureAsset, x: number, y: number): { x: number; y: number } {
  const c = asset.crop ?? { x: 0, y: 0, w: asset.source.width, h: asset.source.height };
  return {
    x: (((x * asset.source.width) / asset.viewport.width - c.x) * asset.width) / c.w,
    y: (((y * asset.source.height) / asset.viewport.height - c.y) * asset.height) / c.h,
  };
}
