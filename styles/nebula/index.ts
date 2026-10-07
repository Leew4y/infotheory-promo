/**
 * "Nebula": a dark instrument panel under a night sky. Near-black blue ground with a fixed dot grid, light sans-serif
 * type, one cyan accent and an amber second voice, lines that glow a little; full-frame plates are a drifting nebula.
 * Fades close in from the edges like an iris; chapter labels and the page count sit top right in mono; captions are
 * centred on a translucent band. The counterpart of paper-dawn for the style-decoupling acceptance.
 */
import { ctx, text, rule, label, measure } from '../../engine/draw';
import { glPlate } from '../../engine/gl';
import { C, F, M, type StylePackage, type SubLine } from '../../engine/style';
import { clamp, eout, sstep, win, W, H } from '../../engine/util';
import { NEBULA_FS } from './shader';

const GAS: [number, number, number] = [0.30, 0.62, 0.86];

// the iris is drawn as an alpha mask, then filled with the fade colour (any CSS colour, its own alpha kept)
let MASK: HTMLCanvasElement | null = null;
function mask(): CanvasRenderingContext2D {
  if (!MASK) {
    MASK = document.createElement('canvas');
    MASK.width = W;
    MASK.height = H;
  }
  return MASK.getContext('2d')!;
}

const nebula: StylePackage = {
  id: 'nebula',
  palette: {
    bg: '#0B0F1A',
    bg2: '#141B2D',
    fg: '#E6EEF7',
    fg2: '#A9B8CC',
    muted: '#7586A0',
    rule: '#2C3854',
    accent: '#5FD4E8',
    accent2: '#A3EAF5',
    alt: '#F2B45A',
    alt2: '#B49AF0',
    fgOnDark: '#EEF4FA',
    mutedOnDark: '#A3B3C9',
  },
  // Bundled OFL fonts (fonts.lock.json; subsets from `just fonts --style nebula`); chains list only bundled families.
  fonts: {
    body: '"Noto Sans SC", "STIX Two Text", "STIX Two Math", sans-serif',
    latin: '"Inter", "STIX Two Text", "Noto Sans SC", "STIX Two Math", sans-serif',
    math: '"STIX Two Text", "Noto Sans SC", "STIX Two Math", serif',
    mono: '"JetBrains Mono", "STIX Two Text", "Noto Sans SC", "STIX Two Math", monospace',
  },
  // pages: a little halation so lines glow, cool shadows; plates: more bloom and vignette
  grade: { bloom: 0.28, ca: 0.0009, vig: 0.34, grain: 0.03, sat: 1.04, split: 0.3, tintS: [0.95, 1.0, 1.08], tintH: [1.03, 1.0, 0.96] },
  plateGrade: { bloom: 0.42, ca: 0.0014, vig: 0.5, grain: 0.05, sat: 1.06 },
  fills: { page: '#0B0F1A', plate: '#03050A' },
  motion: { fadeIn: 0.45, fadeOut: 0.45, drift: 0.015 },
  layout: { margin: 170, column: 1010 },

  background: () => glPlate(NEBULA_FS, 1, { time: 0, tint: GAS }),
  // progress brightens and thickens the gas, highlight lights a star
  plate: (u) => glPlate(NEBULA_FS, 2, { time: u.time, p: u.progress, q: u.highlight, tint: GAS }),

  /** Slides in from the left behind a short cyan bar; the English line in small mono capitals. */
  statement(zh, en, lt, t0 = 0.4, y = 300, size = 54) {
    const k = clamp((lt - t0) / 0.7);
    const a = eout(k);
    const dx = (1 - a) * -18;
    rule(M - 26, y - size * 0.78, M - 26, y - size * 0.78 + (size * 0.82) * a, C.accent, a, 3);
    text(zh, M + dx, y, { size: size * 0.96, weight: 600, color: C.fg, alpha: a, ls: 1 });
    text(en.toUpperCase(), M, y + 44, { font: F.mono, size: 17, color: C.accent, alpha: sstep(t0 + 0.35, t0 + 1.0, lt) * 0.9, ls: 2 });
  },

  row(key, title, note, x, y, a, keyW = 96) {
    if (a <= 0.002) return;
    text(key, x, y, { font: F.mono, size: 22, color: C.accent, alpha: a });
    text(title, x + keyW, y, { size: 25, weight: 600, color: C.fg, alpha: a });
    text(note, x + keyW, y + 32, { size: 19, color: C.muted, alpha: a });
  },

  /** Small mono capitals, light tracking. */
  label(s, x, y, a, color, size, align) {
    text(s.toUpperCase(), x, y, { font: F.mono, size: size * 0.92, ls: size * 0.1, color, alpha: a, align });
  },

  /**
   * An iris: the fade colour closes in from the edges. Continuous at both ends: at amount -> 0 the soft edge starts
   * beyond the corners (nothing covered), at amount 1 the inside is opaque too. `color` may be any CSS colour.
   */
  transition(amount, color) {
    const R = Math.hypot(W, H) / 2;
    const ri = (1 - amount) * 1.2 * R;
    const m = mask();
    m.globalCompositeOperation = 'copy';
    const g = m.createRadialGradient(W / 2, H / 2, ri, W / 2, H / 2, ri + 0.45 * R);
    g.addColorStop(0, `rgba(0,0,0,${amount * amount})`);
    g.addColorStop(1, 'rgba(0,0,0,1)');
    m.fillStyle = g;
    m.fillRect(0, 0, W, H);
    m.globalCompositeOperation = 'source-in';
    m.fillStyle = color;
    m.fillRect(0, 0, W, H);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(MASK!, 0, 0);
    ctx.restore();
  },

  /** Top right: "CH 01 / 08" in mono, the chapter title under it, a thin progress rule across the top. */
  chapterLabel(lt, d, n, ch, chapters) {
    const a = win(lt, 0.2, d, 0.8, 0.5);
    if (a <= 0) return;
    const x = W - M, y = 128;
    const num = `CH ${String(n).padStart(2, '0')} / ${String(chapters).padStart(2, '0')}`;
    text(num, x, y, { font: F.mono, size: 17, color: C.accent, alpha: a, align: 'right', ls: 2 });
    text(ch[0], x, y + 40, { size: 26, weight: 600, color: C.fg, alpha: a, align: 'right', ls: 2 });
    label(ch[1], x - measure(ch[0], 26, F.body, 600, 2) - 22, y + 39, a, C.muted, 16, 'right');
    const k = eout(clamp((lt - 0.3) / 1.2));
    rule(M, 84, W - M, 84, C.rule, a * 0.8, 1);
    rule(M, 84, M + (W - 2 * M) * (n / chapters) * k, 84, C.accent, a, 2);
  },

  captions(T: number, subs: SubLine[]) {
    for (const s of subs) {
      if (T < s.a - 0.6 || T > s.b + 0.6) continue;
      const a = win(T, s.a, s.b, 0.45, 0.45);
      if (a <= 0) continue;
      const y = 962 + (1 - eout(clamp((T - s.a) / 0.5))) * 6;
      const w = Math.max(measure(s.zh, 32, F.body, 500, 1), measure(s.en, 20, F.latin, 400, 0)) + 72;
      ctx.save();
      ctx.globalAlpha = a * (s.plate ? 0.45 : 0.72);
      ctx.fillStyle = C.bg2;
      ctx.beginPath();
      ctx.roundRect(W / 2 - w / 2, y - 52, w, 98, 14);
      ctx.fill();
      ctx.restore();
      text(s.zh, W / 2, y - 8, { size: 32, weight: 500, color: s.plate ? C.fgOnDark : C.fg, alpha: a, align: 'center', ls: 1 });
      text(s.en, W / 2, y + 28, { font: F.latin, size: 20, color: s.plate ? C.mutedOnDark : C.fg2, alpha: a * 0.9, align: 'center' });
    }
  },
};

export default nebula;
