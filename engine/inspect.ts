/**
 * Measurements of rendered frames for scripts/validate.ts (export mode only), taken on the final pixels: after the
 * grade, the overlays drawn over it, and the export's motion blur.
 */
import { ctx, recordText, textMode, type TextBox } from './draw';
import { frame } from './frame';
import { W, H } from './util';

/**
 * A text box with its measured contrast: the lowest WCAG ratio (1–21) over the glyph cells of the box, with the text
 * and background colours of that cell, and how many cells held glyphs.
 */
export interface ContrastBox extends TextBox { ratio: number; text: [number, number, number]; bg: [number, number, number]; cells: number }

/** WCAG 2 relative luminance of an sRGB colour (0–255 channels). */
function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * Contrast of every text box with alpha >= minAlpha in the frame at t. Four renders:
 *   A1 without text and B1 with text (single sample, recording the boxes): where they differ are the glyphs;
 *   A  without text and C with every text replaced by a solid box of its fill (both with the export's `samples`
 *      motion-blur sub-frames): A is the background, C the colour the text ends up with — through the same alpha,
 *      compositing, grade (scene text) or none (overlays), and blur — measured on solid boxes, so anti-aliasing of
 *      thin strokes does not dilute it.
 * Each box is cut into equal cells about one glyph wide; a cell counts if at least 3 of its pixels changed when the text was
 * drawn, and its ratio is that of the mean of C against the mean of A over the cell. The box's ratio is the lowest
 * cell's, so a glyph over a bright patch is judged by that patch, not by the average of the whole box. Text and
 * recording modes are restored even if a render throws.
 * Not modelled: a text box covering another text (overlap is reported separately), bloom spreading from the solid boxes.
 */
export function contrastAt(t: number, fps: number, samples: number, minAlpha = 0.5): ContrastBox[] {
  const grab = () => ctx.getImageData(0, 0, W, H).data;
  let A1: Uint8ClampedArray, B1: Uint8ClampedArray, A: Uint8ClampedArray, Cc: Uint8ClampedArray, boxes: TextBox[];
  try {
    textMode('hide');
    frame(t, fps, 1);
    A1 = grab();
    textMode('draw');
    recordText(true);
    frame(t, fps, 1);
    boxes = recordText(false);
    B1 = grab();
    textMode('hide');
    frame(t, fps, samples);
    A = grab();
    textMode('box');
    frame(t, fps, samples);
    Cc = grab();
  } finally {
    textMode('draw');
    recordText(false);
  }
  const out: ContrastBox[] = [];
  for (const b of boxes) {
    if (!(b.alpha >= minAlpha)) continue;
    const x0 = Math.max(0, Math.floor(b.x0)), x1 = Math.min(W, Math.ceil(b.x1));
    const y0 = Math.max(0, Math.floor(b.y0)), y1 = Math.min(H, Math.ceil(b.y1));
    if (x1 <= x0 || y1 <= y0) continue;
    // equal cells about one glyph wide (no sliver at the end: a 1 px column of edge pixels is not a glyph)
    const k = Math.max(1, Math.round((x1 - x0) / Math.max(6, b.px * 0.9)));
    let best: { ratio: number; text: [number, number, number]; bg: [number, number, number] } | null = null;
    let cells = 0;
    for (let j = 0; j < k; j++) {
      const cx = x0 + Math.round(((x1 - x0) * j) / k), cx1 = x0 + Math.round(((x1 - x0) * (j + 1)) / k);
      let glyph = 0, n = 0, maxd = 0;
      const bg = [0, 0, 0];
      for (let y = y0; y < y1; y++) for (let x = cx; x < cx1; x++) {
        const i = (y * W + x) * 4;
        if (Math.abs(B1[i] - A1[i]) + Math.abs(B1[i + 1] - A1[i + 1]) + Math.abs(B1[i + 2] - A1[i + 2]) > 24) glyph++;
        bg[0] += A[i]; bg[1] += A[i + 1]; bg[2] += A[i + 2];
        maxd = Math.max(maxd, Math.abs(Cc[i] - A[i]) + Math.abs(Cc[i + 1] - A[i + 1]) + Math.abs(Cc[i + 2] - A[i + 2]));
        n++;
      }
      if (glyph < 3) continue;
      cells++;
      // the text colour: the solid inside of the box in C (pixels that changed at least 90 % as much as the most changed
      // one), so the box's anti-aliased and motion-blurred edge does not dilute it on small text
      const tx = [0, 0, 0];
      let m = 0;
      for (let y = y0; y < y1; y++) for (let x = cx; x < cx1; x++) {
        const i = (y * W + x) * 4;
        if (Math.abs(Cc[i] - A[i]) + Math.abs(Cc[i + 1] - A[i + 1]) + Math.abs(Cc[i + 2] - A[i + 2]) >= maxd * 0.9) { tx[0] += Cc[i]; tx[1] += Cc[i + 1]; tx[2] += Cc[i + 2]; m++; }
      }
      const bgc: [number, number, number] = [bg[0] / n, bg[1] / n, bg[2] / n];
      const txc: [number, number, number] = [tx[0] / m, tx[1] / m, tx[2] / m];
      const l1 = luminance(txc), l2 = luminance(bgc);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (!best || ratio < best.ratio) best = { ratio, text: txc, bg: bgc };
    }
    // no cell changed: the text is invisible here (ratio 1: it cannot be read)
    out.push({ ...b, ...(best ?? { ratio: 1, text: [0, 0, 0] as [number, number, number], bg: [0, 0, 0] as [number, number, number] }), cells });
  }
  return out;
}
