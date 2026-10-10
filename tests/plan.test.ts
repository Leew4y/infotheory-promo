import { expect, test } from 'bun:test';
import { BriefSpec, FilmPlanSpec, planNarration, planTexts } from '../engine/plan';
import path from 'node:path';

const base = { film: 'plan-unit', fps: 30, styles: ['nebula'], scenes: [{ id: 'one', kind: 'page', dur: 1, copy: { heading: '标题', empty: '' } }] };
const parsed = (change: object) => FilmPlanSpec.safeParse({ ...base, ...change });
test('Brief checks the target duration and non-empty fields', () => {
  const b = { product: 'app', audience: 'judges', durationSeconds: 60, tone: 'clear', mustShow: ['demo'], language: 'zh' };
  expect(BriefSpec.safeParse(b).success).toBe(true);
  expect(BriefSpec.safeParse({ ...b, durationSeconds: 0 }).success).toBe(false);
  expect(BriefSpec.safeParse({ ...b, product: ' ' }).success).toBe(false);
});
test('dur xor lines, a voice for narration, and no separate narrated captions', () => {
  expect(parsed({}).success).toBe(true);
  const narrated = { id: 'one', kind: 'plate', lines: [{ id: 'a', text: '一句' }] };
  expect(parsed({ voice: 'v', scenes: [narrated] }).success).toBe(true);
  for (const scenes of [[{ ...narrated, dur: 1 }], [{ id: 'one', kind: 'page' }], [{ ...narrated, captions: [] }], [{ ...narrated, lines: [] }]])
    expect(parsed({ voice: 'v', scenes }).success).toBe(false);
  expect(parsed({ scenes: [narrated] }).success).toBe(false);
});
test('scene and line ids are unique across the film; lowercase ids and chapter bounds', () => {
  expect(parsed({ scenes: [base.scenes[0], base.scenes[0]] }).success).toBe(false);
  expect(parsed({ scenes: [{ ...base.scenes[0], id: 'Upper' }] }).success).toBe(false);
  expect(parsed({ voice: 'v', scenes: ['one', 'two'].map((id) => ({ id, kind: 'page', lines: [{ id: 'a', text: 'x' }] })) }).success).toBe(false);
  for (const chapter of [0, 2]) expect(parsed({ chapters: 1, scenes: [{ ...base.scenes[0], chapter, title: ['章', 'Chapter'] }] }).success).toBe(false);
  expect(parsed({ chapters: 1, scenes: [{ ...base.scenes[0], chapter: 1, title: ['章', 'Chapter'] }] }).success).toBe(true);
  expect(parsed({ chapters: 1, scenes: [{ ...base.scenes[0], chapter: 1 }] }).success).toBe(false);
});
test('demo capture and timing; paths, edit and camera are constrained', () => {
  const demo = { id: 'demo', kind: 'demo', capture: { asset: 'captures/app.json' } };
  for (const timing of [{}, { dur: 1 }, { lines: [{ id: 'a', text: 'x' }] }]) expect(parsed({ voice: 'v', scenes: [{ ...demo, ...timing }] }).success).toBe(true);
  expect(parsed({ scenes: [{ ...demo, capture: undefined }] }).success).toBe(false);
  for (const asset of ['../app.json', '/captures/app.json', 'captures/../app.json', 'C:\\x.json'])
    expect(parsed({ scenes: [{ ...demo, capture: { asset } }] }).success).toBe(false);
  for (const capture of [
    { ...demo.capture, edit: [{ from: 2, to: 1 }] },
    { ...demo.capture, edit: [{ from: 0, to: 2 }, { from: 1, to: 3 }] },
    { ...demo.capture, camera: [{ t: 1, x: 0, y: 0, zoom: 1 }, { t: 1, x: 0, y: 0, zoom: 2 }] },
  ]) expect(parsed({ scenes: [{ ...demo, capture }] }).success).toBe(false);
});
test('captions stay within fixed duration; text extraction excludes readings', () => {
  expect(parsed({ scenes: [{ ...base.scenes[0], captions: [[0, 2, '字', 'text']] }] }).success).toBe(false);
  const p = FilmPlanSpec.parse({ ...base, voice: 'v', scenes: [{ id: 'one', kind: 'page', title: ['标题', 'Title'], copy: { point: '要点' }, lines: [{ id: 'a', text: '文案', en: 'Copy', read: '读法' }] }] });
  expect(planNarration(p).lines[0].scene).toBe('one');
  expect(planTexts(p)).toContain('文案');
  expect(planTexts(p)).not.toContain('读法');
});
test('usePlan rejects film/fps mismatch, copy requires own keys, boot requires actual plan registrations', () => {
  // A film registry is intentionally single-use; do not share it with narration.test.ts.
  const r = Bun.spawnSync([process.execPath, '--eval', `
    import assert from 'node:assert/strict';
    import { assertPlanScenes, copy, recordPlanScene, usePlan } from './engine/plan';
    import { defineFilm } from './engine/film';
    import { scene } from './engine/scene';
    const base = ${JSON.stringify(base)};
    defineFilm({ id: 'plan-unit', fps: 30, bpm: 80, chapters: 0 });
    assert.throws(() => usePlan({ ...base, film: 'another' }), /film\\/fps/);
    assert.throws(() => usePlan({ ...base, fps: 60 }), /film\\/fps/);
    usePlan(base);
    assert.equal(copy('one', 'heading'), '标题');
    assert.equal(copy('one', 'empty'), '');
    for (const key of ['missing', 'toString', '__proto__']) assert.throws(() => copy('one', key), /copy key/);
    assert.throws(() => copy('missing', 'heading'), /unknown scene/);
    assert.throws(() => assertPlanScenes(), /expected \\[one\\]/);
    const s = scene({ name: 'one', kind: 'page', dur: 1, subs: [], draw() {} });
    assert.throws(() => assertPlanScenes(), /planScene/);
    recordPlanScene(s);
    assert.doesNotThrow(() => assertPlanScenes());
  `], { cwd: path.resolve(import.meta.dir, '..'), stdout: 'pipe', stderr: 'pipe' });
  expect(r.stderr.toString()).toBe('');
  expect(r.exitCode).toBe(0);
});
