/**
 * The glyph check of scripts/fonts.ts (scripts/glyph_check.py) on catalog fonts without subsetting anything: for
 * vetting a CJK font before a style uses it, and for checking the check.
 *
 *   bun scripts/glyph-check.ts <font-id>[,<font-id>...] (--text <chars> | --film <film> [--style <id>]) [--ref <font-id>] [--json]
 *                                                                                        (just glyph-check ...)
 *
 * The text: --text, or the character set of the film's committed font manifests (films/<film>/fonts/<style>/
 * manifest.json; without --style every style's set together). Only fonts tagged zh are checked. --ref replaces the
 * reference face of the punctuation check (Noto Serif SC for serif faces, else Noto Sans SC). Fonts are downloaded
 * through the catalog (sha256 checked). Prints each font's findings, or the reports as JSON with --json.
 * Exit code 1 if any font has an error, 2 on bad arguments.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { filmArg } from './film-arg';
import { glyphCheck, isCJK, printGlyphReport, readCatalog, referenceFor, ROOT } from './font-lib';

const argv = Bun.argv.slice(2);
const opt = (k: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : undefined);
const usage = (msg: string): never => {
  console.error(`${msg}\nusage: bun scripts/glyph-check.ts <font-id>[,<font-id>...] (--text <chars> | --film <film> [--style <id>]) [--ref <font-id>] [--json]`);
  process.exit(2);
};
const cat = readCatalog();
const ids = argv[0] && !argv[0].startsWith('--') ? argv[0].split(',').filter(Boolean) : usage('no font ids');
const faces = ids.map((id) => {
  const e = cat.fonts.find((x) => x.id === id) ?? usage(`"${id}" is not in fonts/catalog.json`);
  return isCJK(e) ? e : usage(`"${id}" is not a CJK face (tag zh); the glyph check is for CJK faces`);
});
const refId = opt('ref');
const ref = refId === undefined ? undefined : cat.fonts.find((x) => x.id === refId) ?? usage(`--ref "${refId}" is not in fonts/catalog.json`);

let text = opt('text');
if (text === undefined) {
  if (!argv.includes('--film')) usage('give --text <chars> or --film <film>');
  const f = filmArg(argv);
  if (f.error !== undefined) usage(f.error);
  const dir = path.join(ROOT, 'films', f.film!, 'fonts');
  const style = opt('style');
  const styles = style ? [style] : existsSync(dir) ? readdirSync(dir).filter((n) => existsSync(path.join(dir, n, 'manifest.json'))) : [];
  const sets = styles.map((s) => {
    const m = path.join(dir, s, 'manifest.json');
    return existsSync(m) ? (JSON.parse(readFileSync(m, 'utf8')).charset as string) : usage(`${m} does not exist (run just fonts ${f.film})`);
  });
  if (!sets.length) usage(`films/${f.film}/fonts/ has no font manifest (run just fonts ${f.film})`);
  text = [...new Set(sets.join(''))].sort().join('');
} else if (!text) usage('--text is empty');

const reports = await glyphCheck(text, faces, ref);
if (argv.includes('--json')) console.log(JSON.stringify(reports, null, 1));
else {
  console.log(`text: ${[...text].length} characters`);
  for (const r of reports) {
    const e = faces.find((x) => x.id === r.id)!;
    printGlyphReport(r, (ref ?? referenceFor(e, cat)).family);
    if (e.defects) console.log(`  catalog: recorded defects: ${e.defects.note} (${e.defects.source})`);
  }
}
process.exit(reports.some((r) => r.findings.some((f) => f.level === 'error')) ? 1 : 0);
