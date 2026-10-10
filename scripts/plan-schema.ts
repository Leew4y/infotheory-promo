/** Generate the editor schemas. Zod refinements remain authoritative in plan-check / usePlan. */
import { z } from 'zod';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BriefSpec, FilmPlanSpec } from '../engine/plan';

export const ROOT = path.resolve(import.meta.dir, '..');
export const planSchemas = (): Record<string, string> => Object.fromEntries(Object.entries({ 'film-plan': FilmPlanSpec, brief: BriefSpec })
  .map(([name, spec]) => [`${name}.schema.json`, JSON.stringify(z.toJSONSchema(spec), null, 2) + '\n']));

export function writeAtomic(file: string, data: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try { writeFileSync(tmp, data, { flag: 'wx' }); renameSync(tmp, file); }
  finally { rmSync(tmp, { force: true }); }
}

if (import.meta.main) {
  let changed = 0;
  for (const [name, data] of Object.entries(planSchemas())) {
    const file = path.join(ROOT, 'schemas', name);
    if (existsSync(file) && readFileSync(file, 'utf8').replace(/\r\n/g, '\n') === data) continue; // line endings may follow the checkout
    writeAtomic(file, data);
    changed++;
  }
  console.log(`PASS plan-schema: ${changed} file(s) updated`);
}
