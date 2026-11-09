import { expect, test } from 'bun:test';
import { sampleTimes } from '../scripts/lib/moments';

const scene = { start: 10, end: 20 };

test('a scene without captions keeps its five fixed points', () => {
  expect(sampleTimes(scene, 30).map(([tag]) => tag)).toEqual(['0%', '25%', '50%', '75%', 'end']);
  expect(sampleTimes(scene, 30)[4][1]).toBeCloseTo(20 - 1 / 30);
});

test('every caption is looked at in its middle', () => {
  const t = sampleTimes({ ...scene, subs: [[11, 12], [13, 16]] }, 30);
  expect(t.slice(5)).toEqual([['caption1', 11.5], ['caption2', 14.5]]);
});

test('a caption on a fixed frame is not rendered twice, and the fixed tag stays', () => {
  const t = sampleTimes({ ...scene, subs: [[14, 16]] }, 30);
  expect(t.map(([tag]) => tag)).toEqual(['0%', '25%', '50%', '75%', 'end']);
});

test('a caption running past the scene stays inside its frames', () => {
  const t = sampleTimes({ ...scene, subs: [[19.9, 40]] }, 30);
  expect(t.every(([, x]) => x >= 10 && x <= 20 - 1 / 30 + 1e-9)).toBe(true);
});
