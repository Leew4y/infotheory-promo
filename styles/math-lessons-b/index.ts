/**
 * Direction B, "静室 · Chapel" (rough sample for choosing a direction; not yet reviewed). A secular chapel of colour:
 * plum-black ground with two soft-edged darker fields, as in a colour-field painting; light, widely tracked sans-serif
 * type; one ember accent. Full-frame plates are stacked soft fields that brighten from near-black to deep red as the
 * film goes on; the highlight is a luminous seam between them. Silence is the ornament: no rules, no grid.
 * Captions are Chinese only; for the film that uses it, a caption's second slot carries a verse mark (a number, "◇",
 * or empty), drawn as a small mark in the caption's left margin.
 */
import { ctx, text, label, measure, rgba } from '../../engine/draw';
import { glPlate } from '../../engine/gl';
import { C, F, M, type StylePackage, type SubLine } from '../../engine/style';
import { clamp, eout, win, W, H } from '../../engine/util';
import { PLATE_FS } from './shader';

let GROUND: HTMLCanvasElement | null = null;
/** The page ground, painted once: the plum field and two soft darker fields (static, so it is cached). */
function ground(): HTMLCanvasElement {
  if (GROUND) return GROUND;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  g.filter = 'blur(60px)';
  g.fillStyle = 'rgba(8,4,8,0.55)';
  g.fillRect(W * 0.07, H * 0.1, W * 0.86, H * 0.38);
  g.fillStyle = 'rgba(60,24,40,0.35)';
  g.fillRect(W * 0.07, H * 0.56, W * 0.86, H * 0.32);
  g.filter = 'none';
  GROUND = c;
  return c;
}

/** A caption's verse mark: a number in ember mono, or a small filled diamond for claims. */
function mark(m: string, x: number, y: number, a: number, size: number): void {
  if (!m || a <= 0.002) return;
  if (m !== '◇') return text(m, x, y, { font: F.mono, size: size * 0.6, color: C.accent, alpha: a, align: 'center' });
  const r = size * 0.2, cy = y - size * 0.34;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = C.muted;
  ctx.beginPath();
  ctx.moveTo(x, cy - r);
  ctx.lineTo(x + r, cy);
  ctx.lineTo(x, cy + r);
  ctx.lineTo(x - r, cy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const style: StylePackage = {
  id: 'math-lessons-b',
  palette: {
    bg: '#1E1219',
    bg2: '#2C1B25',
    fg: '#F3E9EE',
    fg2: '#D3C0CA',
    muted: '#B9A1AE',
    rule: '#4C3543',
    accent: '#EE8A6B',
    accent2: '#F6BBA6',
    alt: '#9A7BB0',
    alt2: '#B08A68',
    fgOnDark: '#F7EEF2',
    mutedOnDark: '#DBC8D2',
  },
  fonts: {
    body: '"Noto Sans SC", "Manrope", "STIX Two Text", "STIX Two Math", sans-serif',
    latin: '"Manrope", "Noto Sans SC", "STIX Two Text", "STIX Two Math", sans-serif',
    math: '"STIX Two Text", "Noto Sans SC", "STIX Two Math", serif',
    mono: '"IBM Plex Mono", "STIX Two Text", "Noto Sans SC", "STIX Two Math", monospace',
  },
  grade: { bloom: 0.1, ca: 0, vig: 0.3, grain: 0.03, sat: 1.0, split: 0.15, tintS: [1.0, 0.97, 1.03], tintH: [1.03, 1.0, 0.97] },
  plateGrade: { bloom: 0.25, vig: 0.4, grain: 0.04 },
  fills: { page: '#1E1219', plate: '#0A0508' },
  motion: { fadeIn: 1.0, fadeOut: 1.0, drift: 0.006 },
  layout: { margin: 190, column: 1020 },

  background() {
    ctx.drawImage(ground(), 0, 0);
  },
  // progress: the fields brighten and warm (near-black -> deep red); highlight: a luminous seam between them
  plate: (u) => glPlate(PLATE_FS, 1, { time: u.time, p: u.progress, q: u.highlight }),

  statement(zh, _en, lt, t0 = 0.4, y = 300, size = 50) {
    const a = eout(clamp((lt - t0) / 1.2));
    text(zh, M, y, { size, weight: 300, color: C.fg, alpha: a, ls: 8 });
  },

  row(key, title, note, x, y, a, keyW = 120) {
    if (a <= 0.002) return;
    text(key, x, y, { font: F.mono, size: 20, color: C.accent, alpha: a });
    text(title, x + keyW, y, { size: 26, weight: 300, color: C.fg, alpha: a, ls: 4 });
    text(note, x + keyW, y + 36, { size: 20, weight: 300, color: C.muted, alpha: a, ls: 2 });
  },

  label(s, x, y, a, color, size, align) {
    text(s.toUpperCase(), x, y, { font: F.latin, size, weight: 400, ls: size * 0.3, color, alpha: a, align });
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
    for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, rgba('#0A0508', 0.6 * a * Math.exp(-((i / 8) ** 2) * 4) * (1 - i / 8)));
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  },

  /** Only the chapter's Chinese title, small and widely tracked, top left; no page count. */
  chapterLabel(lt, d, n, ch) {
    const a = win(lt, 0.4, d, 1.2, 0.8);
    if (a <= 0) return;
    text(`${n}`, M, 140, { font: F.mono, size: 20, color: C.accent, alpha: a });
    text(ch[0], M + 44, 140, { size: 22, weight: 300, color: C.fg2, alpha: a, ls: 10 });
  },

  captions(T: number, subs: SubLine[]) {
    for (const s of subs) {
      const a = win(T, s.a, s.b, 0.22, 0.22);
      if (a <= 0) continue;
      const size = 32, y = 972;
      const w = measure(s.zh, size, F.body, 300, 4);
      text(s.zh, W / 2, y, { size, weight: 300, color: s.plate ? C.fgOnDark : C.fg, alpha: a, align: 'center', ls: 4 });
      mark(s.en, W / 2 - w / 2 - 34, y, a, size);
    }
  },
};

export default style;
