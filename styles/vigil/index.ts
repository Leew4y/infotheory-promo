/**
 * "夜祷 · Vigil", the look of math-lessons (chosen from three directions on 2026-10-09). A nave at night: warm
 * near-black ground lit as if by one candle, parchment-white serif type, one candle-gold accent, crimson and cobalt
 * glass as the diagram colours; full-frame plates are a rose window whose panes fill with light as the film goes on.
 * Captions are Chinese only; for the film that uses it, a caption's second slot carries a verse mark (a number, "◇",
 * or empty), drawn as a small mark in the caption's left margin.
 */
import { ctx, text, rule, label, measure, rgba } from '../../engine/draw';
import { glPlate } from '../../engine/gl';
import { C, F, M, type StylePackage, type SubLine } from '../../engine/style';
import { clamp, eout, win, W, H } from '../../engine/util';
import { PLATE_FS } from './shader';

/** A caption's verse mark: a number in gold mono, or a small outlined diamond for claims. */
function mark(m: string, x: number, y: number, a: number, size: number): void {
  if (!m || a <= 0.002) return;
  if (m !== '◇') return text(m, x, y, { font: F.mono, size: size * 0.62, color: C.accent, alpha: a, align: 'center' });
  const r = size * 0.3, cy = y - size * 0.36;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = C.muted;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, cy - r);
  ctx.lineTo(x + r, cy);
  ctx.lineTo(x, cy + r);
  ctx.lineTo(x - r, cy);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

const style: StylePackage = {
  id: 'vigil',
  palette: {
    bg: '#0F0C0A',
    bg2: '#1C1713',
    fg: '#EFE6D6',
    fg2: '#CDBEA6',
    muted: '#A89679',
    rule: '#3B3128',
    accent: '#E2B35E',
    accent2: '#F2D59E',
    alt: '#C0504A',
    alt2: '#5B7BC0',
    fgOnDark: '#F5EEE2',
    mutedOnDark: '#CFC0A8',
  },
  fonts: {
    body: '"ZCOOL XiaoWei", "Noto Serif SC", "STIX Two Text", "STIX Two Math", serif',
    latin: '"Instrument Serif", "STIX Two Text", "Noto Serif SC", "STIX Two Math", serif',
    math: '"STIX Two Text", "Noto Serif SC", "STIX Two Math", serif',
    mono: '"IBM Plex Mono", "STIX Two Text", "Noto Serif SC", "STIX Two Math", monospace',
  },
  grade: { bloom: 0.18, ca: 0.0006, vig: 0.38, grain: 0.035, sat: 1.0, split: 0.25, tintS: [0.98, 0.98, 1.03], tintH: [1.04, 1.0, 0.94] },
  plateGrade: { bloom: 0.4, vig: 0.5, grain: 0.05 },
  fills: { page: '#0F0C0A', plate: '#070504' },
  motion: { fadeIn: 0.8, fadeOut: 0.8, drift: 0.012 },
  layout: { margin: 170, column: 1010 },

  /** Warm black, one candle's glow from the upper left. */
  background() {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * 0.22, H * 0.18, 0, W * 0.22, H * 0.18, H * 1.1);
    g.addColorStop(0, 'rgba(226,179,94,0.075)');
    g.addColorStop(0.5, 'rgba(226,179,94,0.02)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  },
  // progress: the panes fill with light; highlight: the flame at the window's centre
  plate: (u) => glPlate(PLATE_FS, 1, { time: u.time, p: u.progress, q: u.highlight }),

  statement(zh, _en, lt, t0 = 0.4, y = 300, size = 56) {
    const a = eout(clamp((lt - t0) / 1.0));
    text(zh, M, y + (1 - a) * 10, { size, color: C.fg, alpha: a, ls: 4 });
  },

  row(key, title, note, x, y, a, keyW = 120) {
    if (a <= 0.002) return;
    text(key, x, y, { font: F.mono, size: 22, color: C.accent, alpha: a });
    text(title, x + keyW, y, { size: 28, color: C.fg, alpha: a, ls: 2 });
    text(note, x + keyW, y + 36, { size: 21, color: C.muted, alpha: a, ls: 1 });
  },

  label(s, x, y, a, color, size, align) {
    text(s, x, y, { font: F.latin, size: size * 1.1, ls: size * 0.12, color, alpha: a, align });
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
    for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, rgba('#070504', 0.72 * a * Math.exp(-((i / 8) ** 2) * 4) * (1 - i / 8)));
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  },

  /** Chinese chapter title top left under a short gold rule; page count bottom right. */
  chapterLabel(lt, d, n, ch, chapters) {
    const a = win(lt, 0.3, d, 1.0, 0.6);
    if (a <= 0) return;
    const nums = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    rule(M, 104, M + 34, 104, C.accent, a, 1.5);
    text(`${nums[n] ?? n}　${ch[0]}`, M, 142, { size: 26, color: C.fg2, alpha: a, ls: 6 });
    label(`${n} / ${chapters}`, W - M, H - 92, a, C.muted, 17, 'right');
  },

  captions(T: number, subs: SubLine[]) {
    for (const s of subs) {
      const a = win(T, s.a, s.b, 0.18, 0.18);
      if (a <= 0) continue;
      const size = 34, y = 968;
      const w = measure(s.zh, size, F.body, 400, 3);
      text(s.zh, W / 2, y, { size, color: s.plate ? C.fgOnDark : C.fg, alpha: a, align: 'center', ls: 3 });
      mark(s.en, W / 2 - w / 2 - 36, y, a, size);
    }
  },
};

export default style;
