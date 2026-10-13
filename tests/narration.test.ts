// Unit tests of narration timing (engine/narration.ts): bun test. Expected values are worked out by hand.
import { expect, test } from 'bun:test';
import { defineFilm, FRAMES } from '../engine/film';
import { scene } from '../engine/scene';
import { narratedScene, narrationReport, captionWidth, placeNarration, readingSplits, splitCaption, spokenLength, syncSubs, useNarration, vo, type NarrationLock, type NarrationScript } from '../engine/narration';

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

test('placeNarration: fixed times in a scene of its own length; overlaps and overruns refused', () => {
  const s = scene({ name: 'nowhere', kind: 'page', dur: 2, subs: [], draw: () => {} });
  expect(() => placeNarration(s, { a: 0 })).toThrow(/belongs to scene "one"/);
  expect(() => placeNarration(s, { d: 1.5 })).toThrow(/past the end of the scene/); // 1 s from 1.5 s in a 2 s scene
  placeNarration(s, { d: 0.5 });
  expect(vo('d')).toBe(0.5);
  expect(narrationReport().placements.find((p) => p.id === 'd')!.t).toBeCloseTo(s.t0 + 0.5, 9);
});

test('a line placed twice is an error, before the scene registers; unplaced lines are reported', () => {
  const before = FRAMES;
  expect(() => narratedScene({ name: 'again', kind: 'page', lines: ['a'], draw: () => {} })).toThrow(/already placed/);
  expect(FRAMES).toBe(before);
  expect(narrationReport().unplaced).toEqual([]);
});

test('captions follow the voice: phrase boundaries snap to pauses, the last caption holds after the speech', () => {
  const line = { t: 1, dur: 4, spans: [[0, 1.2], [1.6, 4]] as [number, number][] };
  // 3 + 6 spoken characters: the proportional boundary 1 + 4 * 3 / 9 = 2.33 s moves to the pause end at 2.6 s;
  // the last caption ends at 1 + 4 + 0.5 = 5.5 s (the scene ends at 10 s)
  expect(syncSubs([[1, 2.5, '一二三', ''], [2.5, 6, '四五六七八九', '']], [line], 10)).toEqual([[1, 2.6, '一二三', ''], [2.6, 5.5, '四五六七八九', '']]);
  // the next line at 5.8 s would leave a 0.3 s gap: the caption runs on to it
  expect(syncSubs([[1, 6, '一二三', '']], [line, { t: 5.8, dur: 1 }], 10)[0]).toEqual([1, 5.8, '一二三', '']);
  // a caption over no line keeps its times; one starting just before a line belongs to it (most overlap)
  const two = syncSubs([[0, 0.5, '片头', ''], [0.8, 3, '一二三', '']], [line], 10);
  expect(two[0]).toEqual([0, 0.5, '片头', '']);
  expect(two[1]).toEqual([1, 5.5, '一二三', '']);
  // no pause near the proportional boundary: it stays proportional (2.33 s)
  expect(syncSubs([[1, 2, '一二三', ''], [2, 5, '四五六七八九', '']], [{ t: 1, dur: 4, spans: [[0, 4]] }], 10)[1][0]).toBe(2.333); // ms
  expect(spokenLength('Fontenelle 写道：1699')).toBe(2 + 2 + 4); // a word, two characters, four digits
});

test('caption boundaries are found in the reading: numbers written out, Latin words light', () => {
  // 公布后的第二天一个符号错误 (13) | 让三篇手稿被撤回 (8) | 七百二十二变成七百一十九 (12): boundaries at 13/33 and 21/33
  const r = readingSplits(['公布后的第二天，一个符号错误，', '让三篇手稿被撤回。', '722，变成 719。'], '公布后的第二天，一个符号错误，让三篇手稿被撤回。七百二十二，变成七百一十九。')!;
  expect(r[0]).toBe(0);
  expect(r[1]).toBeCloseTo(13 / 33, 9);
  expect(r[2]).toBeCloseTo(21 / 33, 9);
  // a caption ending in digits: the boundary is where the next caption's text starts (after 四千 is read)
  expect(readingSplits(['约 4000', '个问题'], '约四千个问题')![1]).toBeCloseTo(3 / 6, 9);
  // a caption that does not open the line (its first half is display text only) starts where its words are read
  expect(readingSplits(['要紧的是独立'], '公布不等于检验要紧的是独立')![0]).toBeCloseTo(7 / 13, 9);
  expect(readingSplits(['7 月，一份', '报告'], '七月，一份报告')![0]).toBe(0); // opens with a number read out
  expect(readingSplits(['不在', '这句话里'], '完全不同')).toBeNull();
});

test('captions split into phrases of at most 16 widths, balanced, never inside a word, a number or a quotation', () => {
  expect(splitCaption('我们不应因为机器能够给出答案，就停止人类自己的探索；也不应因为答案来自强大的机器，就放弃检验它的责任。', 16))
    .toEqual(['我们不应因为机器能够给出答案', '就停止人类自己的探索', '也不应因为答案来自强大的机器', '就放弃检验它的责任']);
  expect(splitCaption('七月，一份 AI 协助生成的"否证"通过了证明检查程序——因为程序本身有漏洞。', 16))
    .toEqual(['七月，一份 AI 协助生成的', '"否证"通过了证明检查程序——', '因为程序本身有漏洞']);
  expect(splitCaption('短句。', 16)).toEqual(['短句']);
  expect(captionWidth('AI 写道')).toBe(1.5 + 2);
});
