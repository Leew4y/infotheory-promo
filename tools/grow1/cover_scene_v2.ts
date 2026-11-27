// The 4:3 cover of grow1 v2 (《长高一倍》: 头顶到了五楼), drawn with the film's kit. Not part of the film:
// tools/grow1/covers.py --v2 copies films/grow1 into a private film, puts this file in as its only scene, shoots it and
// crops x 240 .. 1680 (1440 x 1080), so content stays in x 326 .. 1594, y 65 .. 1015 (6 % margins).
// Brief (pilot_short_1_v2.md, 标题和封面): the building's section with the head top outside the 5th-floor window, the
// neighbour with the watering can looking out (「……」), big 「第 3 天，头顶到 5 楼」, small 「体重 ×512」, the red 「假设」
// stamp, the name plate 「核算员」. The window is shown as in the film's close-up (the same panel, magnified world).
import { background, scene, ctx, C, F, mulberry } from '../../../engine';
import {
  STILL, grid, pic, picW, person, GROUND, GRID, zoomView, building, FLOOR_M, SILL_M, potAndCan, bubble, whorl, shirtSeams,
} from '../kit';

const RED_INK = 0.93;

/** The rubber stamp 「假设」 (as the composer's band draws it): red frame and text, turned 3 degrees, worn ink. */
function stamp(x: number, y: number, size: number): { w: number; h: number } {
  const ls = size * 0.15, padX = size * 0.275, padY = size * 0.175, frame = Math.max(4, size * 0.0875);
  const tw = picW('假设', size, 800, F.body, ls) - ls;
  const w = tw + 2 * padX + 2 * frame, h = size * 1.08 + 2 * padY + 2 * frame;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((-3 * Math.PI) / 180);
  ctx.translate(-w / 2, -h / 2);
  ctx.globalAlpha = RED_INK;
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = frame;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(frame / 2, frame / 2, w - frame, h - frame, frame);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((-3 * Math.PI) / 180);
  pic('假设', 0, size * 0.36, { size, weight: 800, font: F.body, color: C.accent, align: 'center', ls, a: RED_INK });
  const rnd = mulberry(20261127);
  ctx.fillStyle = C.bg;
  for (let i = 0; i < 260; i++) {
    const fx = (rnd() - 0.5) * w, fy = (rnd() - 0.5) * h, fr = 0.6 + rnd() * rnd() * 3.2;
    ctx.globalAlpha = 0.25 + 0.55 * rnd();
    ctx.beginPath();
    ctx.ellipse(fx, fy, fr * 1.6, fr, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return { w, h };
}

/** The name plate 「核算员」; (right, top) is its frame's top-right corner. */
function plate(right: number, top: number, size: number): void {
  const ls = size * 0.23, padX = size * 0.6, padY = size * 0.36;
  const tw = picW('核算员', size, 600, F.body, ls) - ls;
  const w = tw + 2 * padX, h = size * 1.06 + 2 * padY;
  ctx.save();
  ctx.strokeStyle = C.fg;
  ctx.lineWidth = 2;
  ctx.strokeRect(right - w, top, w, h);
  ctx.restore();
  pic('核算员', right - w / 2 + ls / 2, top + padY + size * 0.86, { size, weight: 600, font: F.body, align: 'center', ls });
}

/** Day 3 of the film (s1.ts): px per metre, the building, the grown figure, the 5th-floor neighbour. */
const S3 = 760 / 13.6, BX0 = 590, BX1 = 850, GH = 13.6 * S3, GX = BX1 + 0.168 * GH + 16, NB_X = BX1 - 60;

/** The close-up of the 5th-floor window in an ink-framed panel, as in the film during g5b. */
function windowPanel(x0: number, y0: number, x1: number, y1: number): void {
  const v = zoomView(760, 110, x0 + 15, y0 + 30, 2.1);
  ctx.save();
  ctx.fillStyle = C.bg;
  ctx.beginPath();
  ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 10);
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = C.rule;
  ctx.lineWidth = GRID.minorW;
  ctx.globalAlpha = GRID.minorA;
  ctx.beginPath();
  for (let i = 0; i <= 30; i++) {
    const x = v.x(i * GRID.pitch), y = v.y(i * GRID.pitch);
    if (x > x0 && x < x1) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    if (y > y0 && y < y1) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  building({ x0: BX0, x1: BX1, ground: GROUND, s: S3, v, a: 1, fadeTop: -Infinity, labelA: 0 });
  const floor5 = GROUND - 4 * FLOOR_M * S3, h = 1.7 * S3;
  person(v.x(NB_X), v.y(floor5), h * v.z, { look: 'line' });
  potAndCan(BX1 - 14, GROUND - (4 * FLOOR_M + SILL_M) * S3, NB_X + 0.2 * h, floor5 - 0.52 * h, S3, v, 1);
  person(v.x(GX), v.y(GROUND), GH * v.z, { look: 'solid' });
  shirtSeams(v.x(GX), v.y(GROUND), GH * v.z, 8, 1, 1);
  const r = 0.06 * GH * v.z;
  whorl(v.x(GX), v.y(GROUND - 0.94 * GH) - 0.6 * r, 0.4 * r, 1);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = C.fg;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 10);
  ctx.stroke();
  ctx.restore();
  const head = v.y(floor5 - h);
  bubble(v.x(NB_X) + 40, head - 70, '……', v.x(NB_X) + 10, head - 8, 1, 1);
}

/** The 4:3 cover, in frame px; covers.py keeps x 240 .. 1680. */
function cover43(): void {
  const L = 330, R = 1590;
  const st = stamp(L, 74, 76);
  const px = L + st.w + 34;
  pic('每天长高一倍，形状不变', px, 116, { size: 46, weight: 600, font: F.body });
  pic('今天 1.7 米、70 公斤', px, 174, { size: 46, weight: 600, font: F.body });
  pic('一层楼按 3 米算', px, 232, { size: 46, weight: 600, font: F.body });
  plate(R, 70, 48);
  // the title, two display lines (a large line does not end in ，)
  pic('第 3 天', L, 440, { size: 110, weight: 700, font: F.body, ls: 4 });
  pic('头顶到 5 楼', L, 590, { size: 110, weight: 700, font: F.body, ls: 4 });
  const w1 = picW('体重', 68, 700, F.body);
  pic('体重', L, 730, { size: 68, weight: 700, font: F.body, color: C.fg2 });
  pic('×512', L + w1 + 18, 730, { size: 68, weight: 700, color: C.accent });
  windowPanel(960, 300, R, 1012);
}

scene({
  name: 'cover', kind: 'page', dur: 1, subs: [], ...STILL, mb: 1,
  draw() {
    background();
    grid();
    cover43();
  },
});
