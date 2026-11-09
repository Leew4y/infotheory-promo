/** A fixed, seeded permutation, so that an order-dependent frame fails the same way on every run (scripts/regress.ts). */
import { mulberry } from '../../engine/util';

export const ORDER_SEED = 20261109;

/** A copy of `items` in a seeded random order (Fisher-Yates); the same input and seed always give the same order. */
export function shuffled<T>(items: readonly T[], seed = ORDER_SEED): T[] {
  const out = [...items], r = mulberry(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
