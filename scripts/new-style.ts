/**
 * Start a new style package from templates/style/:
 *
 *   bun scripts/new-style.ts <id>        (just new-style <id>)
 *
 * Copies the template (index.ts, shader.ts, fonts.json, STYLE.md) to styles/<id>/ with the style's id set. Refuses an id
 * that is not lowercase letters, digits and hyphens, and an existing styles/<id>/. The id line of the template must
 * appear exactly once; it is replaced in memory, the copy goes to a temporary directory renamed into place only when
 * complete. Next: describe the look in STYLE.md, build it in index.ts / shader.ts, add the style to a film's
 * selectStyle([...]) list, then just fonts / validate / sheet. Exit code 1 on refusal.
 */
import { cpSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const id = Bun.argv[2] ?? '';
const die = (msg: string): never => { console.error(msg); process.exit(1); };

if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) die(`"${id}" is not a style id: lowercase letters, digits, hyphens (usage: new-style <id>)`);
const dst = path.join(ROOT, 'styles', id);
if (existsSync(dst)) die(`styles/${id} already exists`);

const TPL = path.join(ROOT, 'templates', 'style');
const ID = `  id: 'template-style',`;
const src = readFileSync(path.join(TPL, 'index.ts'), 'utf8');
if (src.split(ID).length - 1 !== 1) die(`templates/style/index.ts must contain this line exactly once; update scripts/new-style.ts with the template:\n${ID}`);

const tmp = path.join(ROOT, 'styles', `.${id}.${process.pid}.tmp`);
try {
  cpSync(TPL, tmp, { recursive: true, errorOnExist: true });
  writeFileSync(path.join(tmp, 'index.ts'), src.replace(ID, `  id: '${id}',`));
  renameSync(tmp, dst);
} catch (e) {
  rmSync(tmp, { recursive: true, force: true });
  die(`could not create styles/${id}: ${e instanceof Error ? e.message : String(e)}`);
}

console.log(`styles/${id}/ created. Next:
  1. write styles/${id}/STYLE.md (the design), then build it in index.ts and shader.ts; fonts only from fonts/catalog.json (fonts.json)
  2. add it to a film: import ${id.replace(/-(.)/g, (_, c: string) => c.toUpperCase())} from '../../styles/${id}' and list it in selectStyle([...]) in films/<film>/film.ts
  3. just fonts <film> && just validate <film> --style ${id} && just sheet <film>`);
