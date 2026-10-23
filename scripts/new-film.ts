/**
 * Start a new film from templates/film/:
 *
 *   bun scripts/new-film.ts <id> --style <style-id>        (just new-film <id> <style>)
 *   Add --plan for templates/film-plan/: set the plan's id/style and scaffold its modules before publication.
 *   Add --portrait for a 1080 x 1920 frame (phones): the film's size, laid out by the style's portrait layout.
 *
 * Copies the template to films/<id>/ and points it at the style and the id. Refuses an id that is not a valid film id
 * (FilmSpec: lowercase letters, digits, hyphens) and a style that is not a style package (styles/<style>/index.ts and
 * fonts.json). films/<id>/ may already exist when it holds no film code yet, only what is written before the film
 * (brief.md, brief.json, research/, script/, review/, ...): the template is then added around those files and none of
 * them is replaced or changed. Refused: a films/<id> that is not a directory (or is a link), or one that holds film
 * code (film.ts, main.ts, scenes/, film-plan.json) or any other entry of the template.
 * The template's film.ts must contain its style import and its id exactly once each; both are replaced in memory
 * before anything is written, and the copy is made complete in a temporary directory first. A new films/<id> is that
 * directory renamed into place in one step. Into an existing one the files are added one by one with exclusive creates
 * (nothing that appeared meanwhile is replaced), main.ts last (the tools treat films/<id> as a film only once main.ts
 * exists), and on any failure the files added so far are removed again; so a refusal or failure leaves films/<id> as it
 * was. Not covered: a hard kill during that copy, which can leave part of the template behind (remove the template's
 * entries by hand, then run new-film again).
 * The new film has three scenes (title, one idea, end) and no score; next: just fonts <id>, then just validate <id>.
 * Exit code 1 on refusal. Test hook: NEW_FILM_FAIL_AT=<template path> fails the copy into an existing directory just
 * before that path is added.
 */
import { constants, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync, type Stats } from 'node:fs';
import path from 'node:path';
import { FILM_ID } from './film-arg';
import { scaffold } from './scaffold';

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const id = argv[0] ?? '';
const style = argv.includes('--style') ? argv[argv.indexOf('--style') + 1] ?? '' : '';
const die = (msg: string): never => { console.error(msg); process.exit(1); };

if (!FILM_ID.test(id)) die(`"${id}" is not a film id: lowercase letters, digits, hyphens (usage: new-film <id> --style <style>)`);
if (!/^[a-z0-9][a-z0-9-]*$/.test(style) || !existsSync(path.join(ROOT, 'styles', style, 'index.ts')) || !existsSync(path.join(ROOT, 'styles', style, 'fonts.json')))
  die(`--style must name a style package (styles/<id>/index.ts and fonts.json); got "${style}"`);
const planned = argv.includes('--plan');
const TPL = path.join(ROOT, 'templates', planned ? 'film-plan' : 'film');
const dst = path.join(ROOT, 'films', id);

/** Film code: an existing films/<id>/ that has any of these (or another entry of the template) is not started again. */
const CODE = ['film.ts', 'main.ts', 'scenes', 'film-plan.json'];
let existing: string[] | null = null;
let st: Stats | null = null;
try { st = lstatSync(dst); } catch { /* a new directory */ }
if (st) {
  if (st.isSymbolicLink() || !st.isDirectory()) die(`films/${id} exists and is not a directory`);
  existing = readdirSync(dst);
  const code = [...new Set([...CODE, ...readdirSync(TPL)])].filter((n) => existing!.includes(n));
  if (code.length) die(`films/${id} already has film code (${code.join(', ')}): new-film only adds the template to a directory without it`);
}

