// Unit tests of the media cache (engine/media.ts) with fetch and createImageBitmap stubbed: bun test
import { expect, test } from 'bun:test';

// a 1x1 "bitmap" costs 4 bytes; fetch answers every URL, slowly for frames listed in `slow`
const slow = new Set<string>();
let closed = 0;
globalThis.fetch = (async (u: string) => {
  if (slow.has(String(u))) await Bun.sleep(20);
  return new Response('x');
}) as unknown as typeof fetch;
(globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = async () => ({ width: 1, height: 1, close: () => { closed++; } });

const { bitmap, ensure, mediaStats, prefetch, setBudget, setStrict } = await import('../engine/media');

test('the working set of ensure() survives look-ahead loads that overflow the cache', async () => {
  setStrict(true);
  setBudget(4); // room for one frame
  await ensure([{ seq: 's', frame: 0 }]);
  prefetch([{ seq: 's', frame: 1 }, { seq: 's', frame: 2 }]);
  await Bun.sleep(30);
  expect(() => bitmap({ seq: 's', frame: 0 })).not.toThrow();
  expect(mediaStats().pinned).toBe(1);
});

test('concurrent prefetch during ensure() does not evict the frame being drawn', async () => {
  setBudget(4);
  slow.add('/media/s/00010.jpg');
  const p = ensure([{ seq: 's', frame: 10 }]);
  prefetch([{ seq: 's', frame: 11 }, { seq: 's', frame: 12 }]);
  await p;
  await Bun.sleep(30);
  expect(() => bitmap({ seq: 's', frame: 10 })).not.toThrow();
});

test('a working set over the budget is an error', async () => {
  setBudget(4);
  await expect(ensure([{ seq: 's', frame: 20 }, { seq: 's', frame: 21 }])).rejects.toThrow(/over the/);
});

test('a frame named twice is counted once', async () => {
  setBudget(4);
  await ensure([{ seq: 's', frame: 30 }, { seq: 's', frame: 30 }]);
  expect(() => bitmap({ seq: 's', frame: 30 })).not.toThrow();
});

test('concurrent ensure() calls: the frames of one still loading are not evicted by the other', async () => {
  setBudget(8); // room for two frames
  slow.add('/media/s/00041.jpg');
  const a = ensure([{ seq: 's', frame: 40 }, { seq: 's', frame: 41 }]);
  const b = ensure([{ seq: 's', frame: 42 }]);
  await b;
  await a;
  expect(() => bitmap({ seq: 's', frame: 40 })).not.toThrow();
  expect(() => bitmap({ seq: 's', frame: 41 })).not.toThrow();
});

test('evicted bitmaps are closed', () => expect(closed).toBeGreaterThan(0));
