/** Add missing scene modules, preserving every existing module; replace only the ordered index. */
import { existsSync, linkSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readPlan } from './plan-check';
import { requireFilm } from './film-arg';
import { ROOT, writeAtomic } from './plan-schema';
import type { PlanScene } from '../engine/plan';

function skeleton(s: PlanScene): string {
  if (s.kind === 'demo') return `import { planScene } from '../../../engine';

planScene('${s.id}', { draw(lt, d) {} });
`;
  return `import { planScene, copy, background, plate, backdrop, text, C, F, M, W, H, type FilmPlan } from '../../../engine';
import plan from '../film-plan.json';

const content = (plan as FilmPlan).scenes.find((s) => s.id === '${s.id}')!;
planScene('${s.id}', {
  draw(lt, d) {
    ${s.kind === 'plate' ? 'plate({ time: lt, progress: 0.4, highlight: 0.1 });\n    backdrop(W / 2, H / 2, W - M, H / 2, 1);' : 'background();'}
    const rows = [...(content.title ?? []), ...Object.keys(content.copy ?? {}).map((key) => copy('${s.id}', key))].filter(Boolean);
    rows.forEach((s, i) => {
      text(s, W / 2, H * 0.36 + i * H * 0.28 / Math.max(1, rows.length - 1), {
        font: /[^\\x00-\\x7f]/.test(s) ? F.body : F.latin,
        size: Math.min(W / 36, (W - M * 2) / Math.max(1, [...s].length)),
        color: C.${s.kind === 'plate' ? 'fgOnDark' : 'fg'}, align: 'center',
      });
    });
  },
});
`;
}

export function scaffold(dir: string, id: string): string[] {
  const { plan, diagnostics } = readPlan(dir, id);
  if (!plan) throw new Error(diagnostics.map((d) => `${d.code} ${d.path}: ${d.message}`).join('\n'));
  // No filesystem writes precede the entire plan's schema validation.
  const scenes = path.join(dir, 'scenes'), report: string[] = [];
  mkdirSync(scenes, { recursive: true });
  for (const s of plan.scenes) {
    const file = path.join(scenes, `${s.id}.ts`);
    if (existsSync(file)) report.push(`kept scenes/${s.id}.ts`);
    else {
      // Publish a complete file without replacing even a concurrently created module.
      const tmp = `${file}.${crypto.randomUUID()}.tmp`;
      try { writeFileSync(tmp, skeleton(s), { flag: 'wx' }); linkSync(tmp, file); }
      finally { rmSync(tmp, { force: true }); }
      report.push(`created scenes/${s.id}.ts`);
    }
  }
  writeAtomic(path.join(scenes, 'index.ts'), plan.scenes.map((s) => `import './${s.id}';`).join('\n') + '\n');
  report.push('wrote scenes/index.ts in plan order');
  return report;
}

if (import.meta.main) {
  try { parseArgs({ args: Bun.argv.slice(2), options: { film: { type: 'string' } } }); }
  catch (e) { console.error((e as Error).message); process.exit(2); }
  const id = requireFilm(Bun.argv.slice(2));
  try { console.log(scaffold(path.join(ROOT, 'films', id), id).join('\n')); }
  catch (e) { console.error((e as Error).message); process.exitCode = 1; }
}
