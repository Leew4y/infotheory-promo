// 3. Chapter 03: Bradley's tilted starlight (Phil. Trans. 35, 1728, no. 406, pp. 652-653). γ Draconis stood 39"
// further south in March than in September (about 40"). Light from the star falls straight down; the Earth carries
// the telescope sideways, so the tube must lean a little forward for the light to reach the eyepiece (the rain and
// umbrella picture, drawn, not said). Each packet of light is simulated: it falls vertically and either strikes the
// tube or reaches the eyepiece. Then Bradley's results: light is 10 210 times as fast as the Earth in its orbit, and
// sunlight reaches us in 8 min 12 s. The lean is drawn enlarged, and the page says so.
import { ctx, text, rule, ink, circlePts, dot, arrow, rgba, statement, background, C, scene, clamp, lerp, eout, sstep, bars, hash1, type Sfx } from '../../../engine';
import { beam, pulse, glow, bigNumber, source } from '../kit';

const SX = 960, SY = 360; // the star, straight overhead
const Y = 720; // the eyepiece end of the tube, on the cart; the tube turns about this point
const L = 280, HW0 = 13, HW1 = 22; // tube length; half widths at the eyepiece end and at the open end
const TRACK = Y + 56; // the rail the cart rolls on
const TOP = 400; // where the falling light is first drawn
const CP = 400; // light's speed in the drawing, px per second of picture time
const TH = (18 * Math.PI) / 180; // the lean in the drawing (the real one is some 20 arcseconds)
const V = CP * Math.tan(TH); // the cart speed this lean matches
const RX0 = 690, RX1 = 1210, RATE = 14; // the band of falling light; packets per second
const hw = (u: number): number => lerp(HW0, HW1, u / L);

/** Cart velocity (px/s) at picture time s: at rest, then to the right; it reverses (the other half of the year); left. */
const vel = (s: number): number => (s < 2.65 ? V * sstep(0.3, 0.7, s) : s < 3.25 ? V * Math.cos((Math.PI * (s - 2.65)) / 0.6) : -V);
// the cart's position: the integral of the velocity, tabulated once
const S0 = -3, DS = 1 / 600, NS = 8 * 600;
const DISP: number[] = [0];
for (let i = 1; i <= NS; i++) DISP.push(DISP[i - 1] + vel(S0 + (i - 0.5) * DS) * DS);
const disp = (s: number): number => {
  const f = clamp((s - S0) / DS, 0, NS), i = Math.min(NS - 1, Math.floor(f));
  return lerp(DISP[i], DISP[i + 1], f - i);
};
/** Picture time runs from lt 1.2 and slows to a stop over FZ..FZ+0.6; it stops at SEND. */
const FZ = 4.9, SEND = FZ - 1.2 + 0.3;
const tau = (lt: number): number => {
  if (lt <= FZ) return lt - 1.2;
  const k = clamp((lt - FZ) / 0.6);
  return FZ - 1.2 + 0.6 * (k - k ** 3 + k ** 4 / 2);
};
const X0 = SX - disp(SEND); // so that the picture stops with the cart right under the star
const cartX = (s: number): number => X0 + disp(s);
/** The lean (radians, + = top to the right): upright at first, then exactly the angle the motion needs. */
const lean = (s: number): number => Math.atan(vel(s) / CP) * sstep(1.25, 1.75, s);

/** A point relative to the tube at picture time s: u along the axis from the eyepiece end, w across it. */
function local(s: number, px: number, py: number): { u: number; w: number; x: number } {
  const x = cartX(s), th = lean(s), dx = px - x, dy = py - Y;
  return { u: dx * Math.sin(th) - dy * Math.cos(th), w: dx * Math.cos(th) + dy * Math.sin(th), x };
}
/** The screen point at (u, w) on the tube at picture time s (a spot on the wall moves with the tube). */
function onTube(s: number, u: number, w: number): [number, number] {
  const x = cartX(s), th = lean(s);
  return [x + u * Math.sin(th) + w * Math.cos(th), Y - u * Math.cos(th) + w * Math.sin(th)];
}