// the two template lines that name the style and the id, each exactly once
const IMPORT = `import style from '../../styles/paper-dawn';`;
const ID = `export default defineFilm({ id: 'template',`;
const filmTs = readFileSync(path.join(TPL, 'film.ts'), 'utf8');
const count = (s: string, sub: string) => s.split(sub).length - 1;
if (!planned && (count(filmTs, IMPORT) !== 1 || count(filmTs, ID) !== 1)) die(`templates/film/film.ts must contain each of these lines exactly once; update scripts/new-film.ts with the template:\n  ${IMPORT}\n  ${ID} ...`);
const PORTRAIT = argv.includes('--portrait');
if (PORTRAIT && !/\bportrait:\s*\{/.test(readFileSync(path.join(ROOT, 'styles', style, 'index.ts'), 'utf8')))
  console.warn(`warning: style ${style} has no portrait layout (layout.portrait): its captions and labels are placed for landscape; paper-dawn, nebula, keynote have one`);
const out = filmTs.replace(IMPORT, `import style from '../../styles/${style}';`).replace(ID, `export default defineFilm({ id: '${id}',${PORTRAIT ? ' size: [1080, 1920],' : ''}`);

/**
 * Add the staged tree `from` under the existing directory `to` without replacing anything: directories before their
 * contents, main.ts last; on a failure, remove what this added (newest first) and rethrow.
 */
function addInto(from: string, to: string): void {
  const all: string[] = [];
  const walk = (rel: string) => {
    for (const n of readdirSync(path.join(from, rel)).sort()) {
      const r = rel ? `${rel}/${n}` : n;
      all.push(r);
      if (statSync(path.join(from, r)).isDirectory()) walk(r);
    }
  };
  walk('');
  all.sort((a, b) => Number(a === 'main.ts') - Number(b === 'main.ts')); // stable: directories stay before their contents
  const made: { p: string; dir: boolean }[] = [];
  try {
    for (const r of all) {
      if (process.env.NEW_FILM_FAIL_AT === r) throw new Error(`test hook NEW_FILM_FAIL_AT: failing before ${r}`);
      const src = path.join(from, r), p = path.join(to, r), dir = statSync(src).isDirectory();
      try {
        if (dir) mkdirSync(p);
        else copyFileSync(src, p, constants.COPYFILE_EXCL);
      } catch (e) {
        // EEXIST: someone else's file, never touched; anything else may have left a partial file of ours
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST' && existsSync(p)) made.push({ p, dir });
        throw (e as NodeJS.ErrnoException).code === 'EEXIST' ? new Error(`films/${id}/${r} appeared meanwhile`) : e;
      }
      made.push({ p, dir });
    }
  } catch (e) {
    for (const m of made.reverse()) {
      try { if (m.dir) rmdirSync(m.p); else rmSync(m.p, { force: true }); } catch (r) { console.error(`could not remove ${m.p}: ${r instanceof Error ? r.message : r}`); }
    }
    throw e;
  }
}

const tmp = path.join(ROOT, 'films', `.${id}.${process.pid}.tmp`);
try {
  cpSync(TPL, tmp, { recursive: true, errorOnExist: true });
  writeFileSync(path.join(tmp, 'film.ts'), out);
  if (planned) {
    const planFile = path.join(tmp, 'film-plan.json');
    const plan = JSON.parse(readFileSync(planFile, 'utf8'));
    plan.film = id;
    plan.styles = [style];
    if (PORTRAIT) plan.size = [1080, 1920];
    writeFileSync(planFile, JSON.stringify(plan, null, 2) + '\n');
    scaffold(tmp, id);
  }
  if (existing) addInto(tmp, dst);
  else renameSync(tmp, dst);
} catch (e) {
  rmSync(tmp, { recursive: true, force: true });
  die(`could not create films/${id}: ${e instanceof Error ? e.message : String(e)}`);
}
// after adding into an existing directory: the staged copy (a leftover is only a warning: the film is complete)
try { rmSync(tmp, { recursive: true, force: true }); } catch (e) { console.warn(`warning: could not remove ${tmp}: ${e instanceof Error ? e.message : e}`); }

console.log(`films/${id}/${existing ? `: the template added (style ${style}); kept as they were: ${existing.length ? existing.join(', ') : 'nothing'}` : ` created (style ${style})`}. Next:
${planned ? `  just narrate ${id}          synthesize the plan's lines (tests: --backend fake)\n  just scaffold ${id}         after adding or reordering plan scenes\n` : ''}\
  just fonts ${id}            font subsets for the film's text
  just validate ${id}         checks
  just dev ${id}              preview at http://127.0.0.1:5174
  just export ${id} 4 18 --noaudio`);
