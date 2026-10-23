/**
 * What this machine has for making films, and the command that fixes each gap:
 *
 *   bun scripts/doctor.ts            (just doctor)
 *
 * Checks the tools on PATH (bun, just, ffmpeg with libx264, uv, and on Apple silicon the speech tool), Chrome (the
 * one the tools would use), the JavaScript and audio dependencies, the font cache, the narration backend's model, and
 * the voice-design environment. Read-only: it installs nothing. Exit code 1 if anything needed for rendering is
 * missing; narration and voice design are reported but optional.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { findChrome } from './chrome';

const ROOT = path.resolve(import.meta.dir, '..');
const MAC_ARM = process.platform === 'darwin' && process.arch === 'arm64';
const rows: { what: string; ok: boolean; detail: string; fix?: string; optional?: boolean }[] = [];
const run = (cmd: string[]): string | null => {
  try {
    const p = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' });
    return p.exitCode === 0 ? `${p.stdout.toString()}${p.stderr.toString()}`.trim() : null;
  } catch { return null; }
};
const brew = MAC_ARM || process.platform === 'darwin' ? 'brew bundle (or brew install' : 'install';
const tool = (name: string, args: string[], pick: (out: string) => string, fix: string, optional = false) => {
  const out = Bun.which(name) ? run([name, ...args]) : null;
  rows.push({ what: name, ok: out !== null, detail: out === null ? 'not found' : pick(out), fix, optional });
};

tool('bun', ['--version'], (o) => o.split('\n')[0], `${brew} bun)`);
tool('just', ['--version'], (o) => o.split('\n')[0], `${brew} just)`);
tool('ffmpeg', ['-hide_banner', '-version'], (o) => o.split('\n')[0].replace(/ Copyright.*/, ''), `${brew} ffmpeg)`);
tool('uv', ['--version'], (o) => o.split('\n')[0], `${brew} uv)`);
const x264 = Bun.which('ffmpeg') ? run(['ffmpeg', '-hide_banner', '-encoders']) : null;
rows.push({ what: 'ffmpeg libx264', ok: !!x264 && /libx264/.test(x264), detail: x264 && /libx264/.test(x264) ? 'present' : 'missing', fix: 'an ffmpeg build with libx264 (Homebrew ffmpeg has it)' });
try {
  const c = findChrome();
  const v = process.platform === 'win32' ? 'found' : (run([c, '--version']) ?? 'found');
  rows.push({ what: 'chrome', ok: true, detail: `${v} (${c})` });
} catch (e) {
  rows.push({ what: 'chrome', ok: false, detail: (e as Error).message, fix: 'install Google Chrome, or set CHROME_PATH' });
}
rows.push({ what: 'node_modules', ok: existsSync(path.join(ROOT, 'node_modules', 'puppeteer-core')), detail: 'JavaScript dependencies', fix: 'just setup' });
rows.push({ what: 'audio env', ok: existsSync(path.join(ROOT, 'audio', '.venv')), detail: 'numpy / scipy for the score and the mix', fix: 'just setup' });
rows.push({ what: 'font cache', ok: existsSync(path.join(ROOT, '.cache', 'fonts')), detail: 'full fonts for just fonts (downloaded on first use)', fix: 'just fonts <film> (downloads once)', optional: true });
if (MAC_ARM) {
  tool('speech', ['speak', '--help'], () => (run(['brew', 'list', '--versions', 'speech']) ?? 'on PATH'), `${brew} speech)`, true);
  const mlx = existsSync(path.join(ROOT, '.cache', 'tts', 'models', 'CosyVoice3-0.5B-MLX-bf16', 'speech_tokenizer.safetensors'));
  rows.push({ what: 'narration', ok: mlx, detail: mlx ? 'cosyvoice3-mlx model ready' : 'model not downloaded (2.3 GB)', fix: 'just tts-setup', optional: true });
  const vd = existsSync(path.join(ROOT, '.cache', 'voice-design', 'venv', 'bin', 'python'));
  rows.push({ what: 'voice design', ok: vd, detail: vd ? 'environment ready' : 'set up on first use of just voice-design', optional: true });
} else {
  const torch = existsSync(path.join(ROOT, '.cache', 'tts', 'models', 'Fun-CosyVoice3-0.5B', 'cosyvoice3.yaml'));
  rows.push({ what: 'narration', ok: torch, detail: torch ? 'cosyvoice3 model ready' : 'model not downloaded (5.4 GB)', fix: 'just tts-setup', optional: true });
}

let bad = 0;
for (const r of rows) {
  if (!r.ok && !r.optional) bad++;
  console.log(`${r.ok ? 'ok  ' : r.optional ? 'opt ' : 'MISS'} ${r.what.padEnd(15)} ${r.detail}${!r.ok && r.fix ? `  ->  ${r.fix}` : ''}`);
}
console.log(bad ? `${bad} required item(s) missing` : 'ready to render');
process.exit(bad ? 1 : 0);