/** What becomes of a packet falling at x from TOP, starting at picture time ts: where and when it stops. */
type End = 'ground' | 'outer' | 'wall' | 'eye';
interface Fate { t1: number; y1: number; end: End; u: number; w: number }
const FATES = new Map<string, Fate>();
function fate(key: string, x: number, ts: number): Fate {
  const got = FATES.get(key);
  if (got) return got;
  let inside = false, f: Fate | null = null;
  for (let i = 0; !f; i++) {
    const t = ts + i / 240, y = TOP + CP * (t - ts), q = local(t, x, y);
    const inTube = q.u >= 0 && q.u <= L && Math.abs(q.w) <= hw(q.u);
    if (!inside) {
      if (inTube) {
        if (q.u >= L - 8) inside = true; // came in through the open end
        else f = { t1: t, y1: y, end: 'outer', u: q.u, w: q.w };
      } else if (y >= TRACK || (y >= Y + 14 && Math.abs(x - q.x) <= 48)) f = { t1: t, y1: Math.min(y, TRACK), end: 'ground', u: q.u, w: q.w };
    } else if (!inTube) f = { t1: t, y1: y, end: q.u < 0 ? 'eye' : 'wall', u: q.u, w: Math.sign(q.w) * hw(q.u) };
  }
  FATES.set(key, f);
  return f;
}

// the falling light: packets at scattered places and times
const rainX = (i: number): number => RX0 + (RX1 - RX0) * hash1(i * 3.17 + 0.5);
const rainT = (i: number): number => (i + 0.8 * hash1(i * 7.13 + 2.3)) / RATE;
/** Packets that tell the story, [picture time it enters the open end, offset across the opening (+ = front)]: at rest
 * (caught), moving upright (strikes the wall), leaning (caught), moving and leaning the other way (caught). */
const HEROES: [number, number][] = [[-0.6, 0], [0.75, 16], [1.8, 0], [3.28, 0]];
const heroes = HEROES.map(([te, off], j) => {
  const x = cartX(te), th = lean(te);
  const hx = x + L * Math.sin(th) + off * Math.cos(th), hy = Y - L * Math.cos(th) + off * Math.sin(th);
  const ts = te - (hy - TOP) / CP;
  return { x: hx, ts, f: fate(`h${j}`, hx, ts) };
});
const MISS = heroes[1].f.t1 + 1.2, CATCH = heroes[2].f.t1 + 1.2;

/** How brightly the eyepiece is lit at picture time s: each packet that reached it, fading. */
function eyeLight(s: number): number {
  let e = 0;
  const add = (f: Fate) => {
    if (f.end === 'eye' && f.t1 <= s) e += Math.exp(-(s - f.t1) / 0.45);
  };
  heroes.forEach((h) => add(h.f));
  for (let i = Math.floor((s - 3.2) * RATE); i <= Math.ceil(s * RATE); i++) add(fate(`r${i}`, rainX(i), rainT(i)));
  return clamp(e);
}

/** A falling streak of light with its head at y, fading towards its tail. */
function streak(x: number, y: number, a: number): void {
  const y0 = Math.max(TOP, y - 40);
  if (a <= 0.002 || y - y0 < 1) return;
  ctx.save();
  const g = ctx.createLinearGradient(x, y0, x, y);
  g.addColorStop(0, rgba(C.accent, 0));
  g.addColorStop(1, rgba(C.accent, a));
  ctx.strokeStyle = g;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
}

function rain(s: number, a: number): void {
  if (a <= 0.002) return;
  for (let i = Math.floor((s - 1.4) * RATE) - 1; i <= Math.ceil(s * RATE); i++) {
    const x = rainX(i), ts = rainT(i);
    if (s < ts) continue;
    const f = fate(`r${i}`, x, ts);
    if (s >= f.t1) {
      if (f.end === 'wall') glow(...onTube(s, f.u, f.w), 16, a * Math.exp(-(s - f.t1) / 0.25), C.accent2);
      continue;
    }
    const y = TOP + CP * (s - ts);
    streak(x, y, a * sstep(TOP, TOP + 40, y));
  }
}

/** The telescope tube, open at the top, eyepiece end at (x, Y), leaning by th. */
function tube(x: number, th: number, a: number, col: string = C.fg, w = 3): void {
  if (a <= 0.002) return;
  const ux = Math.sin(th), uy = -Math.cos(th), nx = Math.cos(th), ny = Math.sin(th);
  const p = (u: number, v: number): [number, number] => [x + ux * u + nx * v, Y + uy * u + ny * v];
  ink([p(L, -HW1), p(0, -HW0), p(0, HW0), p(L, HW1)], 1, col, w, a);
  const u1 = L * 0.62, h1 = hw(u1);
  ink([p(u1, -h1 - 7), p(u1, -h1)], 1, C.fg2, 2, a);
  ink([p(u1, h1), p(u1, h1 + 7)], 1, C.fg2, 2, a);
}

