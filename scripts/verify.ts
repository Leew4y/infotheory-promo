/**
 * Checks of the delivered file itself: what `just export` wrote, measured from the MP4 and not from what went into it.
 *
 *   just build <id> && bun scripts/verify.ts --film <id> [--style <id>] [--res <px>] [--file <video>] [--audio <file>]
 *                                            [--noaudio] [--out out/<id>/verify] [--dist dist/<id>] [--json]
 *
 * The file defaults to the export's own name for these options (out/<id>/<id>[-<style>][-<res>p].mp4). Export checks
 * its output before publishing it (frame count, durations, colour tags); this runs afterwards and asks another
 * question: is this file the film as it is now, and does it still measure right after encoding? It keeps a render
 * whatever it finds, so it can be run on any file at any time.
 *
 * - verify-decode    the whole video decodes without an error and gives the frames asked of it (one pass, frame-exact).
 * - verify-frames, verify-fps, verify-size   one video stream with the film's frame count, frame rate and pixel size.
 * - verify-picture   the middle frame of every scene, decoded from the file, against the same frame rendered by the
 *                    current build (dist/<id>/, a stale dist makes this fail: rebuild first). The score is the largest
 *                    difference of any 16x16 block (mean per pixel, 0-255): a changed word on a plain page moves one
 *                    block a lot and a whole-frame average hardly at all. Measured (infotheory, 1080p): 6 as exported at
 *                    crf 18, 8 capped at 20 Mbit/s (--for x), 15 re-encoded at crf 30, which fails: pass such a copy
 *                    through verify before compressing it, not after; one character changed for another at 28-40 px
 *                    60-100, but near twins (己 and 已, 10) and small low-contrast digits (8) stay under PICTURE_LIMIT.
 *                    One frame per scene is a sample: a change away from the middle of a scene is not seen.
 * - verify-audio     an audio stream as long as the video, unless --noaudio.
 * - verify-loudness, verify-true-peak   integrated loudness and true peak of the encoded audio (EBU R128), which the
 *                    mix checked only before AAC. The limits leave room for what the codec does to a master in spec.
 * - verify-audio-stale   the encoded audio against the file it should have been made from (--audio, else the final mix
 *                    out/<id>/master.wav, else out/<id>/music.wav, as the export picks): signal to difference in 2 s
 *                    windows; the worst window must clear SNR_LIMIT. Without such a file: warning verify-audio-unchecked.
 *
 * Writes to <out>, as a whole and only over a previous verify (it has a verify.json): verify.json (the file's sha256,
 * the measurements and the diagnostics, a record of exactly what was checked), sheet.jpg and phone.jpg (the decoded
 * frames, a scene each, at quarter size and at the width a phone shows), frames/. Look at them: the checks say the file
 * is the film, not that the film is right.
 * Diagnostics: { level, code, path, message }. With --json, stdout is only that list. Exit code 1 on any error, 2 if
 * the tool could not run (bad arguments, no file, no Chrome).
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';
import { chromeArgs, findChrome, loadFilm, serveDist } from './chrome';
import { filmArg, mediaDir } from './film-arg';
import { requireCaptureFrames } from './lib/captures';
import { grid, phoneCell } from './lib/grid';

/** Largest allowed 16x16 block difference (see the header). */
const PICTURE_LIMIT = 12;
/** Worst allowed 2 s window of the encoded audio against its source, dB; windows below SILENCE_DB are not judged. */
const SNR_LIMIT = 12, SILENCE_DB = -50, WINDOW_S = 2;
/** The encoded audio: the master's target (audio/synth.py: -16 ± 0.5 LUFS, -1.5 dBTP) with room for the codec. */
const LOUDNESS = -16, LOUDNESS_TOL = 1, MAX_TRUE_PEAK = -1;

