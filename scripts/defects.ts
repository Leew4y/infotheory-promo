/**
 * Check the defect ledger docs/defects.json (scripts/lib/defects.ts) and list what is still only caught by chance:
 *
 *   bun scripts/defects.ts [--json]     (just defects)
 *
 * Open defects are listed, not errors: an open entry is the ledger working. With --json, stdout is only the diagnostics.
 * Exit code 1 on any problem of the ledger, 2 if it cannot be read.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { checkLedger, type Ledger } from './lib/defects';

const ROOT = path.resolve(import.meta.dir, '..');
const FILE = path.join(ROOT, 'docs', 'defects.json');
const JSON_OUT = Bun.argv.includes('--json');
const log = (s: string) => { if (JSON_OUT) console.error(s); else console.log(s); };

let raw: unknown;
try { raw = JSON.parse(readFileSync(FILE, 'utf8')); } catch (e) {
  console.error(`docs/defects.json: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
}
const read = (file: string): string | null => {
  const p = path.join(ROOT, file);
  return existsSync(p) && statSync(p).isFile() ? readFileSync(p, 'utf8') : null;
};
const diags = checkLedger(raw, read);
for (const d of diags) console.error(`error ${d.code} ${d.path}: ${d.message}`);
if (!diags.length) {
  const { defects } = raw as Ledger;
  const n = (s: string) => defects.filter((d) => d.status === s).length;
  log(`${defects.length} defects: ${n('guarded')} guarded, ${n('assisted')} assisted, ${n('open')} open`);
  for (const d of defects.filter((x) => x.status === 'open')) log(`  open ${d.id}  ${d.symptom}`);
}
if (JSON_OUT) console.log(JSON.stringify(diags, null, 1));
process.exit(diags.length ? 1 : 0);
