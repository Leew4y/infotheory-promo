/**
 * "Keynote": a light product launch film. Everything sits on the product UI's own page grey (#F5F5F7); full-frame
 * plates are the same grey lit from above by a pale cyan-to-blue glow (the product logo's gradient, softened). Near-black
 * bold sans type, one accent (the logo's blue), no paper, no grain, no serif. Captures sit in white rounded windows
 * with a soft shadow, like a product shot. One type scale for the whole film (STYLE.md).
 */
import { ctx, text, rgba } from '../../engine/draw';
import { glPlate } from '../../engine/gl';
import { C, F, M, type StylePackage, type SubLine } from '../../engine/style';
import { clamp, eout, portrait, sstep, win, W, H, SCALE } from '../../engine/util';
import { PLATE_FS } from './shader';

const PAL = {
  bg: '#F5F5F7',
  bg2: '#E8E8ED',
  fg: '#1D1D1F',
  fg2: '#3A3A3C',
  muted: '#5E5E63',
  rule: '#D2D2D7',
  accent: '#1F5BE0',
  accent2: '#20C9B5',
  alt: '#248A3D',
  alt2: '#B25000',
  // plates are light in this style: "on dark" text is the same ink as on pages
  fgOnDark: '#1D1D1F',
  mutedOnDark: '#5E5E63',
};

function arrowPath(x: number, y: number, s: number): void {
  const p: [number, number][] = [[0, 0], [0, 17], [4.2, 13.2], [7, 19.5], [9.6, 18.4], [6.9, 12.2], [12.4, 12.2]];
  ctx.beginPath();
  p.forEach(([u, v], i) => (i ? ctx.lineTo(x + u * s, y + v * s) : ctx.moveTo(x + u * s, y + v * s)));
  ctx.closePath();
}

