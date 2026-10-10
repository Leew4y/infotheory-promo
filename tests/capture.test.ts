// Unit tests of the capture edit and geometry (engine/capture.ts): bun test
import { describe, expect, test } from 'bun:test';
import { frameOf } from '../engine/film';
import { cameraAt, cameraProblems, editDuration, editEvents, editProblems, filmTime, sourceFrame, sourceTime, toFrame, viewTransform, type CaptureAsset } from '../engine/capture';

const asset: CaptureAsset = {
  id: 't', fps: 30, frames: 300, width: 1920, height: 1080, viewport: { width: 960, height: 540 }, dpr: 2,
  crop: null,
  source: { file: 'x.mp4', sha256: '', bytes: 0, duration: 10, width: 1920, height: 1080, fps: 30 },
  events: [{ t: 1, type: 'click', x: 100, y: 50 }, { t: 3.5, type: 'click', x: 10, y: 10 }, { t: 6, type: 'mark' }],
  made: {},
};

describe('edit', () => {
  const edit = [{ from: 0, to: 2 }, { from: 4, to: 8, speed: 2 }];
  test('duration sums segment lengths over speed', () => expect(editDuration(edit)).toBe(4));
  test('source time across a cut and a speed change', () => {
    expect(sourceTime(edit, 0)).toBe(0);
    expect(sourceTime(edit, 1.5)).toBe(1.5);
    expect(sourceTime(edit, 2)).toBe(4); // the cut [2, 4) is skipped
    expect(sourceTime(edit, 3)).toBe(6); // 1 s of film at speed 2
  });
  test('clamped before and after', () => {
    expect(sourceTime(edit, -1)).toBe(0);
    expect(sourceTime(edit, 99)).toBeCloseTo(8, 5);
  });
  test('film time is the inverse inside segments, null inside cuts (half-open)', () => {
    expect(filmTime(edit, 1)).toBe(1);
    expect(filmTime(edit, 2)).toBeNull();
    expect(filmTime(edit, 3.9)).toBeNull();
    expect(filmTime(edit, 4)).toBe(2);
    expect(filmTime(edit, 6)).toBe(3);
    expect(filmTime(edit, 8)).toBeNull();
    for (const lt of [0, 0.7, 1.99, 2, 2.5, 3.99]) expect(filmTime(edit, sourceTime(edit, lt))).toBeCloseTo(lt, 9);
  });
  test('events: shown at film time, cut ones listed apart', () => {
    const r = editEvents(edit, asset);
    expect(r.shown.map((e) => e.lt)).toEqual([1, 3]);
    expect(r.cut.map((e) => e.t)).toEqual([3.5]);
  });
  test('problems: order, speed, outside the recording', () => {
    expect(editProblems(edit, asset)).toEqual([]);
    expect(editProblems([], asset).length).toBe(1);
    expect(editProblems([{ from: 2, to: 1 }], asset).length).toBe(1);
    expect(editProblems([{ from: 0, to: 1, speed: 0 }], asset).length).toBe(1);
    expect(editProblems([{ from: 9, to: 11 }], asset).length).toBe(1);
  });
});

describe('frames', () => {
  test('floor(src x fps + 1e-9), clamped', () => {
    expect(sourceFrame(asset, 0)).toBe(0);
    expect(sourceFrame(asset, 1 / 30)).toBe(1); // exactly on a frame boundary despite float error
    expect(sourceFrame(asset, 0.999 / 30)).toBe(0);
    expect(sourceFrame(asset, 99)).toBe(299);
    expect(sourceFrame(asset, -1)).toBe(0);
    for (let i = 0; i < 300; i++) expect(sourceFrame(asset, i / 30)).toBe(i);
  });
});

describe('geometry', () => {
  const rect = { x: 100, y: 100, w: 960, h: 540 };
  test('zoom 1 fits the frame in the rect', () => {
    const v = viewTransform(asset, rect, cameraAt([], asset, 0));
    expect(v.s).toBe(0.5);
    expect(v.ox).toBe(100);
    expect(v.oy).toBe(100);
  });
  test('zoomed view is held inside the frame (no empty area)', () => {
    const v = viewTransform(asset, rect, { x: 0, y: 0, zoom: 2 });
    expect(v.s).toBe(1);
    expect(v.ox).toBe(100); // frame's left edge at the rect's left edge
    expect(v.oy).toBe(100);
    const w = viewTransform(asset, rect, { x: 1920, y: 1080, zoom: 2 });
    expect(w.ox + 1920 * w.s).toBe(rect.x + rect.w);
    expect(w.oy + 1080 * w.s).toBe(rect.y + rect.h);
  });
  test('camera keys: held before/after, eased between, zoom in log space', () => {
    const keys = [{ t: 1, x: 0, zoom: 1 }, { t: 3, x: 1000, zoom: 4 }];
    expect(cameraAt(keys, asset, 0).x).toBe(0);
    expect(cameraAt(keys, asset, 9).zoom).toBe(4);
    const mid = cameraAt(keys, asset, 2);
    expect(mid.x).toBeCloseTo(500, 9);
    expect(mid.zoom).toBeCloseTo(2, 9);
  });
  test('viewport CSS px to frame px', () => expect(toFrame(asset, 100, 50)).toEqual({ x: 200, y: 100 }));
});

