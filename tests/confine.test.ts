// Unit tests of the file servers' path confinement (scripts/lib/confine.ts): bun test
import { afterAll, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { confined } from '../scripts/lib/confine';

const base = mkdtempSync(path.join(os.tmpdir(), 'confine-'));
const root = path.join(base, 'root');
mkdirSync(path.join(root, 'a'), { recursive: true });
writeFileSync(path.join(root, 'a', 'f.jpg'), 'x');
writeFileSync(path.join(base, 'secret.txt'), 'x');
let linked = false;
try { symlinkSync(base, path.join(root, 'out'), 'junction'); linked = true; } catch { /* no permission to link here */ }
afterAll(() => rmSync(base, { recursive: true, force: true }));

test('a file inside the root', () => expect(confined(root, '/a/f.jpg')).not.toBeNull());
test('dot segments and backslashes cannot leave the root', () => {
  expect(confined(root, '/../secret.txt')).toBeNull();
  expect(confined(root, '/a/../../secret.txt')).toBeNull();
  expect(confined(root, '/..\\secret.txt')).toBeNull();
});
test('missing files and directories are not served', () => {
  expect(confined(root, '/a/none.jpg')).toBeNull();
  expect(confined(root, '/a')).toBeNull();
});
test('a link inside the root to outside it is refused', () => {
  if (!linked) return;
  expect(confined(root, '/out/secret.txt')).toBeNull();
});
