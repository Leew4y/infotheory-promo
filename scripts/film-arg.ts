/**
 * The --film argument, shared by every film tool. A film id is accepted only if it has FilmSpec's form (lowercase
 * letters, digits, hyphens) and films/<id>/main.ts exists, so no path is derived from an unchecked value.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
export const FILM_ID = /^[a-z0-9][a-z0-9-]*$/;

/** Where a film's media frames (screen captures, derived from their sources) live: .cache/captures/<film>/. */
export const mediaDir = (film: string): string => path.join(ROOT, '.cache', 'captures', film);

/** The films in films/ (directories with a main.ts). */
export function films(): string[] {
  return readdirSync(path.join(ROOT, 'films')).filter((n) => FILM_ID.test(n) && existsSync(path.join(ROOT, 'films', n, 'main.ts'))).sort();
}

/** Parse --film from argv: the id, or the reason it is not usable. */
export function filmArg(argv: string[]): { film: string; error?: undefined } | { film?: undefined; error: string } {
  const i = argv.indexOf('--film');
  const v = i >= 0 ? argv[i + 1] : undefined;
  if (v === undefined || v.startsWith('--')) return { error: `--film <id> is required (one of: ${films().join(', ')})` };
  if (!FILM_ID.test(v)) return { error: `--film "${v}" is not a film id (lowercase letters, digits, hyphens)` };
  if (!existsSync(path.join(ROOT, 'films', v, 'main.ts'))) return { error: `--film "${v}": films/${v}/main.ts does not exist (one of: ${films().join(', ')})` };
  return { film: v };
}

/** --film, or exit 2 with the reason on stderr (tools without a JSON output). */
export function requireFilm(argv: string[]): string {
  const r = filmArg(argv);
  if (r.error !== undefined) { console.error(r.error); process.exit(2); }
  return r.film;
}
