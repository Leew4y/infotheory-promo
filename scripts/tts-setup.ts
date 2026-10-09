/**
 * Set up local text-to-speech (Fun-CosyVoice3-0.5B) under .cache/tts/, pinned throughout; each step is skipped when
 * already done, so it can be re-run after a failure:
 *
 *   bun scripts/tts-setup.ts            (just tts-setup)
 *
 * 1. CosyVoice's source at a pinned commit, with its Matcha-TTS submodule -> .cache/tts/cosyvoice-src
 * 2. a Python 3.10 environment (uv) -> .cache/tts/venv
 * 3. PyTorch 2.3.1 (CUDA 12.1 wheels on Windows and Linux; the default wheels on macOS, CPU/MPS), then
 *    audio/tts-requirements.txt (openai-whisper is built without isolation: its setup needs setuptools < 81)
 * 4. the model at a pinned revision, only the files inference reads (about 5.4 GB) -> .cache/tts/models/Fun-CosyVoice3-0.5B
 * Needs git and uv. Tried on Windows 11 with CUDA (RTX 3060 Laptop); not yet on macOS.
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const TTS = path.join(ROOT, '.cache', 'tts');
const SRC = path.join(TTS, 'cosyvoice-src'), VENV = path.join(TTS, 'venv');
const MODEL = path.join(TTS, 'models', 'Fun-CosyVoice3-0.5B');
const COSYVOICE = { repo: 'https://github.com/FunAudioLLM/CosyVoice.git', commit: '074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc' };
const HF = {
  repo: 'FunAudioLLM/Fun-CosyVoice3-0.5B-2512', revision: '29e01c4e8d000f4bcd70751be16fa94bf3d85a18',
  files: ['CosyVoice-BlankEN/*', 'campplus.onnx', 'config.json', 'configuration.json', 'cosyvoice3.yaml', 'flow.pt', 'hift.pt', 'llm.pt', 'speech_tokenizer_v3.onnx'],
};
const PY = process.platform === 'win32' ? path.join(VENV, 'Scripts', 'python.exe') : path.join(VENV, 'bin', 'python');
const TORCH = ['torch==2.3.1', 'torchaudio==2.3.1'];
const TORCH_INDEX = process.platform === 'darwin' ? [] : ['--index-url', 'https://download.pytorch.org/whl/cu121'];

function sh(what: string, cmd: string[], cwd = ROOT): string {
  console.log(`- ${what}`);
  const p = Bun.spawnSync(cmd, { cwd, stdout: 'pipe', stderr: 'inherit', env: { ...process.env, UV_CACHE_DIR: process.env.UV_CACHE_DIR ?? path.join(ROOT, '.cache', 'uv') } });
  if (p.exitCode !== 0) { console.error(`failed: ${cmd.join(' ')}`); process.exit(1); }
  return p.stdout.toString();
}
const pyOk = (code: string) => existsSync(PY) && Bun.spawnSync([PY, '-c', code], { stdout: 'ignore', stderr: 'ignore' }).exitCode === 0;
const pip = (what: string, args: string[]) => sh(what, ['uv', 'pip', 'install', '--python', PY, ...args]);

mkdirSync(TTS, { recursive: true });
// 1. source
if (!existsSync(path.join(SRC, '.git'))) sh('clone CosyVoice', ['git', 'clone', '--quiet', COSYVOICE.repo, SRC]);
const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: SRC, stdout: 'pipe' }).stdout.toString().trim();
if (head !== COSYVOICE.commit) {
  sh('fetch the pinned commit', ['git', 'fetch', '--quiet', 'origin', COSYVOICE.commit], SRC);
  sh('check out the pinned commit', ['git', 'checkout', '--quiet', COSYVOICE.commit], SRC);
}
sh('submodules', ['git', 'submodule', 'update', '--init', '--recursive', '--quiet'], SRC);
// 2. environment
if (!existsSync(PY)) sh('Python 3.10 environment', ['uv', 'venv', '--quiet', '--python', '3.10', VENV]);
// 3. packages
if (!pyOk(`import torch; assert torch.__version__.startswith('2.3.1')`)) pip('PyTorch 2.3.1', [...TORCH, ...TORCH_INDEX]);
if (!pyOk('import whisper')) {
  pip('build tools for openai-whisper', ['setuptools<81', 'wheel']);
  pip('openai-whisper', ['--no-build-isolation', 'openai-whisper==20231117']);
}
pip('inference packages', ['-r', path.join(ROOT, 'audio', 'tts-requirements.txt'), ...TORCH, ...TORCH_INDEX.map((a) => (a === '--index-url' ? '--extra-index-url' : a)), '--index-strategy', 'unsafe-best-match']);
// 4. model
if (!existsSync(path.join(MODEL, 'llm.pt')) || !existsSync(path.join(MODEL, 'cosyvoice3.yaml'))) {
  sh(`model ${HF.repo}@${HF.revision.slice(0, 8)} (about 5.4 GB)`, [PY, '-c',
    `from huggingface_hub import snapshot_download; snapshot_download(${JSON.stringify(HF.repo)}, revision=${JSON.stringify(HF.revision)}, allow_patterns=${JSON.stringify(HF.files)}, local_dir=${JSON.stringify(MODEL)})`]);
}
const cuda = Bun.spawnSync([PY, '-c', 'import torch; print(torch.cuda.is_available())'], { stdout: 'pipe' }).stdout.toString().trim();
console.log(`TTS ready: ${path.relative(ROOT, MODEL)}, CUDA ${cuda}`);
