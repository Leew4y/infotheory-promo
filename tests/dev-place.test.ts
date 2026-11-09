import { expect, test } from 'bun:test';
import { startPlace, type Place } from '../engine/dev-place';

const scenes = [{ name: 'a', t0: 0, d: 10 }, { name: 'b', t0: 10, d: 5 }];
const saved = (o: Partial<Place>): Place => ({ search: '', scene: 'b', lt: 2, loop: false, playing: false, ...o });

test('with nothing said, the film opens at the start, paused', () => {
  expect(startPlace(scenes, 15, '', null)).toEqual({ t: 0, loop: false, playing: false });
});

test('a reload returns to the same moment of the same scene, even if the scene moved', () => {
  expect(startPlace(scenes, 15, '', saved({})).t).toBe(12);
  expect(startPlace([{ name: 'a', t0: 0, d: 20 }, { name: 'b', t0: 20, d: 5 }], 25, '', saved({})).t).toBe(22);
  expect(startPlace(scenes, 15, '', saved({ loop: true, playing: true }))).toEqual({ t: 12, loop: true, playing: true });
});

test('a scene made shorter keeps the place inside it', () => {
  const t = startPlace([{ name: 'a', t0: 0, d: 10 }, { name: 'b', t0: 10, d: 1 }], 11, '', saved({ lt: 4 })).t;
  expect(t).toBeGreaterThanOrEqual(10);
  expect(t).toBeLessThan(11);
});

test('what was saved under another URL, or for a scene that is gone, does not count', () => {
  expect(startPlace(scenes, 15, '?scene=a', saved({})).t).toBe(0);
  expect(startPlace(scenes, 15, '', saved({ scene: 'gone' })).t).toBe(0);
});

test('the URL says where to open', () => {
  expect(startPlace(scenes, 15, '?scene=b', null)).toEqual({ t: 10, loop: false, playing: false });
  expect(startPlace(scenes, 15, '?scene=b&loop=1', null)).toEqual({ t: 10, loop: true, playing: true });
  expect(startPlace(scenes, 15, '?t=3.5', null).t).toBe(3.5);
  expect(startPlace(scenes, 15, '?t=99', null).t).toBeCloseTo(14.99);
  expect(startPlace(scenes, 15, '?t=x', null).t).toBe(0);
});

test('an unknown scene names the ones there are', () => {
  const s = startPlace(scenes, 15, '?scene=c', null);
  expect(s.error).toContain('a, b');
  expect(s.playing).toBe(false);
});
