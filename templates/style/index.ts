/**
 * A new style package (from templates/style/ by `just new-style <id>`). Every member of StylePackage is here in its
 * plainest working form; the look is described in STYLE.md and built by replacing these bodies. A style owns how
 * things look, never what a film says: scenes only name roles (C.accent, F.latin, statement(), plate(), ...).
 * Rules a style must keep: fonts only from fonts/catalog.json (fonts.json lists them); every text it draws passes
 * `just validate` (inside the safe area, WCAG AA contrast, no overlaps); frame(t) stays a pure function of t.
 */
import { ctx, text, rule, label, measure, rgba } from '../../engine/draw';
import { glPlate } from '../../engine/gl';
import { C, F, M, type StylePackage, type SubLine } from '../../engine/style';
import { clamp, eout, sstep, win, W, H } from '../../engine/util';
import { PLATE_FS } from './shader';

function arrowPath(x: number, y: number, s: number): void {
  const p: [number, number][] = [[0, 0], [0, 17], [4.2, 13.2], [7, 19.5], [9.6, 18.4], [6.9, 12.2], [12.4, 12.2]];
  ctx.beginPath();
  p.forEach(([u, v], i) => (i ? ctx.lineTo(x + u * s, y + v * s) : ctx.moveTo(x + u * s, y + v * s)));
  ctx.closePath();
}

const style: StylePackage = {
  id: 'template-style',
  // semantic colours: page ground, ink, secondary text, rules, one accent (+ a lighter form), two quiet diagram colours,
  // and text colours for full-frame plates
  palette: {
    bg: '#F2F2F0',
    bg2: '#E4E4E0',
    fg: '#1C1C1E',
    fg2: '#44444A',
    muted: '#5E5E66',
    rule: '#C8C8CC',
    accent: '#2F5BD3',
    accent2: '#7C9BEA',
    alt: '#4E7A64',
    alt2: '#8A6A3A',
    fgOnDark: '#F4F4F6',
    mutedOnDark: '#D4D4DA',
  },
  // font chains: only families of fonts.json; a CJK body first where Chinese is drawn; the generic family is never reached
  fonts: {
    body: '"Noto Sans SC", "STIX Two Text", "STIX Two Math", sans-serif',
    latin: '"Inter", "STIX Two Text", "Noto Sans SC", "STIX Two Math", sans-serif',
    math: '"STIX Two Text", "Noto Sans SC", "STIX Two Math", serif',
    mono: '"JetBrains Mono", "STIX Two Text", "Noto Sans SC", "STIX Two Math", monospace',
  },
  grade: { bloom: 0, ca: 0, vig: 0.1, grain: 0.02, sat: 1, split: 0, tintS: [1, 1, 1], tintH: [1, 1, 1] },
  plateGrade: { bloom: 0.15, vig: 0.3, grain: 0.04 },
  fills: { page: '#F2F2F0', plate: '#0A0B0E' },
  motion: { fadeIn: 0.5, fadeOut: 0.5, drift: 0.02 },
  layout: { margin: 160, column: 1000 },

  background() {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
  },
  plate: (u) => glPlate(PLATE_FS, 1, { time: u.time, p: u.progress, q: u.highlight, tint: [0.35, 0.45, 0.8] }),

  statement(zh, en, lt, t0 = 0.4, y = 300, size = 54) {
    const a = eout(clamp((lt - t0) / 0.8));
    text(zh, M, y + (1 - a) * 12, { size, weight: 600, color: C.fg, alpha: a });
    text(en, M, y + 46, { font: F.latin, size: 24, color: C.muted, alpha: sstep(t0 + 0.4, t0 + 1.1, lt) });
  },

  row(key, title, note, x, y, a, keyW = 96) {
    if (a <= 0.002) return;
    text(key, x, y, { font: F.mono, size: 22, color: C.accent, alpha: a });
    text(title, x + keyW, y, { size: 26, weight: 600, color: C.fg, alpha: a });
    text(note, x + keyW, y + 32, { size: 20, color: C.muted, alpha: a });
  },

  label(s, x, y, a, color, size, align) {
    text(s.toUpperCase(), x, y, { font: F.latin, size, ls: size * 0.15, color, alpha: a, align });
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
    for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, rgba('#0A0B0E', 0.55 * a * Math.exp(-((i / 8) ** 2) * 4.5) * (1 - i / 8)));
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  },

  demo: {
    window(r, title, a) {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = C.bg2;
      ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
      ctx.restore();
      if (title) label(title, r.x, r.y - 14, a, C.muted, 15, 'left');
      return r;
    },
    cursor(x, y, press, a) {
      ctx.save();
      ctx.globalAlpha = a;
      arrowPath(x, y, 1.25 - 0.1 * press);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.restore();
    },
    ripple(x, y, k, a) {
      ctx.save();
      ctx.globalAlpha = a * (1 - k);
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 8 + 30 * eout(k), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },
  },

  chapterLabel(lt, d, n, ch, chapters) {
    const a = win(lt, 0.2, d, 0.8, 0.5);
    if (a <= 0) return;
    const num = String(n).padStart(2, '0');
    text(num, M, 132, { font: F.mono, size: 22, color: C.accent, alpha: a });
    text(ch[0], M + 56, 132, { size: 24, weight: 600, color: C.fg, alpha: a });
    label(ch[1], M + 56 + measure(ch[0], 24, F.body, 600) + 24, 131, a, C.muted, 16, 'left');
    label(`${num} / ${String(chapters).padStart(2, '0')}`, W - M, H - 96, a, C.muted, 16, 'right');
    rule(M, 150, M + 40, 150, C.accent, a, 2);
  },

  captions(T: number, subs: SubLine[]) {
    for (const s of subs) {
      const a = win(T, s.a, s.b, 0.5, 0.5);
      if (a <= 0) continue;
      text(s.zh, W / 2, 950, { size: 32, weight: 500, color: s.plate ? C.fgOnDark : C.fg, alpha: a, align: 'center' });
      text(s.en, W / 2, 990, { font: F.latin, size: 21, color: s.plate ? C.mutedOnDark : C.muted, alpha: a, align: 'center' });
    }
  },
};

export default style;
