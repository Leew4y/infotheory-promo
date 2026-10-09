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
 * 4. the model: the files inference reads (about 5.4 GB) -> .cache/tts/models/Fun-CosyVoice3-0.5B, each checked
 *    against the Hugging Face revision pinned below (sha256 of LFS files, git blob hash of small ones). Downloaded from
 *    ModelScope (the publisher's own hub, fast from China; TTS_MODEL_SOURCE=hf for Hugging Face), file by file;
 *    a verified file is kept, so an interrupted download resumes with the next file.
 * Needs git and uv. Tried on Windows 11 with CUDA (RTX 3060 Laptop); not yet on macOS.
 */
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const TTS = path.join(ROOT, '.cache', 'tts');
const SRC = path.join(TTS, 'cosyvoice-src'), VENV = path.join(TTS, 'venv');
const MODEL = path.join(TTS, 'models', 'Fun-CosyVoice3-0.5B');
const COSYVOICE = { repo: 'https://github.com/FunAudioLLM/CosyVoice.git', commit: '074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc' };
/** The model at Hugging Face revision 29e01c4e (FunAudioLLM/Fun-CosyVoice3-0.5B-2512): path, size, sha256 (LFS) or git blob sha1. */
const REPO = 'FunAudioLLM/Fun-CosyVoice3-0.5B-2512', REVISION = '29e01c4e8d000f4bcd70751be16fa94bf3d85a18';
const FILES: [string, number, string][] = [
  ['CosyVoice-BlankEN/config.json', 659, 'git:463b055262b6c66c4629a74a4b300bfe2ed31d3c'],
  ['CosyVoice-BlankEN/generation_config.json', 242, 'git:dfc11073787daf1b0f9c0f1499487ab5f4c93738'],
  ['CosyVoice-BlankEN/merges.txt', 1402109, 'git:90d3d82d027eadcc6a5e77c38eb82d43fc51b53b'],
  ['CosyVoice-BlankEN/model.safetensors', 988097824, '130282af0dfa9fe5840737cc49a0d339d06075f83c5a315c3372c9a0740d0b96'],
  ['CosyVoice-BlankEN/tokenizer_config.json', 1287, 'git:ff55d7b9eb1384e5d4d7e75dc0f564c1a8833d6e'],
  ['CosyVoice-BlankEN/vocab.json', 2776833, 'git:4783fe10ac3adce15ac8f358ef5462739852c569'],
  ['campplus.onnx', 28303423, 'a6ac6a63997761ae2997373e2ee1c47040854b4b759ea41ec48e4e42df0f4d73'],
  ['config.json', 2, 'git:9e26dfeeb6e641a33dae4961196235bdb965b21b'],
  ['configuration.json', 47, 'git:5e812fae901c12933ac69ebf3eb79d0eb49bbab4'],
  ['cosyvoice3.yaml', 6934, 'git:2eda7e5007d99f6b17fbe7bd751cf54e3cde29ea'],
  ['flow.pt', 1329116148, 'a6fab32a7825e5b0bc855ddd948f8db9370b0a786fbc249caa4595e95b608e4b'],
  ['hift.pt', 83202622, 'b279d7641eb97ae55b3b540cfba4f953c26492a2df758328a89a4d007ab87a65'],
  ['llm.pt', 2024669519, '69f43bd545131c30e98947fb360ea8b4dc9916d8e83dded7757c7ea4f5a24970'],
  ['speech_tokenizer_v3.onnx', 969451503, '23236a74175dbdda47afc66dbadd5bcb41303c467a57c261cb8539ad9db9208d'],
];
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
// 4. model, file by file, each verified
/** Whether a file matches its pinned hash (sha256, or git's blob sha1 for small files). */
async function verified(f: string, size: number, hash: string): Promise<boolean> {
  if (!existsSync(f) || statSync(f).size !== size) return false;
  const h = new Bun.CryptoHasher(hash.startsWith('git:') ? 'sha1' : 'sha256');
  if (hash.startsWith('git:')) h.update(`blob ${size}\0`);
  for await (const chunk of Bun.file(f).stream()) h.update(chunk);
  return h.digest('hex') === hash.replace('git:', '');
}
const source = process.env.TTS_MODEL_SOURCE === 'hf' ? 'hf' : 'modelscope';
for (const [rel, size, hash] of FILES) {
  const f = path.join(MODEL, rel);
  if (await verified(f, size, hash)) continue;
  rmSync(f, { force: true });
  // config.json (2 bytes) is only on Hugging Face
  const hub = source === 'hf' || rel === 'config.json' ? 'hf' : 'modelscope';
  const code = hub === 'hf'
    ? `from huggingface_hub import hf_hub_download; hf_hub_download(${JSON.stringify(REPO)}, ${JSON.stringify(rel)}, revision=${JSON.stringify(REVISION)}, local_dir=${JSON.stringify(MODEL)})`
    : `from modelscope.hub.file_download import model_file_download; model_file_download(${JSON.stringify(REPO)}, ${JSON.stringify(rel)}, local_dir=${JSON.stringify(MODEL)})`;
  sh(`${rel} (${(size / 2 ** 20).toFixed(0)} MiB, ${hub})`, [PY, '-c', code]);
  if (!(await verified(f, size, hash))) { console.error(`${rel}: downloaded file does not match the pinned revision ${REVISION.slice(0, 8)}`); process.exit(1); }
}
const cuda = Bun.spawnSync([PY, '-c', 'import torch; print(torch.cuda.is_available())'], { stdout: 'pipe' }).stdout.toString().trim();
console.log(`TTS ready: ${path.relative(ROOT, MODEL)}, CUDA ${cuda}`);
