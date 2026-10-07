/**
 * Start a new film from templates/film/:
 *
 *   bun scripts/new-film.ts <id> --style <style-id>        (just new-film <id> <style>)
 *
 * Copies the template to films/<id>/ and points it at the style and the id. Refuses an id that is not a valid film id
 * (FilmSpec: lowercase letters, digits, hyphens), an existing films/<id>/, and a style that is not in styles/.
 * The new film has three scenes (title, one idea, end) and no score; next: just fonts <id>, then just validate <id>.
 * Exit code 1 on refusal.
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const id = argv[0] ?? '';
const style = argv.includes('--style') ? argv[argv.indexOf('--style') + 1] ?? '' : '';
const die = (msg: string): never => { console.error(msg); process.exit(1); };

if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) die(`"${id}" is not a film id: lowercase letters, digits, hyphens (usage: new-film <id> --style <style>)`);
if (!style || !existsSync(path.join(ROOT, 'styles', style, 'index.ts'))) die(`--style must name a style package in styles/ (got "${style}")`);
const dst = path.join(ROOT, 'films', id);
if (existsSync(dst)) die(`films/${id} already exists`);

cpSync(path.join(ROOT, 'templates', 'film'), dst, { recursive: true });
const filmTs = path.join(dst, 'film.ts');
const src = readFileSync(filmTs, 'utf8');
const out = src.replace(`'../../styles/paper-dawn'`, `'../../styles/${style}'`).replace(`id: 'template'`, `id: '${id}'`);
if (!out.includes(`styles/${style}'`) || !out.includes(`id: '${id}'`)) die('templates/film/film.ts no longer has the expected style import and id; update scripts/new-film.ts');
writeFileSync(filmTs, out);

console.log(`films/${id}/ created (style ${style}). Next:
  just fonts ${id}            font subsets for the film's text
  just validate ${id}         checks
  just dev ${id}              preview at http://127.0.0.1:5174
  just export ${id} 4 18 --noaudio`);
