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

test('evicted bitmaps are closed', () => expect(closed).toBeGreaterThan(0));
