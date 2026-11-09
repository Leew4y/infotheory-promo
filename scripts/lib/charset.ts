/**
 * The characters a film's font subsets must cover in one style: printable ASCII, every string literal of the film's
 * and the style's source (scripts/literals.ts), the plan's texts or the narration's captions, and fonts.extra.txt.
 * scripts/fonts.ts subsets for this set; scripts/validate.ts checks that the committed subsets still cover it (a text
 * drawn only between validate's sampled frames would otherwise first fail when it is rendered).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { literals } from '../literals';
import { FilmPlanSpec, planTexts } from '../../engine/plan';

const ROOT = path.resolve(import.meta.dir, '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? (n === 'fonts' ? [] : walk(p)) : /\.ts$/.test(n) ? [p] : [];
  });
}

export function filmChars(film: string, style: string): Set<string> {
  const chars = new Set<string>();
  for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
  for (const f of [...walk(path.join(ROOT, 'films', film)), ...walk(path.join(ROOT, 'styles', style))])
    for (const s of literals(readFileSync(f, 'utf8'))) for (const ch of s) chars.add(ch);
  const narration = path.join(ROOT, 'films', film, 'narration.json');
  const plan = path.join(ROOT, 'films', film, 'film-plan.json');
  if (existsSync(plan))
    for (const text of planTexts(FilmPlanSpec.parse(JSON.parse(readFileSync(plan, 'utf8'))))) for (const ch of text) chars.add(ch);
  else if (existsSync(narration))
    for (const l of (JSON.parse(readFileSync(narration, 'utf8')).lines ?? []) as { text?: string; en?: string }[])
      for (const ch of `${l.text ?? ''}${l.en ?? ''}`) chars.add(ch);
  const extra = path.join(ROOT, 'films', film, 'fonts.extra.txt');
  if (existsSync(extra)) for (const ch of readFileSync(extra, 'utf8')) chars.add(ch);
  for (const ws of ['\n', '\r', '\t', '\b', '\f', '\v', '\0']) chars.delete(ws);
  return chars;
}
