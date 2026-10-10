/**
 * Direction C, "宣言 · Manifesto" (rough sample for choosing a direction; not yet reviewed). A typographic manifesto:
 * flat white ground, a heavy black bar along the top, black grotesque type set large, one signal red; no gradients
 * on pages. Full-frame plates are black with two interfering systems of concentric rings (moiré) that tighten as the
 * film goes on; the highlight is a red disc. Cuts are hard and short.
 * Captions are Chinese only; for the film that uses it, a caption's second slot carries a verse mark (a number, "◇",
 * or empty), drawn large in red in the caption's left margin, like an article number.
 */
import { ctx, text, measure, rgba } from '../../engine/draw';
import { glPlate } from '../../engine/gl';
import { C, F, M, type StylePackage, type SubLine } from '../../engine/style';
import { clamp, win, W, H } from '../../engine/util';
import { PLATE_FS } from './shader';

/** A caption's verse mark: a bold red number, or a solid black diamond for claims. */
function mark(m: string, x: number, y: number, a: number, size: number): void {
  if (!m || a <= 0.002) return;
  if (m !== '◇') return text(m, x, y, { font: F.latin, size: size * 0.9, weight: 700, color: C.accent, alpha: a, align: 'center' });
  const r = size * 0.24, cy = y - size * 0.36;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = C.fg;
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
  id: 'math-lessons-c',
  palette: {
    bg: '#FFFFFF',
    bg2: '#ECECEC',
    fg: '#0B0B0B',
    fg2: '#2A2A2A',
    muted: '#555555',
    rule: '#0B0B0B',
    accent: '#D0231B',
    accent2: '#F2665A',
    alt: '#1E3EB8',
    alt2: '#7A7A7A',
    fgOnDark: '#FFFFFF',
    mutedOnDark: '#D2D2D2',
  },
  fonts: {
    body: '"Noto Sans SC", "Space Grotesk", "STIX Two Text", "STIX Two Math", sans-serif',
    latin: '"Space Grotesk", "Noto Sans SC", "STIX Two Text", "STIX Two Math", sans-serif',
    math: '"STIX Two Text", "Noto Sans SC", "STIX Two Math", serif',
    mono: '"Space Mono", "STIX Two Text", "Noto Sans SC", "STIX Two Math", monospace',
  },
  grade: { bloom: 0, ca: 0, vig: 0, grain: 0.012, sat: 1.0, split: 0, tintS: [1, 1, 1], tintH: [1, 1, 1] },
  plateGrade: { bloom: 0.05, vig: 0.15, grain: 0.03 },
  fills: { page: '#FFFFFF', plate: '#000000' },
  motion: { fadeIn: 0.15, fadeOut: 0.15, drift: 0 },
  layout: { margin: 150, column: 980 },

  /** Flat white, a heavy black bar along the top edge. */
  background() {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.fg;
    ctx.fillRect(0, 0, W, 22);
  },
  // progress: the two ring systems tighten and sharpen; highlight: a red disc
  plate: (u) => glPlate(PLATE_FS, 1, { time: u.time, p: u.progress, q: u.highlight }),

  statement(zh, _en, lt, t0 = 0.4, y = 300, size = 72) {
    if (lt < t0) return;
    text(zh, M, y, { size, weight: 900, color: C.fg, ls: -1 });
  },

  row(key, title, note, x, y, a, keyW = 110) {
    if (a <= 0.002) return;
    text(key, x, y, { font: F.latin, size: 30, weight: 700, color: C.accent, alpha: a });
    text(title, x + keyW, y, { size: 30, weight: 800, color: C.fg, alpha: a });
    text(note, x + keyW, y + 38, { size: 21, weight: 500, color: C.muted, alpha: a });
  },

  label(s, x, y, a, color, size, align) {
    text(s.toUpperCase(), x, y, { font: F.mono, size, weight: 400, ls: size * 0.05, color, alpha: a, align });
  },

  transition(amount, color) {
    ctx.fillStyle = color;
    ctx.globalAlpha = amount;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  },

  /** A flat black slab behind plate text (no soft edges in this direction). */
  backdrop(cx, cy, w, h, a) {
    if (a <= 0.002) return;
    ctx.fillStyle = rgba('#000000', 0.82 * a);
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  },

  /** A big red chapter number and the Chinese title in heavy black, top left; page count in mono. */
  chapterLabel(lt, d, n, ch, chapters) {
    const a = win(lt, 0.0, d, 0.15, 0.15);
    if (a <= 0) return;
    text(String(n).padStart(2, '0'), M, 150, { font: F.latin, size: 64, weight: 700, color: C.accent, alpha: a });
    text(ch[0], M + 110, 146, { size: 34, weight: 900, color: C.fg, alpha: a });
    text(`${String(n).padStart(2, '0')}/${String(chapters).padStart(2, '0')}`, W - M, H - 92, { font: F.mono, size: 18, color: C.muted, alpha: a, align: 'right' });
  },

  captions(T: number, subs: SubLine[]) {
    for (const s of subs) {
      const a = win(T, s.a, s.b, 0.06, 0.06);
      if (a <= 0) continue;
      const size = 34, y = 975;
      const w = measure(s.zh, size, F.body, 700);
      text(s.zh, W / 2, y, { size, weight: 700, color: s.plate ? C.fgOnDark : C.fg, alpha: a, align: 'center' });
      mark(s.en, W / 2 - w / 2 - 44, y, a, size);
    }
  },
};

export default style;
