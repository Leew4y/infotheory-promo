/**
 * Start a new film from templates/film/:
 *
 *   bun scripts/new-film.ts <id> --style <style-id>        (just new-film <id> <style>)
 *
 * Copies the template to films/<id>/ and points it at the style and the id. Refuses an id that is not a valid film id
 * (FilmSpec: lowercase letters, digits, hyphens), an existing films/<id>/, and a style that is not a style package
 * (styles/<style>/index.ts and fonts.json). The template's film.ts must contain its style import and its id exactly
 * once each; both are replaced in memory before anything is written, and the copy goes to a temporary directory that is
 * renamed into place only when complete, so a refusal or failure leaves no partial film.
 * The new film has three scenes (title, one idea, end) and no score; next: just fonts <id>, then just validate <id>.
 * Exit code 1 on refusal.
 */
import { cpSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { FILM_ID } from './film-arg';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const id = argv[0] ?? '';
const style = argv.includes('--style') ? argv[argv.indexOf('--style') + 1] ?? '' : '';
const die = (msg: string): never => { console.error(msg); process.exit(1); };

if (!FILM_ID.test(id)) die(`"${id}" is not a film id: lowercase letters, digits, hyphens (usage: new-film <id> --style <style>)`);
if (!/^[a-z0-9][a-z0-9-]*$/.test(style) || !existsSync(path.join(ROOT, 'styles', style, 'index.ts')) || !existsSync(path.join(ROOT, 'styles', style, 'fonts.json')))
  die(`--style must name a style package (styles/<id>/index.ts and fonts.json); got "${style}"`);
const dst = path.join(ROOT, 'films', id);
if (existsSync(dst)) die(`films/${id} already exists`);

// the two template lines that name the style and the id, each exactly once
const TPL = path.join(ROOT, 'templates', 'film');
const IMPORT = `import style from '../../styles/paper-dawn';`;
const ID = `export default defineFilm({ id: 'template',`;
const filmTs = readFileSync(path.join(TPL, 'film.ts'), 'utf8');
const count = (s: string, sub: string) => s.split(sub).length - 1;
if (count(filmTs, IMPORT) !== 1 || count(filmTs, ID) !== 1) die(`templates/film/film.ts must contain each of these lines exactly once; update scripts/new-film.ts with the template:\n  ${IMPORT}\n  ${ID} ...`);
const out = filmTs.replace(IMPORT, `import style from '../../styles/${style}';`).replace(ID, `export default defineFilm({ id: '${id}',`);

const tmp = path.join(ROOT, 'films', `.${id}.${process.pid}.tmp`);
try {
  cpSync(TPL, tmp, { recursive: true, errorOnExist: true });
  writeFileSync(path.join(tmp, 'film.ts'), out);
  renameSync(tmp, dst);
} catch (e) {
  rmSync(tmp, { recursive: true, force: true });
  die(`could not create films/${id}: ${e instanceof Error ? e.message : String(e)}`);
}

console.log(`films/${id}/ created (style ${style}). Next:
  just fonts ${id}            font subsets for the film's text
  just validate ${id}         checks
  just dev ${id}              preview at http://127.0.0.1:5174
  just export ${id} 4 18 --noaudio`);
