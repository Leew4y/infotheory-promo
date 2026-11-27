// The covers of grow1 (《长高一倍，体重变几倍？》), drawn with the film's kit. Not part of the film: tools/grow1/covers.py
// copies films/grow1 into a private film, puts this file in as its only scene, shoots two frames and removes the copy.
// Brief (HANDOFF_20261127.md, pilot_short_1.md): grid paper, the 1.7 m and the 3.4 m "你" side by side, 「体重 ×8」
// beside them, the big title 「长高一倍，体重变几倍？」, the red 「假设」 stamp, the name plate 「核算员」; 6 % margins.
//
//  lt < 1  the 4:3 cover, whole: covers.py crops x 240 .. 1680 (1440 x 1080), so content stays in x 326 .. 1594,
//          y 65 .. 1015 (6 % of 1440 and of 1080).
//  lt >= 1 the picture of the 3:4 cover: covers.py runs it through vertical.py (scaled to 1080 x 608 under the band
//          with the stamp, the premise and the name plate) and sets the title under it. Kept clear like the film's
//          picture: nothing in the top and bottom 60 px or right of x 1653, where the composer measures the grid.
import { background, scene, ctx, C, F, mulberry } from '../../../engine';
import { STILL, grid, pic, picW, person, ruler, RULER, heightMark, GROUND } from '../kit';

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
  const r = frame;
  ctx.beginPath();
  ctx.roundRect(frame / 2, frame / 2, w - frame, h - frame, r);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((-3 * Math.PI) / 180);
  pic('假设', 0, size * 0.36, { size, weight: 800, font: F.body, color: C.accent, align: 'center', ls, a: RED_INK });
  // worn ink: small flecks of paper over the stamp (fixed seed)
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

/** The name plate 「核算员」: ink text in a thin ink frame; (right, top) is its frame's top-right corner. */
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

/** 「体重 ×8」: 体重 in ink (F.body), ×8 in red (F.math); (x, y) the start of its baseline. Returns its width. */
function weightTimes(x: number, y: number, size: number): number {
  const w1 = picW('体重', size, 700, F.body), gap = size * 0.28;
  pic('体重', x, y, { size, weight: 700, font: F.body });
  pic('×8', x + w1 + gap, y, { size, weight: 700, color: C.accent });
  return w1 + gap + picW('×8', size, 700);
}

function groundLine(x0: number, x1: number): void {
  ctx.save();
  ctx.strokeStyle = C.fg;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(x0, GROUND);
  ctx.lineTo(x1, GROUND);
  ctx.stroke();
  ctx.restore();
}

/** The 4:3 cover, in frame px; covers.py keeps x 240 .. 1680. */
function cover43(): void {
  const L = 330, R = 1590;
  const st = stamp(L, 74, 76);
  pic('每天长高一倍，形状不变', L + st.w + 34, 120, { size: 46, weight: 600, font: F.body });
  pic('今天 1.7 米、70 公斤', L + st.w + 34, 184, { size: 46, weight: 600, font: F.body });
  plate(R, 70, 48);
  // the title, two display lines (a large line does not end in ，; ？ stays)
  pic('长高一倍', L, 418, { size: 132, weight: 700, font: F.body, ls: 4 });
  pic('体重变几倍？', L, 580, { size: 132, weight: 700, font: F.body, ls: 4 });
  weightTimes(L, 830, 120);
  // the two figures, side by side on one scale: s px per metre
  const s = 214, hBig = 3.4 * s, hRef = 1.7 * s;
  const bigX = R - 0.168 * hBig - 4, refX = bigX - 0.168 * hBig - 0.168 * hRef - 70;
  groundLine(refX - 0.168 * hRef - 40, R);
  person(refX, GROUND, hRef, { look: 'line' });
  person(bigX, GROUND, hBig);
  pic('1.7 米', refX, GROUND - hRef - 26, { size: 52, weight: 600, align: 'center', color: C.fg2 });
  pic('3.4 米', bigX - 0.168 * hBig + 2, GROUND - hBig + 40, { size: 52, weight: 600, align: 'right', color: C.fg2 });
}

/** The picture of the 3:4 cover (16:9, scaled into the vertical page by vertical.py). */
function picture34(): void {
  const s = 220, hBig = 3.4 * s, hRef = 1.7 * s;
  const dx = 1420 - RULER.x; // the ruler at x 1420
  const bigX = 1420 - 0.168 * hBig - 70, refX = bigX - 0.168 * hBig - 0.168 * hRef - 80;
  const yBig = GROUND - hBig, yRef = GROUND - hRef;
  const marked = (f: () => void) => { ctx.save(); ctx.translate(dx, 0); f(); ctx.restore(); };
  groundLine(128, 1420);
  // the reference first, its mark under the big figure
  person(refX, GROUND, hRef, { look: 'line' });
  marked(() => heightMark(refX + 30 - dx, yRef, '1.7 米', 1, 1, C.fg2));
  person(bigX, GROUND, hBig);
  marked(() => { heightMark(bigX + 30 - dx, yBig, '3.4 米'); ruler(s, 1, yBig); });
  weightTimes(128, 470, 150);
}

scene({
  name: 'cover', kind: 'page', dur: 2, subs: [], ...STILL, mb: 1,
  draw(lt) {
    background();
    grid();
    if (lt < 1) cover43();
    else picture34();
  },
});
