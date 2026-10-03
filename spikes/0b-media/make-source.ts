/**
 * Phase 0b: make the diagnostic "capture" and split it into image sequences.
 *
 *   bun spikes/0b-media/make-source.ts <outDir> [--seconds 90] [--png-seconds 30]
 *
 * <outDir>/source.mp4   1080p30 H.264 (stands in for a screen capture)
 * <outDir>/jpg/NNNNN.jpg every frame, JPEG (ffmpeg -q:v 2, roughly q95), numbered from 00000
 * <outDir>/png/NNNNN.png the first --png-seconds, lossless
 *
 * Every frame carries, over a moving testsrc2 background:
 *   y 920-1000  a 16-bit frame-number barcode (see barcode.ts), with a white and a black reference block
 *   y 840-900   a grey ramp; y 760-820 six colour patches; y 700 a line of 14 px text; a large frame counter
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { BAR } from './barcode';

const argv = Bun.argv.slice(2);
const OUT = path.resolve(argv[0] ?? 'out/0b-media');
const opt = (k: string, d: number) => (argv.includes(`--${k}`) ? +argv[argv.indexOf(`--${k}`) + 1] : d);
const SECONDS = opt('seconds', 90);
const PNG_SECONDS = opt('png-seconds', 30);
const FONT = process.env.FONTFILE ?? (process.platform === 'win32' ? 'C:/Windows/Fonts/arial.ttf' : process.platform === 'darwin' ? '/System/Library/Fonts/Supplemental/Arial.ttf' : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
if (!existsSync(FONT)) throw new Error(`font for drawtext not found: ${FONT} (set FONTFILE)`);
const font = FONT.replace(/\\/g, '/').replace(':', '\\:');

// Barcode blocks: b = floor(X / BAR.w); 0 white ref, 1 black ref, 2..17 bits 0..15 of N (LSB first), rest mid grey.
const b = `floor(X/${BAR.w})`;
const code = `if(eq(${b},0),255,if(eq(${b},1),0,if(lt(${b},${2 + BAR.bits}),255*mod(floor(N/pow(2,${b}-2)),2),128)))`;
const patches = ['0xE53935', '0x43A047', '0x1E88E5', '0xFDD835', '0x8E24AA', '0x00ACC1']
  .map((c, i) => `drawbox=x=${60 + i * 300}:y=760:w=260:h=60:color=${c}:t=fill`).join(',');
const graph = [
  `testsrc2=s=1920x1080:r=30:d=${SECONDS},format=yuv444p[bg]`,
  `color=c=black:s=1920x${BAR.h}:r=30:d=${SECONDS},format=gray,geq=lum='${code}',format=yuv444p[bc]`,
  `color=c=black:s=1920x60:r=30:d=${SECONDS},format=gray,geq=lum='X*255/1919',format=yuv444p[ramp]`,
  `[bg][bc]overlay=0:${BAR.y}[a]`,
  `[a][ramp]overlay=0:840,${patches},` +
    `drawbox=x=40:y=680:w=1840:h=34:color=white:t=fill,` +
    `drawtext=fontfile='${font}':fontsize=14:fontcolor=black:x=50:y=690:text='The quick brown fox jumps over the lazy dog 0123456789 - fine text legibility sample - frame %{frame_num}',` +
    `drawtext=fontfile='${font}':fontsize=96:fontcolor=white:box=1:boxcolor=black@0.6:x=60:y=60:text='%{frame_num}',format=yuv420p[v]`,
].join(';');

async function ff(args: string[]): Promise<void> {
  const p = Bun.spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', ...args], { stdout: 'inherit', stderr: 'inherit' });
  if ((await p.exited) !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
}

mkdirSync(path.join(OUT, 'jpg'), { recursive: true });
mkdirSync(path.join(OUT, 'png'), { recursive: true });
const t0 = performance.now();
await ff(['-filter_complex', graph, '-map', '[v]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-r', '30', path.join(OUT, 'source.mp4')]);
console.log(`source.mp4 ${((performance.now() - t0) / 1000).toFixed(1)}s`);
await ff(['-i', path.join(OUT, 'source.mp4'), '-q:v', '2', '-start_number', '0', path.join(OUT, 'jpg', '%05d.jpg')]);
await ff(['-i', path.join(OUT, 'source.mp4'), '-t', String(PNG_SECONDS), '-start_number', '0', path.join(OUT, 'png', '%05d.png')]);
console.log(`done in ${((performance.now() - t0) / 1000).toFixed(1)}s -> ${OUT}`);
