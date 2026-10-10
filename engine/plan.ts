/** Plan contracts and data, usable in both the browser and the CLI (no canvas imports). */
import { z } from 'zod';
import { film } from './film';
import { SC, type SceneDef } from './scene';
import { useNarration, type NarrationLock, type NarrationScript } from './narration';
import { check } from './schema';
import type { CaptureAsset } from './capture';

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase id: letters, digits, hyphens');
const nonneg = z.number().finite().nonnegative();
const positive = z.number().finite().positive();
const nonempty = z.string().refine((s) => !!s.trim(), 'must not be empty');
/** Portable paths relative to the film, with no parent traversal or absolute paths. */
export const PlanPathSpec = z.string().regex(/^[^/\\:\u0000]+(?:\/[^/\\:\u0000]+)*$/)
  .refine((s) => s.split('/').every((p) => p !== '.' && p !== '..'), 'must be a film-relative path without . or ..');

export const BriefSpec = z.strictObject({
  product: nonempty, audience: nonempty, durationSeconds: positive, tone: nonempty,
  mustShow: z.array(nonempty), language: nonempty, notes: z.string().optional(),
});

const LineSpec = z.strictObject({ id, text: nonempty, en: z.string().optional(), read: nonempty.optional(), pause: nonneg.optional() });
const SegmentSpec = z.strictObject({ from: nonneg, to: positive, speed: positive.optional() })
  .refine((s) => s.to > s.from, { path: ['to'], message: 'segment end must be after its start' });
const CameraSpec = z.strictObject({ t: nonneg, x: z.number().finite(), y: z.number().finite(), zoom: positive });
const ScenePlanSpec = z.strictObject({
  id: id.refine((s) => s !== 'index', 'index is reserved for scenes/index.ts'), kind: z.enum(['page', 'plate', 'demo']), chapter: z.number().int().positive().optional(),
  title: z.tuple([z.string(), z.string()]).optional(), dur: positive.optional(),
  minDur: nonneg.optional(), lead: nonneg.optional(), gap: nonneg.optional(), tail: nonneg.optional(),
  lines: z.array(LineSpec).min(1).optional(),
  captions: z.array(z.tuple([nonneg, nonneg, z.string(), z.string()])
    .refine(([a, b]) => b > a, 'caption end must be after its start')).optional(),
  copy: z.record(z.string(), z.string()).optional(),
  capture: z.strictObject({
    asset: PlanPathSpec.refine((s) => /^captures\/.+\.json$/.test(s), 'expected captures/<id>.json'),
    edit: z.array(SegmentSpec).min(1).optional(), camera: z.array(CameraSpec).optional(), title: z.string().optional(),
  }).optional(),
}).superRefine((s, ctx) => {
  const error = (key: string, message: string) => ctx.addIssue({ code: 'custom', path: [key], message });
  if (s.dur !== undefined && s.lines !== undefined || s.kind !== 'demo' && s.dur === undefined && s.lines === undefined)
    error('dur', 'a scene needs dur xor lines (a demo may omit both)');
  if (s.kind === 'demo' && !s.capture) error('capture', 'a demo needs a capture');
  if (s.kind !== 'demo' && s.capture) error('capture', 'only demo scenes have a capture');
  if (s.lines && s.captions) error('captions', 'narration supplies the captions; omit captions');
  if (s.chapter !== undefined && !s.title) error('title', 'a chapter needs a [zh, en] title');
  for (const [i, c] of (s.captions ?? []).entries()) if (s.dur !== undefined && c[1] > s.dur)
    ctx.addIssue({ code: 'custom', path: ['captions', i, 1], message: 'caption ends after the scene' });
  for (const [i, g] of (s.capture?.edit ?? []).entries()) if (i && g.from < s.capture!.edit![i - 1].to)
    ctx.addIssue({ code: 'custom', path: ['capture', 'edit', i], message: 'segments must be in recording order without overlap' });
  for (const [i, k] of (s.capture?.camera ?? []).entries()) if (i && k.t <= s.capture!.camera![i - 1].t)
    ctx.addIssue({ code: 'custom', path: ['capture', 'camera', i, 't'], message: 'camera times must increase' });
});

