// Unit tests of narration timing (engine/narration.ts): bun test. Expected values are worked out by hand.
import { expect, test } from 'bun:test';
import { defineFilm, FRAMES } from '../engine/film';
import { narratedScene, narrationReport, useNarration, vo, type NarrationLock, type NarrationScript } from '../engine/narration';

defineFilm({ id: 'narration-test', fps: 30, bpm: 80, chapters: 1 });
const script: NarrationScript = {
  voice: 'v',
  lines: [
    { id: 'a', scene: 'one', text: '版本 v2.1', read: '版本 v二点一' },
    { id: 'b', scene: 'one', text: '第二句', en: 'second' },
    { id: 'c', scene: 'two', text: '两秒的旁白' },
    { id: 'd', scene: 'nowhere', text: '没有场景' },
  ],
};
const entry = (text: string, duration: number, read = text) => ({ text, read, duration, sha256: '0'.repeat(64), key: 'k' });
const lock: NarrationLock = {
  film: 'narration-test', backend: 'fake', model: 'm', voice: 'v',
  lines: { a: entry('版本 v2.1', 1, '版本 v二点一'), b: entry('第二句', 2), c: entry('两秒的旁白', 2), d: entry('没有场景', 1) },
};

test('a stale or foreign lock is refused', () => {
  expect(() => useNarration(script, { ...lock, film: 'other' })).toThrow(/film/);
  expect(() => useNarration(script, { ...lock, voice: 'w' })).toThrow(/voice/);
  expect(() => useNarration(script, { ...lock, lines: { ...lock.lines, b: entry('旧的', 2) } })).toThrow(/changed/);
  expect(() => useNarration(script, { ...lock, lines: { ...lock.lines, a: entry('版本 v2.1', 1) } })).toThrow(/changed/); // reading changed
  expect(() => useNarration(script, { ...lock, lines: { ...lock.lines, c: entry('两秒的旁白', 0) } })).toThrow(/duration/);
});

test('a scene lasts lead + lines + gaps + tail, rounded up to whole frames; lines are captions', () => {
  useNarration(script, lock);
  const s = narratedScene({ name: 'one', kind: 'page', draw: () => {} });
  // .6 + 1 + .35 + 2 + .8 = 4.75 s = 142.5 frames -> 143
  expect(s.f1 - s.f0).toBe(143);
  expect(vo('a')).toBeCloseTo(0.6, 12);
  expect(vo('b')).toBeCloseTo(1.95, 12);
  expect(s.subs.map(([a, b, zh, en]) => [+a.toFixed(6), +b.toFixed(6), zh, en])).toEqual([[0.6, 1.6, '版本 v2.1', ''], [1.95, 3.95, '第二句', 'second']]);
});

test('2 s of narration over 5 s of footage: the scene keeps the 5 s', () => {
  const s = narratedScene({ name: 'two', kind: 'page', minDur: 5, draw: () => {} });
  expect(s.f0).toBe(143);
  expect(s.f1 - s.f0).toBe(150);
  const c = narrationReport().placements.find((p) => p.id === 'c')!;
  expect(c.t).toBeCloseTo(143 / 30 + 0.6, 9);
  expect(c.dur).toBe(2);
});

test('a line placed twice is an error, before the scene registers; unplaced lines are reported', () => {
  const before = FRAMES;
  expect(() => narratedScene({ name: 'again', kind: 'page', lines: ['a'], draw: () => {} })).toThrow(/already placed/);
  expect(FRAMES).toBe(before);
  expect(narrationReport().unplaced).toEqual(['d']);
});
