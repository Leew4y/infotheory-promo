import { defineFilm, selectStyle, usePlan, type StylePackage, type NarrationLock, type CaptureAsset } from '../../engine';
import plan from './film-plan.json';

const styles = import.meta.glob('../../styles/*/index.ts', { import: 'default', eager: true }) as Record<string, StylePackage>;
selectStyle(plan.styles.map((id) => {
  const s = styles[`../../styles/${id}/index.ts`];
  if (!s) throw new Error(`film-plan.json: style ${id} is not bundled`);
  return s;
}));
// a plan JSON types the size as number[]; usePlan checks it is [width, height] and matches this film
const size = (plan as { size?: number[] }).size as [number, number] | undefined;
export default defineFilm({ id: plan.film, fps: plan.fps, bpm: plan.bpm ?? 80, chapters: (plan as { chapters?: number }).chapters ?? 0, punctuation: 'display', ...(size ? { size } : {}) });
const locks = import.meta.glob('./narration.lock.json', { import: 'default', eager: true }) as Record<string, NarrationLock>;
const captures = import.meta.glob('./captures/**/*.json', { import: 'default', eager: true }) as Record<string, CaptureAsset>;
usePlan(plan, locks['./narration.lock.json'], captures);
