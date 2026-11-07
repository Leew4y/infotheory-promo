import { expect, test } from 'bun:test';
import { checkLedger } from '../scripts/lib/defects';

const entry = (o: object) => ({ id: 'D01', symptom: 's', cause: 'c', source: { note: 'n' }, status: 'open', ...o });
const files: Record<string, string> = { 'scripts/a.ts': "err('some-code')", 'docs/review.md': 'notes' };
const check = (...defects: object[]) => checkLedger({ defects }, (f) => files[f] ?? null).map((d) => `${d.code} ${d.path}`);
const guard = { file: 'scripts/a.ts', marker: 'some-code' };

test('a guarded or assisted defect needs a guard whose file holds its marker', () => {
  expect(check(entry({ status: 'guarded', guard }), entry({ id: 'D02', status: 'assisted', guard }))).toEqual([]);
  expect(check(entry({ status: 'guarded' }))).toEqual(['defect-guard D01']);
  expect(check(entry({ status: 'assisted', guard: { ...guard, file: 'scripts/gone.ts' } }))).toEqual(['defect-guard D01']);
  expect(check(entry({ status: 'guarded', guard: { ...guard, marker: 'renamed-code' } }))).toEqual(['defect-guard D01']);
});

test('an open defect is fine without a guard, and may not claim one', () => {
  expect(check(entry({}))).toEqual([]);
  expect(check(entry({ guard }))).toEqual(['defect-guard D01']);
});

test('ids are unique, sources exist, and the shape is strict', () => {
  expect(check(entry({}), entry({}))).toEqual(['defect-duplicate D01']);
  expect(check(entry({ source: { file: 'docs/review.md' } }))).toEqual([]);
  expect(check(entry({ source: { file: 'docs/gone.md' } }))).toEqual(['defect-source D01']);
  expect(check(entry({ source: {} }))[0]).toStartWith('defect-schema');
  expect(check(entry({ status: 'fixed' }))[0]).toStartWith('defect-schema');
  expect(check(entry({ id: 'x1' }))[0]).toStartWith('defect-schema');
  expect(check(entry({ extra: 1 }))[0]).toStartWith('defect-schema');
});
