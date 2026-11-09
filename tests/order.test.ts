import { expect, test } from 'bun:test';
import { shuffled } from '../scripts/lib/order';

const frames = Array.from({ length: 200 }, (_, i) => i);

test('shuffled is a permutation that leaves its input alone', () => {
  const input = [...frames];
  expect([...shuffled(input)].sort((a, b) => a - b)).toEqual(frames);
  expect(input).toEqual(frames);
});

test('shuffled is the same on every run and differs with the seed', () => {
  expect(shuffled(frames)).toEqual(shuffled(frames));
  expect(shuffled(frames, 1)).not.toEqual(shuffled(frames, 2));
});

test('shuffled goes backwards often: a seek to an earlier frame is what an order-dependent frame fails on', () => {
  const o = shuffled(frames);
  expect(o).not.toEqual(frames);
  expect(o.filter((f, i) => i > 0 && f < o[i - 1]).length).toBeGreaterThan(50);
});

test('shuffled handles the short cases', () => {
  expect(shuffled([])).toEqual([]);
  expect(shuffled([7])).toEqual([7]);
});
