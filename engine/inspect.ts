/**
 * Measurements of a rendered frame for scripts/validate.ts (export mode only). Everything is measured on the final
 * pixels, after the grade and the overlays, without motion blur.
 */
import { ctx, hideTexts, recordText, type TextBox } from './draw';
import { frame } from './frame';
import { W, H } from './util';

/** A text box with its measured contrast: text colour vs the background under it, as a WCAG ratio (1–21). */
export interface ContrastBox extends TextBox { ratio: number; text: [number, number, number]; bg: [number, number, number] }

/** WCAG 2 relative luminance of an sRGB colour (0–255 channels). */
function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** A canvas-normalised colour (#rrggbb or rgba(r, g, b, a)) as [r, g, b, a]. */
function parse(c: string): [number, number, number, number] {
  if (c.startsWith('#')) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
  const m = c.match(/^rgba?(([^)]+))$/);
  if (!m) return [NaN, NaN, NaN, NaN];
  const [r, g, b, al = '1'] = m[1].split(',').map((x) => x.trim());
  return [+r, +g, +b, +al];
}

/**
 * The frame at t rendered without any text, then with it (recording the text boxes). For each recorded box whose alpha
 * is at least `minAlpha`: the background is the mean colour of the box in the text-free render (after the grade, the
 * vignette, the overlays below it); the text colour is the colour the text was drawn with, composited at its alpha over
 * that background. Contrast is WCAG's (L_light + 0.05) / (L_dark + 0.05). The declared colour is used, not the rendered
 * glyph pixels, because anti-aliasing never fully covers a pixel with a thin stroke and would understate small text;
 * the grade's small change to text colour is ignored. A fill that is not a plain colour (a gradient) gives NaN.
 */
export function contrastAt(t: number, fps: number, minAlpha = 0.9): ContrastBox[] {
  hideTexts(true);
  frame(t, fps, 1);
  hideTexts(false);
  const A = ctx.getImageData(0, 0, W, H).data;
  recordText(true);
  frame(t, fps, 1);
  const boxes = recordText(false);
  const out: ContrastBox[] = [];
  for (const b of boxes) {
    if (!(b.alpha >= minAlpha)) continue;
    const x0 = Math.max(0, Math.floor(b.x0)), x1 = Math.min(W, Math.ceil(b.x1));
    const y0 = Math.max(0, Math.floor(b.y0)), y1 = Math.min(H, Math.ceil(b.y1));
    if (x1 <= x0 || y1 <= y0) continue;
    const bg = [0, 0, 0];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      bg[0] += A[i]; bg[1] += A[i + 1]; bg[2] += A[i + 2];
    }
    const n = (x1 - x0) * (y1 - y0);
    const bgc: [number, number, number] = [bg[0] / n, bg[1] / n, bg[2] / n];
    const [r, g, bl, ca] = parse(b.color);
    const k = Math.min(1, ca * b.alpha);
    const txc: [number, number, number] = [r * k + bgc[0] * (1 - k), g * k + bgc[1] * (1 - k), bl * k + bgc[2] * (1 - k)];
    const l1 = luminance(txc), l2 = luminance(bgc);
    out.push({ ...b, ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05), text: txc, bg: bgc });
  }
  return out;
}
