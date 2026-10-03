/**
 * "Paper and dawn": warm paper, ink lines, one rust accent, serif type; full-frame plates are a procedural dawn
 * horizon. No glows, no neon: everything reads as printed or photographed. The look of the information-theory film.
 */
import { ctx, text, rule, label } from '../../engine/draw';
import { glPlate } from '../../engine/gl';
import { C, F, M, type StylePackage, type SubLine } from '../../engine/style';
import { clamp, eout, mulberry, sstep, win, W, H } from '../../engine/util';
import { PLATE_FS } from './plate';

// ---- paper: a fixed fibre tile, then a soft edge fall-off
let FIBER: HTMLCanvasElement | null = null;
function fiber(): HTMLCanvasElement {
  if (FIBER) return FIBER;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const r = mulberry(4242);
  const img = g.createImageData(512, 512);
  for (let i = 0; i < 512 * 512; i++) {
    const v = 118 + Math.floor(r() * 20);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = r() < 0.55 ? 0 : 14;
  }
  g.putImageData(img, 0, 0);
  FIBER = c;
  return c;
}
function paper(tone = C.bg): void {
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.fillStyle = ctx.createPattern(fiber(), 'repeat')!;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, 'rgba(60,40,20,0)');
  g.addColorStop(1, 'rgba(60,40,20,.10)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

const paperDawn: StylePackage = {
  id: 'paper-dawn',
  palette: {
    bg: '#F3F1EA',
    bg2: '#E8E4D9',
    fg: '#1A1917',
    fg2: '#4A4640',
    muted: '#8F8A80',
    rule: '#C9C4B8',
    accent: '#C9663D',
    accent2: '#E58B5B',
    alt: '#5C7A99',
    alt2: '#7C8C68',
    fgOnDark: '#F3EDE0',
    mutedOnDark: '#D9CFBD',
  },
  // installed locally on the render machine (phase 1c moves to bundled OFL fonts)
  fonts: {
    body: '"Noto Serif SC", "华文中宋", "SimSun", serif',
    latin: '"Georgia", "Palatino Linotype", "Times New Roman", serif',
    math: '"Cambria Math", "Cambria", "Times New Roman", serif',
    mono: '"Consolas", "Cascadia Mono", monospace',
  },
  // pages: no halation, light grain; plates: a little sun halation and more grain
  grade: { bloom: 0, ca: 0.0005, vig: 0.22, grain: 0.05, sat: 0.98, split: 0.35, tintS: [0.97, 0.98, 1.03], tintH: [1.03, 1.0, 0.96] },
  plateGrade: { bloom: 0.22, ca: 0.0012, vig: 0.42, grain: 0.085, sat: 1.0 },
  fills: { page: '#F3F1EA', plate: '#0d0b09' },
  motion: { fadeIn: 0.6, fadeOut: 0.6, drift: 0.025 },
  layout: { margin: 150, column: 1000 },

  background: () => paper(),
  plate: (u) => glPlate(PLATE_FS, 3, { time: u.time, p: u.light, q: u.sun }),

  statement(zh, en, lt, t0 = 0.4, y = 300, size = 54) {
    const k = clamp((lt - t0) / 0.9);
    const a = eout(k);
    const rise = (1 - a) * 14;
    text(zh, M, y + rise, { size, weight: 500, color: C.fg, alpha: a, ls: 3 });
    text(en, M, y + 46 + rise, { font: F.latin, style: 'italic', size: 24, color: C.muted, alpha: sstep(t0 + 0.4, t0 + 1.2, lt) });
  },

  row(key, title, note, x, y, a, keyW = 96) {
    if (a <= 0.002) return;
    text(key, x, y, { font: F.latin, size: 24, color: C.accent, alpha: a, ls: 1 });
    text(title, x + keyW, y, { size: 26, weight: 500, color: C.fg, alpha: a });
    text(note, x + keyW, y + 32, { size: 20, color: C.muted, alpha: a });
  },

  /** Small-caps tracking label: "01 — 惊讶 · SURPRISE". */
  label(s, x, y, a, color, size, align) {
    text(s.toUpperCase(), x, y, { font: F.latin, size, ls: size * 0.28, color, alpha: a, align });
  },

  /** Fades go through a flat colour (paper or dark). */
  transition(amount, color) {
    ctx.fillStyle = color;
    ctx.globalAlpha = amount;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  },

  /** Top-left "01 — 惊讶 · SURPRISE" and bottom-right page number. */
  chapterLabel(lt, d, n, ch, chapters) {
    const a = win(lt, 0.2, d, 0.8, 0.5);
    if (a <= 0) return;
    const x = 150, y = 132;
    const num = String(n).padStart(2, '0');
    text(num, x, y, { font: F.latin, size: 26, color: C.accent, alpha: a, ls: 2 });
    rule(x + 52, y - 9, x + 52 + 40 * eout(clamp((lt - 0.3) / 0.8)), y - 9, C.accent, a, 1.5);
    text(ch[0], x + 108, y, { size: 26, weight: 600, color: C.fg, alpha: a, ls: 3 });
    label(ch[1], x + 108 + ctx.measureText(ch[0]).width + 60, y - 1, a, C.muted, 17);
    label(`${num} / ${String(chapters).padStart(2, '0')}`, W - 150, H - 96, a * 0.9, C.muted, 16, 'right');
  },

  captions(T: number, subs: SubLine[]) {
    for (const s of subs) {
      if (T < s.a - 0.6 || T > s.b + 0.6) continue;
      const a = win(T, s.a, s.b, 0.55, 0.55);
      if (a <= 0) continue;
      const rise = (1 - eout(clamp((T - s.a) / 0.7))) * 10;
      if (s.plate) {
        text(s.zh, W / 2, 900 + rise, { size: 38, weight: 500, color: C.fgOnDark, alpha: a, align: 'center', ls: 3 });
        text(s.en, W / 2, 950 + rise, { font: F.latin, style: 'italic', size: 24, color: C.mutedOnDark, alpha: a * 0.9, align: 'center' });
      } else {
        rule(150, 900, 150 + 36, 900, C.accent, a, 1.5);
        text(s.zh, 150, 950 + rise, { size: 34, weight: 500, color: C.fg, alpha: a, ls: 2 });
        text(s.en, 150, 990 + rise, { font: F.latin, style: 'italic', size: 23, color: C.muted, alpha: a });
      }
    }
  },
};

export default paperDawn;
