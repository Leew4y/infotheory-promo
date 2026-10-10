/**
 * Where a frame's time goes (scripts/profile-export.ts): named stages accumulate milliseconds while profiling is on.
 * Measurement only: nothing drawn depends on it, so frame(t) stays a pure function of t.
 */
const acc = new Map<string, number>();
let on = false;

/** Start (clearing what was recorded) or stop profiling; what was recorded stays readable after stopping. */
export function perfOn(v: boolean): void {
  if (v) acc.clear();
  on = v;
}
/** Add the time since t0 to stage `name`; returns the current time (the next stage's t0). */
export function lap(name: string, t0: number): number {
  const t = performance.now();
  if (on) acc.set(name, (acc.get(name) ?? 0) + t - t0);
  return t;
}
export const perfReport = (): Record<string, number> => Object.fromEntries(acc);