const ROOT = path.resolve(import.meta.dir, '..');
const argv = Bun.argv.slice(2);
const VALUED = ['film', 'style', 'res', 'file', 'audio', 'out', 'dist'], FLAGS = ['noaudio', 'json'];
const JSON_OUT = argv.includes('--json');
type Diag = { level: 'error' | 'warning'; code: string; path: string; message: string };
const diags: Diag[] = [];
const err = (code: string, where: string, message: string) => { diags.push({ level: 'error', code, path: where, message }); };
const warn = (code: string, where: string, message: string) => { diags.push({ level: 'warning', code, path: where, message }); };
/** The tool cannot run: the same diagnostics format, exit code 2. */
const stop = (code: string, message: string): never => {
  if (JSON_OUT) console.log(JSON.stringify([{ level: 'error', code, path: 'argv', message }], null, 1));
  console.error(message);
  process.exit(2);
};
for (let i = 0; i < argv.length; i++) {
  const k = argv[i].replace(/^--/, '');
  if (!argv[i].startsWith('--') || ![...VALUED, ...FLAGS].includes(k)) stop('usage', `unknown argument: ${argv[i]}`);
  if (VALUED.includes(k)) i++;
}
const opt = (k: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : undefined);
const filmR = filmArg(argv);
if (filmR.error !== undefined) stop('usage', filmR.error);
const FILM = filmR.film!;
const STYLE = opt('style') ?? '', RES = opt('res'), NOAUDIO = argv.includes('--noaudio');
if (RES !== undefined && !/^\d+$/.test(RES)) stop('usage', `--res ${RES}: pixels on the short side, e.g. 1440 or 2160`);
const FILE = path.resolve(ROOT, opt('file') ?? `out/${FILM}/${FILM}${STYLE ? `-${STYLE}` : ''}${RES ? `-${RES}p` : ''}.mp4`);
const OUT = path.resolve(ROOT, opt('out') ?? `out/${FILM}/verify`);
const DIST = path.resolve(ROOT, opt('dist') ?? `dist/${FILM}`);
if (!existsSync(FILE)) stop('verify-file', `${FILE} not found: run just export ${FILM}, or name a file with --file`);
if (!existsSync(path.join(DIST, 'index.html'))) stop('verify-file', `${path.relative(ROOT, DIST)}/index.html missing: run just build ${FILM}`);
if (existsSync(OUT) && !existsSync(path.join(OUT, 'verify.json')) && readdirSync(OUT).length) stop('usage', `--out ${OUT} exists and is not a previous verify (no verify.json): refusing to replace it`);
await requireCaptureFrames(FILM, { json: JSON_OUT });
const log = (s: string) => { if (JSON_OUT) console.error(s); else console.log(s); };
const where = path.relative(ROOT, FILE).replaceAll('\\', '/');