// Expected values below are worked out by hand on the frame grid, not with the functions under test.
describe('edit boundaries on the frame grid', () => {
  test('a scene starting at frame 8: output frame 9 is local frame 1, the first frame of the second segment', () => {
    const edit = [{ from: 0, to: 1 / 30 }, { from: 1, to: 2 }];
    expect(frameOf(9 / 30, 30) - 8).toBe(1);
    // local frame 1 = 1/30 s: the first segment (1/30 s long) is over; source time 1 -> source frame 30
    expect(sourceFrame(asset, sourceTime(edit, (frameOf(9 / 30, 30) - 8) / 30))).toBe(30);
    // the float difference of global times lands just below the boundary; it must still pick the second segment
    expect(sourceFrame(asset, sourceTime(edit, 9 / 30 - 8 / 30))).toBe(30);
  });
  test('segment lengths that do not sum exactly (0.1 + 0.2) still switch on the frame', () => {
    const edit = [{ from: 0, to: 0.1 }, { from: 5, to: 5.2 }, { from: 8, to: 9 }];
    // local frame 9 = 0.3 s = the end of the first two segments (3 + 6 frames): source 8 -> frame 240
    expect(sourceFrame(asset, sourceTime(edit, 9 / 30))).toBe(240);
    expect(sourceFrame(asset, sourceTime(edit, 8 / 30))).toBe(155); // 5 + 5/30 s
  });
  test('film time is half-open with the same tolerance', () => {
    const edit = [{ from: 0, to: 0.1 }, { from: 5, to: 5.2 }];
    expect(filmTime(edit, 0.1 - 1e-12)).toBeNull();
    expect(filmTime(edit, 5)).toBeCloseTo(0.1, 12);
  });
  test('frameOf: frame i covers [i/fps, (i+1)/fps)', () => {
    for (let i = 0; i < 1000; i++) expect(frameOf(i / 30, 30)).toBe(i);
    expect(frameOf(1.01, 30)).toBe(30);
    expect(frameOf(0.999 / 30, 30)).toBe(0);
  });
});

describe('edit problems', () => {
  test('reordered or overlapping segments are refused (cut and trim only)', () => {
    expect(editProblems([{ from: 4, to: 5 }, { from: 1, to: 2 }], asset).length).toBe(1);
    expect(editProblems([{ from: 1, to: 3 }, { from: 2, to: 4 }], asset).length).toBe(1);
    expect(editProblems([{ from: 1, to: 2 }, { from: 2, to: 4 }], asset)).toEqual([]);
  });
  test('camera keys: finite, zoom > 0, strictly increasing times', () => {
    expect(cameraProblems([{ t: 0, zoom: 1 }, { t: 1, x: 10, y: 10, zoom: 2 }])).toEqual([]);
    expect(cameraProblems([{ t: 0, zoom: 0 }, { t: 1, zoom: 2 }]).length).toBe(1);
    expect(cameraProblems([{ t: 1 }, { t: 1 }]).length).toBe(1);
    expect(cameraProblems([{ t: 0, x: NaN }]).length).toBe(1);
  });
});

describe('crop', () => {
  const cropped: CaptureAsset = {
    ...asset, width: 960, height: 540, viewport: { width: 1920, height: 1080 }, dpr: 1, crop: { x: 100, y: 50, w: 960, h: 540 },
  };
  test('viewport px -> source px -> minus the crop origin -> frame px', () => expect(toFrame(cropped, 400, 200)).toEqual({ x: 300, y: 150 }));
  test('crop with a device pixel ratio of 2', () => {
    const a = { ...cropped, viewport: { width: 960, height: 540 }, dpr: 2 };
    expect(toFrame(a, 400, 200)).toEqual({ x: 700, y: 350 });
  });
});