export const FilmPlanSpec = z.strictObject({
  film: id, fps: z.number().int().positive(), bpm: positive.optional(),
  styles: z.array(id).min(1), chapters: z.number().int().nonnegative().optional(), voice: id.optional(),
  scenes: z.array(ScenePlanSpec).min(1),
}).superRefine((p, ctx) => {
  const scenes = new Set<string>(), lines = new Set<string>();
  p.scenes.forEach((s, i) => {
    const error = (key: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path: ['scenes', i, ...key], message });
    if (scenes.has(s.id)) error(['id'], `duplicate scene id "${s.id}"`);
    scenes.add(s.id);
    if (s.chapter !== undefined && s.chapter > (p.chapters ?? 0)) error(['chapter'], 'chapter is outside chapters');
    s.lines?.forEach((l, j) => {
      if (lines.has(l.id)) error(['lines', j, 'id'], `duplicate line id "${l.id}"`);
      lines.add(l.id);
    });
  });
  if (lines.size && !p.voice) ctx.addIssue({ code: 'custom', path: ['voice'], message: 'narrated plans need a voice' });
  if (new Set(p.styles).size !== p.styles.length) ctx.addIssue({ code: 'custom', path: ['styles'], message: 'styles must be unique' });
});
export type FilmPlan = z.infer<typeof FilmPlanSpec>;
export type Brief = z.infer<typeof BriefSpec>;
export type PlanScene = FilmPlan['scenes'][number];

export const planNarration = (p: FilmPlan): NarrationScript => ({
  voice: p.voice ?? '', lines: p.scenes.flatMap((s) => (s.lines ?? []).map((l) => ({ ...l, scene: s.id }))),
});
/** All displayed text; shared by font subsetting and the copy checker. */
export const planTexts = (p: FilmPlan): string[] => p.scenes.flatMap((s) => [
  ...(s.title ?? []), ...Object.values(s.copy ?? {}), ...(s.captions ?? []).flatMap((c) => c.slice(2) as string[]),
  ...(s.lines ?? []).flatMap((l) => [l.text, l.en ?? '']), ...(s.capture?.title ? [s.capture.title] : []),
]);

let active: FilmPlan | null = null;
let captures: Record<string, CaptureAsset> = {};
const registered = new Set<SceneDef>();

/** The optional manifest map comes from the film's eager ./captures glob; the engine never imports films. */
export function usePlan(p: unknown, lock?: NarrationLock, assets: Record<string, CaptureAsset> = {}): void {
  check(FilmPlanSpec, p, 'film-plan.json');
  const plan = FilmPlanSpec.parse(p), f = film();
  if (active || SC.length) throw new Error('plan: usePlan must run once, before any scenes');
  if (plan.film !== f.id || plan.fps !== f.fps) throw new Error(`film-plan.json: film/fps must match defineFilm (${f.id}, ${f.fps} fps)`);
  if ((plan.bpm ?? 80) !== f.bpm || (plan.chapters ?? 0) !== f.chapters) throw new Error('film-plan.json: bpm/chapters must match defineFilm');
  const script = planNarration(plan);
  if (script.lines.length) {
    if (!lock) throw new Error(`film-plan.json: missing narration lock (run just narrate ${f.id})`);
    useNarration(script, lock);
  }
  active = plan;
  captures = Object.fromEntries(Object.entries(assets).map(([key, asset]) => [key.replace(/^\.\//, ''), asset]));
}

export function plannedScene(id: string): PlanScene {
  const s = active?.scenes.find((s) => s.id === id);
  if (!s) throw new Error(`film-plan.json: unknown scene "${id}"${active ? '' : ' (call usePlan first)'}`);
  return s;
}
export function copy(sceneId: string, key: string): string {
  const values = plannedScene(sceneId).copy;
  if (!values || !Object.hasOwn(values, key)) throw new Error(`film-plan.json: scene "${sceneId}" has no copy key "${key}"`);
  return values[key];
}
export function planCapture(asset: string): CaptureAsset {
  const c = captures[asset];
  if (!c) throw new Error(`film-plan.json: capture "${asset}" not bundled; pass the film's captures glob to usePlan`);
  return c;
}
export function recordPlanScene(s: SceneDef): SceneDef { registered.add(s); return s; }
/** At boot: catches missing, extra, reordered, repeated, and non-plan scene registrations. */
export function assertPlanScenes(styles?: string[]): void {
  if (!active) return;
  if (styles && JSON.stringify(styles) !== JSON.stringify(active.styles)) throw new Error('film-plan.json: installed styles must match the plan, default first');
  const expected = active.scenes.map((s) => s.id), actual = SC.map((s) => s.name);
  if (JSON.stringify(expected) !== JSON.stringify(actual) || SC.some((s) => !registered.has(s)))
    throw new Error(`film-plan.json: register exactly the plan's scenes with planScene in order; expected [${expected.join(', ')}], got [${actual.join(', ')}]`);
}
