import { expect, test } from 'bun:test';
import { compareLines, normalize, parseTranscripts, similarity } from '../scripts/lib/hear';

test('normalize drops what the ear cannot tell', () => {
  expect(normalize('二〇二六年，“OpenAI”！')).toBe(normalize('2026年 openai'));
  expect(normalize('他们正确地完成')).toBe(normalize('它们正确的完成'));
});

test('similarity is 1 for the same line and falls with the changed characters', () => {
  expect(similarity('在完全清醒的时候', '在完全清醒的时候。')).toBe(1);
  expect(similarity('一二三四', '一二三五')).toBe(0.75);
  expect(similarity('一二三四', '')).toBe(0);
  expect(similarity('', '')).toBe(1);
});

test('a real misreading stays visible', () => {
  expect(similarity('为一位真正的数学家的一生辩护', '为一位真正的数学家的一生变化')).toBeLessThan(1);
});

test('parseTranscripts reads result lines and skips progress', () => {
  const m = parseTranscripts('Loading\n[1/2] a.flac\n{"file":"/x/n01.flac","text":"你好"}\n{bad\n{"file":"n02.wav","text":""}\n');
  expect([...m]).toEqual([['n01', '你好'], ['n02', '']]);
});

test('compareLines grades every line of the lock, and an absent transcript is never a pass', () => {
  const lines = { a: { text: 'x', read: '一二三四五六七八九十' }, b: { text: '一二三四' }, c: { text: '一二三四' }, d: { text: '一二三四' } };
  const heard = new Map([['a', '一二三四五六七八九'], ['b', '一二三四'], ['c', '五六七八']]);
  expect(compareLines(lines, heard).map((r) => r.level)).toEqual(['differs', 'same', 'wrong', 'missing']);
});
