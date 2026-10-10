/**
 * Contracts for what a film declares: FilmSpec (defineFilm) and SceneSpec (scene). Checked when the film and each
 * scene register, so a malformed declaration fails at page load with a path to the bad field instead of rendering
 * something wrong. The checks validate only; the declared objects are used as given.
 */
import { z } from 'zod';

const fn = z.custom<(...args: never[]) => unknown>((v) => typeof v === 'function', { message: 'expected a function' });
const nonneg = z.number().finite().nonnegative();

export const FilmSpec = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase id: letters, digits, hyphens'),
  fps: z.number().int().positive(),
  bpm: z.number().finite().positive(),
  chapters: z.number().int().nonnegative(),
});

/** [start, end, zh, en]: seconds within the scene. */
const Sub = z.tuple([nonneg, nonneg, z.string(), z.string()]).refine(([a, b]) => b > a, 'caption end must be after its start');
/** [time, cue name, options?]: seconds within the scene; options may be omitted or undefined (matches the Sfx type). */
const Sfx = z.tuple([nonneg, z.string().min(1), z.record(z.string(), z.union([z.number().finite(), z.string()])).optional()]);

const num = z.number().finite();
const rgb = z.tuple([num, num, num]);
/** Same fields as gl.ts Grade; a scene may override any subset, nothing else. */
export const GradeSpec = z.object({ bloom: num, ca: num, vig: num, grain: num, sat: num, split: num, tintS: rgb, tintH: rgb }).strict();

export const SceneSpec = z.object({
  name: z.string().min(1),
  kind: z.enum(['page', 'plate']),
  dur: z.number().finite().positive(),
  fi: nonneg.optional(),
  fo: nonneg.optional(),
  fade: z.string().optional(),
  mb: z.number().int().min(1).max(8).optional(),
  grade: GradeSpec.partial().optional(),
  chapter: z.number().int().positive().optional(),
  ch: z.tuple([z.string(), z.string()]).optional(),
  subs: z.array(Sub),
  sfx: z.array(Sfx).optional(),
  cam: fn.optional(),
  draw: fn,
  need: fn.optional(),
}).refine((s) => (s.chapter === undefined) === (s.ch === undefined), { message: 'chapter and ch go together', path: ['ch'] });

/** Throw a readable error if `value` does not satisfy `schema`. */
export function check<T>(schema: z.ZodType<T>, value: unknown, what: string): void {
  const r = schema.safeParse(value);
  if (r.success) return;
  const lines = r.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
  throw new Error(`invalid ${what}:\n${lines.join('\n')}`);
}
