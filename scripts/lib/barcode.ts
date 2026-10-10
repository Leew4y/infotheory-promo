/**
 * Frame-number barcode for testing captures (from the phase 0b spike): a strip of 96 px blocks at y = BAR.y (1080p
 * frame): block 0 white reference, block 1 black reference, blocks 2..17 bits 0..15 of the frame number (LSB first).
 * makeNumberedVideo() writes a test video whose every frame carries its number; readBarcode() decodes it from RGBA.
 */
export const BAR = { y: 920, h: 80, w: 96, bits: 16 };

/** Decode from an RGBA buffer of `width` px rows; `y0` is the strip's top row in that buffer. -1 if unreadable. */
export function readBarcode(px: Uint8Array | Uint8ClampedArray, width: number, y0 = BAR.y): number {
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
  if (white - black < 100) return -1;
  const th = (white + black) / 2;
  let code = 0;
  for (let k = 0; k < BAR.bits; k++) {
    const v = mean(2 + k);
    // a value too close to the threshold: the block is blended or damaged
    if (Math.abs(v - th) < (white - black) * 0.25) return -1;
    if (v > th) code |= 1 << k;
  }
  return code;
}

/** Write a 1920x1080 H.264 test video of `seconds` at `fps` whose frame n carries barcode n and the number in large type. */
export async function makeNumberedVideo(file: string, seconds: number, fps = 30): Promise<void> {
  const b = `floor(X/${BAR.w})`;
  const code = `if(eq(${b},0),255,if(eq(${b},1),0,if(lt(${b},${2 + BAR.bits}),255*mod(floor(N/pow(2,${b}-2)),2),128)))`;
  const graph = [
    `testsrc2=s=1920x1080:r=${fps}:d=${seconds},format=yuv444p[bg]`,
    `color=c=black:s=1920x${BAR.h}:r=${fps}:d=${seconds},format=gray,geq=lum='${code}',format=yuv444p[bc]`,
    `[bg][bc]overlay=0:${BAR.y},format=yuv420p[v]`,
  ].join(';');
  const p = Bun.spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-filter_complex', graph, '-map', '[v]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-r', String(fps), file], { stderr: 'pipe' });
  if ((await p.exited) !== 0) throw new Error(`ffmpeg (numbered video): ${(await new Response(p.stderr).text()).trim()}`);
}
