/** The frames scripts/validate.ts looks at in a scene. */
export interface SceneTimes { start: number; end: number; subs?: readonly (readonly [number, number])[] }

/**
 * Five fixed points of the scene (0, 25, 50, 75 %, last frame), then the middle of every caption, when each is fully
 * shown, so that no caption goes unchecked. Film times; one entry per frame, the fixed points first.
 */
export function sampleTimes(s: SceneTimes, fps: number): [string, number][] {
  const d = s.end - s.start, last = s.end - 1 / fps;
  const all: [string, number][] = [['0%', s.start], ['25%', s.start + d * 0.25], ['50%', s.start + d * 0.5], ['75%', s.start + d * 0.75], ['end', last]];
  (s.subs ?? []).forEach(([a, b], i) => all.push([`caption${i + 1}`, Math.min(Math.max((a + b) / 2, s.start), last)]));
  const seen = new Set<number>();
  return all.filter(([, t]) => {
    const f = Math.floor(t * fps + 1e-6);
    if (seen.has(f)) return false;
    seen.add(f);
    return true;
  });
}