function roundRect(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const keynote: StylePackage = {
  id: 'keynote',
  palette: PAL,
  fonts: {
    body: '"Noto Sans SC", "Inter", "STIX Two Math", sans-serif',
    latin: '"Inter", "Noto Sans SC", "STIX Two Math", sans-serif',
    math: '"STIX Two Text", "Noto Sans SC", "STIX Two Math", serif',
    mono: '"JetBrains Mono", "Noto Sans SC", "STIX Two Math", monospace',
  },
  grade: { bloom: 0, ca: 0, vig: 0, grain: 0, sat: 1, split: 0, tintS: [1, 1, 1], tintH: [1, 1, 1] },
  plateGrade: { bloom: 0, vig: 0, grain: 0 },
  fills: { page: PAL.bg, plate: PAL.bg },
  motion: { fadeIn: 0.45, fadeOut: 0.45, drift: 0.012 },
  // portrait: a film of size [1080, 1920] (phones); one column, so `column` is the margin
  layout: { margin: 150, column: 1000, portrait: { margin: 90, column: 90 } },

  background() {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
  },
  plate: (u) => glPlate(PLATE_FS, 1, { time: u.time, p: u.progress, q: u.highlight, tint: [0.86, 0.84, 0.99] }),

  statement(zh, en, lt, t0 = 0.4, y = 300, size = 60) {
    const a = eout(clamp((lt - t0) / 0.7));
    text(zh, M, y + (1 - a) * 16, { size, weight: 700, color: C.fg, alpha: a });
    if (en) text(en, M, y + 50, { font: F.latin, size: 24, weight: 500, color: C.muted, alpha: sstep(t0 + 0.3, t0 + 1.0, lt) });
  },

  row(key, title, note, x, y, a, keyW = 96) {
    if (a <= 0.002) return;
    text(key, x, y, { font: F.latin, size: 24, weight: 600, color: C.accent, alpha: a });
    text(title, x + keyW, y, { size: 28, weight: 600, color: C.fg, alpha: a });
    text(note, x + keyW, y + 36, { size: 22, color: C.muted, alpha: a });
  },

  label(s, x, y, a, color, size, align) {
    text(s.toUpperCase(), x, y, { font: F.latin, size, weight: 600, ls: size * 0.08, color, alpha: a, align });
  },

  transition(amount, color) {
    ctx.fillStyle = color;
    ctx.globalAlpha = amount;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  },

  backdrop(cx, cy, w, h, a) {
    if (a <= 0.002) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(w, h);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, rgba('#FFFFFF', 0.55 * a * Math.exp(-((i / 8) ** 2) * 4.5) * (1 - i / 8)));
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  },

  /** Captures as a product shot: a white window with rounded corners, a soft deep shadow and three quiet dots. */
  demo: {
    get area() { return portrait() ? { x: M, y: 330, w: W - 2 * M, h: Math.round(H * 0.7) - 90 - 330 } : { x: 150, y: 176, w: W - 300, h: H - 400 }; },
    rippleDur: 0.6,
    pressDur: 0.15,
    cursorEase: (u) => u * u * (3 - 2 * u),
    window(r, title, a) {
      const bar = 36, rad = 18;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = 'rgba(20,20,40,0.22)';
      // canvas shadows are in pixels whatever the transform: scaled to stay in frame units at any --res
      ctx.shadowBlur = 60 * SCALE;
      ctx.shadowOffsetY = 24 * SCALE;
      roundRect(r.x, r.y - bar, r.w, r.h + bar, rad);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = a;
      ['#D2D2D7', '#D2D2D7', '#D2D2D7'].forEach((c, i) => {
        ctx.beginPath();
        ctx.arc(r.x + 22 + i * 20, r.y - bar / 2, 6, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
      });
      ctx.restore();
      if (title) text(title, r.x + r.w / 2, r.y - bar / 2 + 6, { size: 16, weight: 500, color: C.muted, alpha: a, align: 'center' });
      return r;
    },
    cursor(x, y, press, a) {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 6 * SCALE;
      ctx.shadowOffsetY = 2 * SCALE;
      arrowPath(x, y, 1.35 - 0.12 * press);
      ctx.fillStyle = '#000000';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
      ctx.restore();
    },
    ripple(x, y, k, a) {
      ctx.save();
      ctx.globalAlpha = a * (1 - k) * 0.5;
      ctx.fillStyle = C.accent;
      ctx.beginPath();
      ctx.arc(x, y, 6 + 26 * eout(k), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  },

  /** A small accent chapter number and the chapter name in bold, top left, with a short accent rule under them. */
  chapterLabel(lt, d, n, ch) {
    const a = win(lt, 0.2, d, 0.6, 0.4);
    if (a <= 0) return;
    // portrait: lower (below a phone app's top bar) and larger
    const y = portrait() ? 230 : 122, k = portrait() ? 1.3 : 1;
    text(String(n).padStart(2, '0'), M, y, { font: F.latin, size: Math.round(24 * k), weight: 700, color: C.accent, alpha: a });
    text(ch[0], M + 46 * k, y, { size: Math.round(26 * k), weight: 700, color: C.fg, alpha: a });
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = C.accent;
    ctx.fillRect(M, y + 18 * k, 32, 3);
    ctx.restore();
  },

  /** Captions centred near the bottom, medium weight; on plates in light type. */
  captions(T: number, subs: SubLine[]) {
    for (const s of subs) {
      const a = win(T, s.a, s.b, 0.35, 0.35);
      if (a <= 0) continue;
      const rise = (1 - eout(clamp((T - s.a) / 0.35))) * 6;
      // portrait: above the bottom quarter, where phone apps put their own text and buttons, and larger
      const y = portrait() ? Math.round(H * 0.7) : 968, k = portrait() ? 1.3 : 1;
      // portrait: centred left of the middle, clear of the phone app's buttons on the right
      const x = portrait() ? Math.round(W * 0.455) : W / 2;
      text(s.zh, x, y + rise, { size: Math.round(36 * k), weight: 500, color: C.fg, alpha: a, align: 'center' });
      if (s.en) text(s.en, x, y + 42 * k, { font: F.latin, size: Math.round(20 * k), color: C.muted, alpha: a, align: 'center' });
    }
  },
};

export default keynote;
