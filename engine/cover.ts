/**
 * Covers: still images a film declares besides its timeline (a portrait cover for phone feeds, a landscape one for
 * video sites), each at its own frame size. `just covers <film>` renders them through the same pipeline as a frame —
 * `draw` on the kind's fill, then the style's grade, then `overlay` drawn sharp on top (titles) — into
 * out/<film>/covers/<name>.png and .jpg. Rendering a cover switches the page's frame size, so the tool loads a fresh
 * page for each.
 */
import { check } from './schema';
import { z } from 'zod';

export interface CoverDef {
  /** File name: lowercase letters, digits, hyphens. */
  name: string;
  /** [width, height] in pixels, both even (e.g. [1080, 1920] portrait, [1920, 1080] landscape). */
  size: [number, number];
  /** Fill and grade of a page or of a plate (default page). */
  kind?: 'page' | 'plate';
  /** The picture, graded with the style's grade (W, H, M, COL are the cover's while it draws). */
  draw(): void;
  /** Text and marks drawn after the grade, sharp (titles). */
  overlay?(): void;
}

const CoverSpec = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase id: letters, digits, hyphens'),
  size: z.tuple([z.number().int().min(64).max(8192), z.number().int().min(64).max(8192)]).refine(([w, h]) => w % 2 === 0 && h % 2 === 0, 'width and height must be even'),
  kind: z.enum(['page', 'plate']).optional(),
  draw: z.custom<() => void>((v) => typeof v === 'function'),
  overlay: z.custom<() => void>((v) => typeof v === 'function').optional(),
});

const covers = new Map<string, CoverDef>();

/** Declare a cover (in a film module, e.g. films/<film>/covers.ts imported by main.ts). */
export function cover(c: CoverDef): CoverDef {
  check(CoverSpec, c, `cover "${c.name}"`);
  if (covers.has(c.name)) throw new Error(`cover "${c.name}" is declared twice`);
  covers.set(c.name, c);
  return c;
}
export const coverNames = (): string[] => [...covers.keys()];
export function getCover(name: string): CoverDef {
  const c = covers.get(name);
  if (!c) throw new Error(`no cover "${name}" (this film declares: ${coverNames().join(', ') || 'none'})`);
  return c;
}