/** The cart under the tube: a post, a body, two wheels that turn as it rolls. */
function cart(x: number, a: number): void {
  if (a <= 0.002) return;
  rule(x, Y + 5, x, Y + 14, C.fg2, a, 3);
  ink([[x - 48, Y + 14], [x + 48, Y + 14], [x + 48, Y + 36], [x - 48, Y + 36], [x - 48, Y + 14]], 1, C.fg2, 2.5, a);
  const ang = (x - X0) / 10;
  for (const wx of [x - 28, x + 28]) {
    ink(circlePts(wx, Y + 46, 10, 28), 1, C.fg2, 2.5, a);
    rule(wx - Math.cos(ang) * 9, Y + 46 - Math.sin(ang) * 9, wx + Math.cos(ang) * 9, Y + 46 + Math.sin(ang) * 9, C.fg2, a * 0.8, 1.5);
  }
  dot(x, Y, 5, C.fg, a);
}

const SFX: Sfx[] = [[0.1, 'page'], [MISS, 'tick'], [CATCH, 'tone', { midi: 64 }], [6.0, 'tone', { midi: 67 }], [9.9, 'chime', { midi: 74 }]];

scene({
  name: 'bradley', kind: 'page', dur: bars(5), mb: 3, chapter: 3, ch: ['星光的倾斜', 'Tilted starlight'],
  subs: [
    [1, 7, '1728 年，布拉德利发现天龙座 γ 星一年里南北来回偏移约 40 角秒：地球在动，接星光的镜筒要稍稍前倾。', 'In 1728 Bradley found γ Draconis shifting about 40 arcseconds north and south over a year: the Earth moves, so the telescope must lean into the light.'],
    [7.5, 13.5, '由此推出：光速是地球公转速度的约 10 210 倍，阳光到地球约 8 分 12 秒。', 'So light is about 10 210 times faster than the Earth in its orbit, and sunlight reaches us in about 8 minutes 12 seconds.'],
  ],
  sfx: SFX,
  draw(lt) {
    background();
    statement('星光是斜着进来的', 'Starlight comes in at a slant', lt);
    const s = tau(lt);
    const a = sstep(0.5, 1.1, lt);
    const ad = a * (1 - sstep(9.3, 9.9, lt)); // the diagram, until the result
    const x = cartX(s), th = lean(s), v = vel(s);
    // the star overhead, and its light falling straight down (gone once the picture has stopped)
    glow(SX, SY, 70, ad, C.alt);
    rule(SX - 22, SY, SX + 22, SY, C.alt, ad * 0.6, 1.5);
    rule(SX, SY - 22, SX, SY + 22, C.alt, ad * 0.6, 1.5);
    dot(SX, SY, 4.5, C.fg, ad);
    text('天龙座 γ', SX - 46, SY + 10, { size: 28, color: C.fg, alpha: ad * sstep(1.0, 1.6, lt) * (1 - sstep(5.0, 5.4, lt)), align: 'right' });
    rain(s, ad * 0.65 * (1 - sstep(5.1, 5.8, lt)));
    // the Earth's motion: the rail, the cart, an arrow as long as the cart moves while light falls the tube's height
    rule(RX0 - 40, TRACK, RX1 + 40, TRACK, C.fg2, ad * 0.5, 2);
    glow(x, Y - 4, 46, ad * eyeLight(s), C.accent2);
    tube(x, th, ad * (1 - 0.55 * sstep(7.8, 8.3, lt)));
    cart(x, ad);
    const aa = ad * (1 - sstep(7.6, 8.1, lt));
    const k = Math.abs(v) / V, dir = Math.sign(v);
    if (k > 0.04) arrow(x - dir * 44 * k, TRACK + 32, x + dir * 44 * k, TRACK + 32, C.alt, aa, 3, 14 * Math.min(1, 2 * k));
    text('地球运动方向', x, TRACK + 72, { size: 26, color: C.fg2, alpha: aa * sstep(1.3, 1.9, lt), align: 'center' });
    // the packets that tell the story; a packet that strikes the wall leaves a flash on it
    for (const h of heroes) {
      if (s < h.ts) continue;
      const y = TOP + CP * (s - h.ts), span = h.f.y1 - TOP;
      pulse(h.x, TOP, h.x, h.f.y1, (y - TOP) / span, ad, C.accent2, 60 / span);
      if (h.f.end === 'wall' && s >= h.f.t1) glow(...onTube(s, h.f.u, h.f.w), 34, ad * Math.exp(-(s - h.f.t1) / 0.5), C.accent2);
    }
    // the picture stopped under the star: the two leans, half a year apart, and where each puts the star
    const am = ad * sstep(5.4, 5.9, lt) * (1 - sstep(7.6, 8.1, lt));
    const D = (Y - SY) * Math.tan(TH);
    tube(SX, TH, am * 0.4, C.fg2, 2.5);
    const kd = clamp((lt - 5.5) / 0.5);
    ink([[SX, Y], [SX + D, SY]], kd, C.fg2, 1.5, am, [8, 10]);
    ink([[SX, Y], [SX - D, SY]], kd, C.accent, 1.5, am, [8, 10]);
    const ar = am * sstep(5.8, 6.1, lt);
    ink(circlePts(SX - D, SY, 12, 32), 1, C.accent, 2.5, ar);
    ink(circlePts(SX + D, SY, 12, 32), 1, C.fg2, 2.5, ar);
    text('3 月', SX - D - 24, SY + 9, { size: 26, color: C.accent, alpha: ar, align: 'right' });
    text('9 月', SX + D + 24, SY + 9, { size: 26, color: C.fg2, alpha: ar, align: 'left' });
    const kw = eout(clamp((lt - 5.9) / 0.4)), aw = am * sstep(5.9, 6.1, lt);
    rule(SX - D, 302, SX - D, 322, C.fg2, aw, 1.5);
    rule(SX + D, 302, SX + D, 322, C.fg2, aw, 1.5);
    rule(SX - D * kw, 312, SX + D * kw, 312, C.fg2, aw, 1.5);
    text('约 40 角秒', SX, 290, { size: 32, color: C.accent, alpha: am * sstep(6.0, 6.4, lt), align: 'center' });
    text('图中角度已放大', 1060, 600, { size: 24, color: C.muted, alpha: ad * sstep(6.2, 6.7, lt), align: 'left' });
    // the triangle in the lean: in the same time, light falls the tall side and the Earth carries the tube the short one
    const tx = SX - L * Math.sin(TH), ty = Y - L * Math.cos(TH);
    const at = ad * sstep(7.8, 8.2, lt);
    ink([[SX, Y], [tx, ty]], 1, C.fg, 2.5, at);
    beam(tx, ty, tx, Y, clamp((lt - 7.8) / 0.6), at, C.accent, 3);
    beam(SX, Y, tx, Y, clamp((lt - 8.3) / 0.4), at, C.alt, 3.5);
    ink([[tx, Y - 14], [tx + 14, Y - 14], [tx + 14, Y]], 1, C.fg2, 1.5, at * sstep(8.5, 8.8, lt));
    text('光速', tx - 22, (ty + Y) / 2 + 10, { size: 30, color: C.accent, alpha: ad * sstep(8.1, 8.6, lt), align: 'right' });
    text('地球公转速度', tx - 22, Y + 10, { size: 28, color: C.alt, alpha: ad * sstep(8.5, 9.0, lt), align: 'right' });
    // the result
    bigNumber('10 210 : 1', SX, 560, 140, sstep(9.9, 10.5, lt), C.fg);
    text('光速与地球公转速度之比', SX, 636, { size: 34, color: C.fg2, alpha: sstep(10.1, 10.7, lt), align: 'center' });
    text('约 8 分 12 秒', SX, 756, { size: 64, weight: 500, color: C.accent, alpha: sstep(11.2, 11.8, lt), align: 'center' });
    text('阳光到地球', SX, 814, { size: 28, color: C.muted, alpha: sstep(11.5, 12.1, lt), align: 'center' });
    source('1728 · Phil. Trans. 35 · pp. 652-653', sstep(1.4, 2.0, lt));
  },
});
