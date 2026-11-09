/**
 * The defect ledger docs/defects.json: every defect found while making a film, and what stops it coming back.
 *
 * Status:
 *   guarded   a command fails on it without anyone looking;
 *   assisted  a command produces the evidence, a person judges it (a proof sheet, a phone-size sheet);
 *   open      nothing yet: it is caught only if someone notices. The honest default for a new entry.
 * A guarded or assisted entry names its guard: a file and a marker, a string of that file (a diagnostic code, a function,
 * a test title). The marker has to be there, so deleting or renaming a check breaks `just defects` and not, silently,
 * the guard. It proves the check exists, not that it works: that is the job of the tests around it.
 */
import { z } from 'zod';

const Guard = z.strictObject({ file: z.string().min(1), marker: z.string().min(1) });
const Source = z.strictObject({ file: z.string().min(1).optional(), note: z.string().min(1).optional() })
  .refine((s) => s.file !== undefined || s.note !== undefined, 'a source needs a file or a note');
const Defect = z.strictObject({
  id: z.string().regex(/^D\d{2,}$/),
  symptom: z.string().min(1),
  cause: z.string().min(1),
  source: Source,
  status: z.enum(['guarded', 'assisted', 'open']),
  guard: Guard.optional(),
});
export const Ledger = z.strictObject({ comment: z.string().optional(), defects: z.array(Defect).min(1) });
export type Ledger = z.infer<typeof Ledger>;

export interface Diag { level: 'error'; code: string; path: string; message: string }

/** Problems of a ledger. `read` gives a repo-relative file's text, or null if there is no such file. */
export function checkLedger(raw: unknown, read: (file: string) => string | null): Diag[] {
  const diags: Diag[] = [];
  const err = (code: string, path: string, message: string) => { diags.push({ level: 'error', code, path, message }); };
  const parsed = Ledger.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues) err('defect-schema', i.path.join('.') || 'ledger', i.message);
    return diags;
  }
  const seen = new Set<string>();
  for (const d of parsed.data.defects) {
    if (seen.has(d.id)) err('defect-duplicate', d.id, 'the id is used twice');
    seen.add(d.id);
    if (d.source.file !== undefined && read(d.source.file) === null) err('defect-source', d.id, `source file ${d.source.file} does not exist`);
    if (d.status === 'open') {
      if (d.guard) err('defect-guard', d.id, 'an open defect has no guard: give it status guarded or assisted, or remove the guard');
      continue;
    }
    if (!d.guard) { err('defect-guard', d.id, `a ${d.status} defect names its guard`); continue; }
    const text = read(d.guard.file);
    if (text === null) err('defect-guard', d.id, `guard file ${d.guard.file} does not exist`);
    else if (!text.includes(d.guard.marker)) err('defect-guard', d.id, `${d.guard.file} no longer contains "${d.guard.marker}"`);
  }
  return diags;
}
