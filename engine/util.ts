/** Frame size, easing and seeded randomness. Everything here is pure: no clocks, no Math.random. The timing grid is in film.ts. */
export const W = 1920;
export const H = 1080;
export const PI = Math.PI;
export const TAU = PI * 2;

export const clamp = (x: number, a = 0, b = 1): number => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Smoothstep from a to b. */
export const sstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const eio = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const eout = (t: number): number => 1 - Math.pow(1 - clamp(t), 3);
export const ein = (t: number): number => clamp(t) ** 3;
export const eexpo = (t: number): number => (t >= 1 ? 1 : t <= 0 ? 0 : 1 - Math.pow(2, -10 * t));
/** 1 inside [a, b] with fade-in fi and fade-out fo, 0 outside. */
export const win = (t: number, a: number, b: number, fi = 0.5, fo = 0.5): number => sstep(a, a + fi, t) * (1 - sstep(b - fo, b, t));

/** mulberry32 */
export function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash1 = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/** Smooth 1-D noise in [-1, 1], pure function of x. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1(i + seed * 1000.7);
  const b = hash1(i + 1 + seed * 1000.7);
  return (a + (b - a) * u) * 2 - 1;
}
export const fmtTime = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