const run = async (cmd: string[]): Promise<{ code: number; out: Uint8Array; err: string }> => {
  const p = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
  const [out, e, code] = await Promise.all([new Response(p.stdout).bytes(), new Response(p.stderr).text(), p.exited]);
  return { code, out, err: e };
};
const sha256 = (file: string) => new Promise<string>((resolve, reject) => {
  const h = createHash('sha256');
  createReadStream(file).on('data', (b) => h.update(b)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
});

interface Stream { codec_type: string; width?: number; height?: number; avg_frame_rate?: string; nb_read_packets?: string; duration?: string }
async function probe(): Promise<Stream[] | null> {
  const r = await run(['ffprobe', '-v', 'error', '-count_packets', '-show_entries', 'stream=codec_type,width,height,avg_frame_rate,nb_read_packets,duration', '-of', 'json', FILE]);
  if (r.code !== 0) { err('verify-decode', where, `ffprobe cannot read the file: ${r.err.trim().split('\n').slice(-1)[0]}`); return null; }
  return JSON.parse(new TextDecoder().decode(r.out)).streams ?? [];
}

/** Decode the whole video once and keep the given frames (ascending) as <dir>/<index>.jpg: frame-exact, and a damaged stream shows. */
async function decodeFrames(frames: number[], dir: string): Promise<boolean> {
  mkdirSync(dir, { recursive: true });
  const select = frames.map((f) => `eq(n\\,${f})`).join('+');
  const r = await run(['ffmpeg', '-v', 'error', '-xerror', '-i', FILE, '-map', '0:v:0', '-vf', `select=${select}`, '-fps_mode', 'passthrough', '-q:v', '2', path.join(dir, '%04d.jpg')]);
  if (r.code !== 0 || r.err.trim()) { err('verify-decode', where, `the video does not decode cleanly: ${r.err.trim().split('\n').slice(-1)[0] || `ffmpeg exit ${r.code}`}`); return false; }
  const got = readdirSync(dir).length;
  if (got !== frames.length) { err('verify-decode', where, `decoded ${got} of the ${frames.length} frames asked for`); return false; }
  return true;
}

/** The largest 16x16 block difference between two JPEGs, the first scaled to the second's size (0-255). */
async function blockDifference(decoded: string, rendered: string, w: number, h: number): Promise<number> {
  const graph = `[0:v]scale=${w}:${h}:flags=area,format=yuvj444p[a];[1:v]format=yuvj444p[b];[a][b]blend=all_mode=difference,scale=${Math.floor(w / 16)}:${Math.floor(h / 16)}:flags=area,signalstats,metadata=print:file=-`;
  const r = await run(['ffmpeg', '-v', 'error', '-i', decoded, '-i', rendered, '-filter_complex', graph, '-f', 'null', '-']);
  const m = /lavfi\.signalstats\.YMAX=(\d+(?:\.\d+)?)/.exec(new TextDecoder().decode(r.out));
  if (r.code !== 0 || !m) throw new Error(`comparing frames: ${r.err.trim().split('\n').slice(-1)[0] || `no measurement (ffmpeg exit ${r.code})`}`);
  return Number(m[1]);
}

/** Integrated loudness and true peak of the file's audio (EBU R128), as audio/synth.py measures the master. */
async function loudness(): Promise<{ I: number; TP: number }> {
  const r = await run(['ffmpeg', '-hide_banner', '-nostats', '-i', FILE, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const s = r.err.slice(r.err.lastIndexOf('Summary:'));
  const I = Number(/I:\s*(-?[\d.]+) LUFS/.exec(s)?.[1]), TP = Number(/Peak:\s*(-?[\d.]+) dBFS/.exec(s)?.[1]);
  if (r.code !== 0 || !Number.isFinite(I) || !Number.isFinite(TP)) throw new Error(`measuring loudness: ${r.err.trim().split('\n').slice(-1)[0]}`);
  return { I, TP };
}

const pcm = async (file: string, rate: number): Promise<Float32Array> => {
  const r = await run(['ffmpeg', '-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-']);
  if (r.code !== 0) throw new Error(`decoding ${file}: ${r.err.trim().split('\n').slice(-1)[0]}`);
  return new Float32Array(r.out.buffer.slice(r.out.byteOffset, r.out.byteOffset + r.out.byteLength));
};
/** Signal to difference (dB) of two signals in windows, the worst one and where; windows of near silence do not count. */
function worstWindow(a: Float32Array, ref: Float32Array, rate: number): { snr: number; at: number } | null {
  const n = Math.min(a.length, ref.length), win = WINDOW_S * rate;
  let worst: { snr: number; at: number } | null = null;
  for (let i = 0; i + win <= n; i += win) {
    let s = 0, d = 0;
    for (let k = i; k < i + win; k++) { s += ref[k] * ref[k]; d += (a[k] - ref[k]) ** 2; }
    if (10 * Math.log10(s / win + 1e-12) < SILENCE_DB) continue;
    const snr = 10 * Math.log10(s / (d + 1e-12));
    if (!worst || snr < worst.snr) worst = { snr, at: i / rate };
  }
  return worst;
}

interface Scene { name: string; start: number; end: number }
const TMP = `${OUT}.${process.pid}.tmp`;
const server = serveDist(DIST, { media: mediaDir(FILM) });
let browser: Browser | null = null;
let code = 0;
try {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }, args: chromeArgs('platform') });
  const page = await browser.newPage();
  await loadFilm(page, server.url, FILM, STYLE);
  const style: string = await page.evaluate(() => window.__style);
  const { frames: filmFrames, fps }: { frames: number; fps: number } = await page.evaluate(() => window.__timeline());
  const frame = await page.evaluate(() => window.__frameSize?.() ?? { width: 1920, height: 1080 });
  const scenes: Scene[] = await page.evaluate(() => window.__scenes());

  // ---- the streams
  const streams = await probe();
  const video = streams?.filter((s) => s.codec_type === 'video') ?? [];
  const audio = streams?.find((s) => s.codec_type === 'audio');
  if (streams && video.length !== 1) err('verify-frames', where, `${video.length} video streams, expected one`);
  const v = video[0];
  const fileFrames = v ? Number(v.nb_read_packets) : NaN;
  const [num, den] = (v?.avg_frame_rate ?? '0/1').split('/').map(Number);
  const short = Math.min(frame.width, frame.height), k = RES ? Number(RES) / short : 1;
  const want = [frame.width * k, frame.height * k];
  if (v) {
    if (fileFrames !== filmFrames) err('verify-frames', where, `the file has ${fileFrames} frames, the film ${filmFrames}: it was not exported from this cut`);
    if (Math.abs(num / den - fps) > 1e-3) err('verify-fps', where, `the file runs at ${(num / den).toFixed(3)} fps, the film at ${fps}`);
    if (v.width !== want[0] || v.height !== want[1]) err('verify-size', where, `the file is ${v.width}x${v.height}, expected ${want[0]}x${want[1]}${RES ? '' : ' (--res for another resolution)'}`);
  }

  // ---- the picture: the middle frame of every scene
  const moments = scenes.map((s) => {
    const a = Math.ceil(s.start * fps - 1e-9), b = Math.ceil(s.end * fps - 1e-9);
    return { scene: s.name, frame: Math.floor((a + b - 1) / 2) };
  }).filter((m, i, all) => m.frame < (fileFrames || 0) && all.findIndex((x) => x.frame === m.frame) === i);
  const picture: { scene: string; frame: number; t: number; difference: number | null; file: string }[] = [];
  if (v && moments.length && await decodeFrames(moments.map((m) => m.frame), path.join(TMP, 'frames'))) {
    const rendered = path.join(TMP, 'rendered.jpg');
    for (const [i, m] of moments.entries()) {
      const t = m.frame / fps, file = `frames/${String(i + 1).padStart(4, '0')}.jpg`;
      let difference: number | null = null;
      if (fileFrames === filmFrames) { // otherwise the frame numbers mean different moments; verify-frames has said so
        const url: string = await page.evaluate((t, f) => window.__frame(t, f), t, fps);
        writeFileSync(rendered, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
        difference = await blockDifference(path.join(TMP, file), rendered, frame.width, frame.height);
        if (difference > PICTURE_LIMIT) err('verify-picture', `scene:${m.scene}`, `frame ${m.frame} (${t.toFixed(2)} s) differs from the current build by ${difference} (limit ${PICTURE_LIMIT}): the file is older than this build, or damaged`);
      }
      picture.push({ scene: m.scene, frame: m.frame, t: +t.toFixed(4), difference, file });
    }
    rmSync(rendered, { force: true });
    const cols = 4, cell: [number, number] = [2 * Math.round(frame.width / 8), 2 * Math.round(frame.height / 8)];
    const cells = picture.map((p, i) => ({ row: Math.floor(i / cols), col: i % cols, file: path.join(TMP, p.file) }));
    grid(cells, cell, path.join(TMP, 'sheet.jpg'));
    grid(cells, phoneCell(frame), path.join(TMP, 'phone.jpg'));
  }

  // ---- the sound
  const report: { I?: number; TP?: number; duration?: number; reference?: string; worstWindow?: { snr: number; at: number } | null } = {};
  if (!audio) {
    if (!NOAUDIO) err('verify-audio', where, 'the file has no audio stream (--noaudio for a silent film)');
  } else {
    report.duration = Number(audio.duration);
    const videoSeconds = Number(v?.duration);
    if (Math.abs(report.duration - videoSeconds) > 1024 / 44100 + 1e-3) err('verify-audio', where, `the audio lasts ${report.duration.toFixed(3)} s, the video ${videoSeconds.toFixed(3)} s`);
    Object.assign(report, await loudness());
    if (Math.abs(report.I! - LOUDNESS) > LOUDNESS_TOL) err('verify-loudness', where, `the encoded audio measures ${report.I} LUFS, expected ${LOUDNESS} ± ${LOUDNESS_TOL}`);
    if (report.TP! > MAX_TRUE_PEAK) err('verify-true-peak', where, `the encoded audio peaks at ${report.TP} dBTP, the limit is ${MAX_TRUE_PEAK}`);
    const source = [opt('audio'), `out/${FILM}/master.wav`, `out/${FILM}/music.wav`].find((p) => p && existsSync(path.resolve(ROOT, p)));
    if (!source) warn('verify-audio-unchecked', where, 'no final mix or music master here to compare the encoded audio with');
    else {
      report.reference = source;
      const rate = 8000;
      report.worstWindow = worstWindow(await pcm(FILE, rate), await pcm(path.resolve(ROOT, source), rate), rate);
      const w = report.worstWindow;
      if (w && w.snr < SNR_LIMIT) err('verify-audio-stale', where, `at ${w.at} s the encoded audio differs from ${source} (${w.snr.toFixed(1)} dB, limit ${SNR_LIMIT}): it was not made from this mix`);
    }
  }

  // ---- the record
  const stat = statSync(FILE);
  writeFileSync(path.join(TMP, 'verify.json'), JSON.stringify({
    film: FILM, style, file: where, sha256: await sha256(FILE), bytes: stat.size, frames: fileFrames, fps,
    size: v ? [v.width, v.height] : null, audio: report, limits: { picture: PICTURE_LIMIT, snr: SNR_LIMIT, loudness: [LOUDNESS, LOUDNESS_TOL], truePeak: MAX_TRUE_PEAK },
    picture, diagnostics: diags,
  }, null, 1) + '\n');
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(path.dirname(OUT), { recursive: true });
  renameSync(TMP, OUT);
  const worst = picture.reduce<number | null>((a, p) => (p.difference === null ? a : Math.max(a ?? 0, p.difference)), null);
  log(`${where}: ${fileFrames} frames, ${picture.length} scenes compared${worst === null ? '' : ` (largest block difference ${worst})`}`);
  if (report.I !== undefined) log(`audio: ${report.I} LUFS, ${report.TP} dBTP${report.worstWindow ? `, worst window against ${report.reference} ${report.worstWindow.snr.toFixed(1)} dB at ${report.worstWindow.at} s` : ''}`);
  log(`-> ${path.join(OUT, 'verify.json')}, sheet.jpg, phone.jpg`);
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  diags.push({ level: 'error', code: 'tool-error', path: where, message });
  code = 2;
} finally {
  rmSync(TMP, { recursive: true, force: true });
  await browser?.close().catch(() => {});
  server.stop();
}
for (const d of diags) (d.level === 'error' ? console.error : log)(`${d.level} ${d.code} ${d.path}: ${d.message}`);
const errors = diags.filter((d) => d.level === 'error').length;
log(`verify: ${errors} error(s), ${diags.length - errors} warning(s)`);
if (JSON_OUT) console.log(JSON.stringify(diags, null, 1));
process.exit(code || (errors ? 1 : 0));
