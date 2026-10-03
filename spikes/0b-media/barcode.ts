/**
 * Frame-number barcode shared by the source generator, the page and the checker.
 * A strip of 96 px blocks at y = BAR.y: block 0 white reference, block 1 black reference,
 * blocks 2..17 bits 0..15 of the frame number (LSB first). Reading samples the centre of each block.
 */
export const BAR = { y: 920, h: 80, w: 96, bits: 16 };

/** Decode from an RGBA buffer of `width` px rows; `y0` is the strip's top row in that buffer. Returns -1 if unreadable. */
export function readBarcode(px: Uint8Array | Uint8ClampedArray, width: number, y0 = BAR.y): { code: number; white: number; black: number } {
  const mean = (blk: number): number => {
    let s = 0, n = 0;
    const cx = blk * BAR.w + BAR.w / 2, cy = y0 + BAR.h / 2;
    for (let y = cy - 16; y < cy + 16; y++)
      for (let x = cx - 16; x < cx + 16; x++) {
        const i = (y * width + x) * 4;
        s += (px[i] + px[i + 1] + px[i + 2]) / 3;
        n++;
      }
    return s / n;
  };
  const white = mean(0), black = mean(1);
  if (white - black < 128) return { code: -1, white, black };
  const th = (white + black) / 2;
  let code = 0;
  for (let k = 0; k < BAR.bits; k++) {
    const v = mean(2 + k);
    // reject values too close to the threshold: the block is blended or damaged
    if (Math.abs(v - th) < (white - black) * 0.25) return { code: -1, white, black };
    if (v > th) code |= 1 << k;
  }
  return { code, white, black };
}
