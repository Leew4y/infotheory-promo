/**
 * Frame sequences (screen captures) for scenes: loading, decoding and caching ImageBitmaps.
 *
 * A sequence is a directory of JPEG frames served at /media/<seq>/<index, 5 digits>.jpg (the tools mount the film's
 * .cache/captures/<film>/ there; see scripts/chrome.ts). A scene that shows a sequence declares, through
 * SceneDef.need(lt, d), which frames it will draw at a local time; prepare(t) loads them before frame(t) runs, so
 * drawing stays synchronous and frame(t) a pure function of t.
 *
 * Cache: a least-recently-used set of decoded bitmaps bounded by memory (width x height x 4 bytes each), closed on
 * eviction; concurrent requests for one frame share a single fetch. In strict mode (export and every check tool) a
 * frame that is not loaded when drawn is an error; in the preview the nearest loaded earlier frame stands in.
 */

/** One frame of a sequence. */
export interface MediaRef { seq: string; frame: number }

const key = (r: MediaRef) => `${r.seq}/${r.frame}`;
const url = (r: MediaRef) => `/media/${r.seq}/${String(r.frame).padStart(5, '0')}.jpg`;

let budget = 768 * 1024 * 1024;
let used = 0;
let strict = false;
const cache = new Map<string, ImageBitmap>(); // insertion order = recency
const pending = new Map<string, Promise<ImageBitmap>>();

/** Strict mode: drawing a frame that is not loaded throws (export and checks). Off in the preview. */
export function setStrict(on: boolean): void {
  strict = on;
}
/** Memory budget of the cache in bytes (default 768 MiB). */
export function setBudget(bytes: number): void {
  budget = bytes;
  evict();
}

function evict(keep?: string): void {
  for (const [k, b] of cache) {
    if (used <= budget) break;
    if (k === keep) continue;
    used -= b.width * b.height * 4;
    b.close();
    cache.delete(k);
  }
}

/** Load (fetch and decode) one frame; resolves when it is in the cache. Rejects if the file is missing. */
export function load(r: MediaRef): Promise<ImageBitmap> {
  const k = key(r);
  const hit = cache.get(k);
  if (hit) {
    cache.delete(k);
    cache.set(k, hit);
    return Promise.resolve(hit);
  }
  let p = pending.get(k);
  if (!p) {
    p = fetch(url(r))
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`media frame missing: ${url(r)} (${res.status})`))))
      .then((b) => createImageBitmap(b))
      .then((bmp) => {
        cache.set(k, bmp);
        used += bmp.width * bmp.height * 4;
        evict(k);
        return bmp;
      })
      .finally(() => pending.delete(k));
    pending.set(k, p);
  }
  return p;
}

/** Load every frame in `refs` (all or nothing: the first failure rejects). */
export async function ensure(refs: MediaRef[]): Promise<void> {
  await Promise.all(refs.map(load));
}

/** Start loading `refs` without waiting (look-ahead); failures are ignored here and surface when the frame is needed. */
export function prefetch(refs: MediaRef[]): void {
  for (const r of refs) if (!cache.has(key(r))) load(r).catch(() => {});
}

/**
 * The bitmap of a frame for drawing. Strict mode: it must be loaded (prepare() did that), else this throws. Preview:
 * if it is not loaded yet, the nearest loaded earlier frame of the same sequence (or null) stands in.
 */
export function bitmap(r: MediaRef): ImageBitmap | null {
  const hit = cache.get(key(r));
  if (hit) return hit;
  if (strict) throw new Error(`media frame not loaded before drawing: ${url(r)}`);
  for (let f = r.frame - 1; f >= Math.max(0, r.frame - 300); f--) {
    const b = cache.get(key({ seq: r.seq, frame: f }));
    if (b) return b;
  }
  return null;
}

/** Cache state, for tests and diagnostics. */
export const mediaStats = () => ({ frames: cache.size, bytes: used, budget, pending: pending.size });
