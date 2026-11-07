/**
 * Contact-sheet grids (scripts/sheet.ts, scripts/verify.ts): JPEG files placed on a grid of equal cells, one ffmpeg run.
 *
 * phoneCell is the cell a frame takes on a phone: PHONE_WIDTH pixels wide whatever the film's shape, a landscape film in
 * a portrait feed included (the low end of the 390-430 points of the make-film skill). Looked at unscaled, on a normal
 * screen, it is about the size the viewer gets.
 */
export const PHONE_WIDTH = 390;

/** A frame's cell on a phone: PHONE_WIDTH wide, the height kept even for the JPEG's chroma planes. */
export const phoneCell = (frame: { width: number; height: number }): [number, number] =>
  [PHONE_WIDTH, 2 * Math.round((PHONE_WIDTH * frame.height) / frame.width / 2)];

/** Write `out`: each cell's file scaled to `cell` at its row and column. Throws on an ffmpeg failure. */
export function grid(cells: { row: number; col: number; file: string }[], [cw, ch]: [number, number], out: string): void {
  const n = cells.length;
  const inputs = cells.flatMap((c) => ['-i', c.file]);
  const size = `scale=${cw}:${ch}:flags=lanczos`;
  const scale = cells.map((_, i) => `[${i}:v]${size}[s${i}]`).join(';');
  const layout = cells.map((c) => `${c.col * cw}_${c.row * ch}`).join('|');
  const filter = n === 1 ? `[0:v]${size}[o]` : `${scale};${cells.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${n}:layout=${layout}:fill=black[o]`;
  const p = Bun.spawnSync(['ffmpeg', '-v', 'error', '-y', ...inputs, '-filter_complex', filter, '-map', '[o]', '-q:v', '3', out], { stderr: 'pipe' });
  if (p.exitCode !== 0) throw new Error(`ffmpeg: ${p.stderr.toString().trim()}`);
}
