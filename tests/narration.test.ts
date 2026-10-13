// Unit tests of narration timing (engine/narration.ts): bun test. Expected values are worked out by hand.
import { expect, test } from 'bun:test';
import { defineFilm, FRAMES } from '../engine/film';
import { scene } from '../engine/scene';
import { narratedScene, narrationReport, captionWidth, placeNarration, readingSplits, sentences, sentenceSubs, splitCaption, spokenLength, syncSubs, useNarration, vo, type NarrationLock, type NarrationScript } from '../engine/narration';

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

test('captions split into phrases: one sentence each, balanced, cut only at punctuation or spaces (PR #9 review)', () => {
  expect(splitCaption('我们不应因为机器能够给出答案，就停止人类自己的探索；也不应因为答案来自强大的机器，就放弃检验它的责任。', 16))
    .toEqual(['我们不应因为机器能够给出答案', '就停止人类自己的探索', '也不应因为答案来自强大的机器', '就放弃检验它的责任']);
  // a piece too wide is cut at a space, never between two Chinese characters ("还帮" / "着找出" was the bug)
  expect(splitCaption('漏洞报告一小时后，修复就推出了；后来，一个专门的安全 AI 还帮着找出了内核里更多的错误。', 16))
    .toEqual(['漏洞报告一小时后，修复就推出了', '后来，一个专门的安全 AI', '还帮着找出了内核里更多的错误']);
  // never across a sentence end ("被撤回。722" was the bug)
  expect(splitCaption('公布后的第二天，一个符号错误，让三篇手稿被撤回。722，变成 719。', 16))
    .toEqual(['公布后的第二天，一个符号错误', '让三篇手稿被撤回', '722，变成 719']);
  // no space and too wide: kept whole rather than cut inside words; an ellipsis stays whole
  expect(splitCaption('在完全清醒的时候……把自己的一生烧进去并且不后悔地一直做下去。', 16))
    .toEqual(['在完全清醒的时候……', '把自己的一生烧进去并且不后悔地一直做下去']);
  expect(splitCaption('短句。', 16)).toEqual(['短句']);
  expect(splitCaption('短句。', 16, false)).toEqual(['短句。']);
  expect(captionWidth('AI 写道')).toBe(1.5 + 2);
});

test('a caption holds one sentence: sentenceSubs cuts at sentence ends, 0.8 s each then the rest by spoken length (2 of 18), English paired', () => {
  expect(sentenceSubs([[0, 4, '是 4.7 比特；只有 4.1。', 'Uniform: 4.7 bits. Real: 4.1.']]).map((x) => x[3])).toEqual(['Uniform: 4.7 bits.', 'Real: 4.1.']);
  expect(sentences('可以。只要肯多花几个比特，噪声就不是终点。')).toEqual(['可以。', '只要肯多花几个比特，噪声就不是终点。']);
  expect(sentenceSubs([[0, 6, '可以。只要肯多花几个比特，噪声就不是终点。', 'Yes. Spend a few more bits, and noise is not the end.']])).toEqual([
    [0, 1.289, '可以。', 'Yes.'], [1.289, 6, '只要肯多花几个比特，噪声就不是终点。', 'Spend a few more bits, and noise is not the end.'],
  ]);
  expect(sentenceSubs([[1, 2, '一句话。', '']])).toEqual([[1, 2, '一句话。', '']]);
});

test('phrases land where they are spoken: estimates on the speech axis, long pauses preferred (PR #9 review cases)', () => {
  const at = (text: string, read: string, dur: number, spans: [number, number][], parts: string[]) =>
    syncSubs(parts.map((p) => [0, dur, p, ''] as [number, number, string, string]), [{ t: 0, dur, text, read, spans }], 99).map((x) => x[0]);
  // claim1: the third phrase starts at 4.38 s (it was put at 3.43 s, inside "它的系统")
  expect(at('2026 年 9 月，OpenAI 宣布：它的系统，给出了一道百万美元数学难题的解。', '二〇二六年九月，OpenAI 宣布：它的系统，给出了一道百万美元数学难题的解。', 7.66,
    [[0.03, 1.35], [1.97, 3.06], [3.43, 4.04], [4.38, 7.63]], ['2026 年 9 月', 'OpenAI 宣布：它的系统', '给出了一道百万美元数学难题的解'])).toEqual([0, 1.97, 4.38]);
  // n32: the second line starts at 5.15 s (it was 3.17 s, 2 s early)
  const n32 = '反方必须说出来：自主，不等于可以接受；一个系统可以正确地完成一个有害的目标。';
  expect(at(n32, n32, 8.69, [[0.09, 1.41], [2.18, 2.74], [3.17, 4.43], [5.15, 5.77], [6.07, 8.66]],
    ['反方必须说出来：自主，不等于可以接受；', '一个系统可以正确地完成一个有害的目标。'])).toEqual([0, 5.15]);
  // n33: the third part at 6.21 s, after the long pause, not 6.77 s after a short breath
  const n33 = '所以，即使有一天它会自己选择，要检验的也不只是答案，还有目标、行为与后果。';
  expect(at(n33, n33, 9.05, [[0.03, 0.35], [0.73, 1.61], [1.86, 3], [3.43, 4.22], [4.54, 5.65], [6.21, 6.59], [6.77, 7.31], [7.6, 8.26], [8.46, 9.02]],
    ['所以，即使有一天它会自己选择，', '要检验的也不只是答案，', '还有目标、行为与后果。'])).toEqual([0, 3.43, 6.21]);
  // paths: already right before, still right (a speech-axis estimate alone would have moved it)
  const paths = '可题面留了两条路：要么证明，没有外力时，任何合乎条件的水流都永远不会“破裂”；要么找到一种水流，再配一个光滑的外力，让它在有限时间里“破裂”。';
  expect(at(paths, paths, 14.76, [[0.01, 1.37], [2, 2.7], [3.07, 4.02], [4.33, 6.18], [6.43, 7.72], [8.91, 10.47], [10.79, 12.3], [12.96, 14.76]],
    ['可题面留了两条路：', '要么证明，没有外力时，任何合乎条件的水流都永远不会“破裂”；', '要么找到一种水流，再配一个光滑的外力，让它在有限时间里“破裂”。'])).toEqual([0, 2, 8.91]);
});

test('a repeated phrase stays with its own line; digits read between two captions are shared by count', () => {
  const lines = [{ t: 0, dur: 1, text: '可以。' }, { t: 5, dur: 1, text: '可以。' }];
  const out = syncSubs([[0, 1, '可以。', ''], [5, 6, '可以。', '']], lines, 10);
  expect(out.map((x) => x[0])).toEqual([0, 5]);
  // "公元 1999" | "2000 年": the reading 一九九九二〇〇〇 lies between them, half each (4 + 4 digits)
  const r = readingSplits(['公元 1999', '2000 年'], '公元一九九九二〇〇〇年')!;
  expect(r[1]).toBeCloseTo(6 / 11, 9);
});
