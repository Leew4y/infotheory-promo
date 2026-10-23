/**
 * Find a narration voice by description (Apple silicon): design prompt clips, check them, hear them in narration,
 * keep one as voices/<id>/.
 *
 *   bun scripts/voice-design.ts <voice-id> --describe "A=<description>" [--describe "B=..."] [--text <prompt text>]
 *                               [--sample <narration to audition>] [--language chinese|english] [--seed 7]
 *   bun scripts/voice-design.ts <voice-id> --pick <key> [--description <one line for voice.json>]
 *
 * Design: Qwen3-TTS-12Hz-1.7B-VoiceDesign (MLX, Apache-2.0, pinned below; mlx-audio pinned, in .cache/voice-design/)
 * says --text in each described voice -> out/voice-design/<id>/<key>.wav. Each clip is transcribed back (speech
 * transcribe) so a clip that does not say its text is visible, its median pitch measured, and CosyVoice3 (the narration
 * backend, cosyvoice3-mlx; run just tts-setup first) clones it to read --sample -> <key>-sample.mp3, which is what the
 * person listens to. Everything lands in report.json. A designed voice is not a recording or a clone of a person.
 * --pick copies the chosen clip to voices/<id>/prompt.wav and writes voice.json with its provenance (model, revision,
 * tool versions, description, seed, the other candidates); it refuses an existing voice.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = path.resolve(import.meta.dir, '..');
const usage = (m: string): never => { console.error(m); process.exit(2); };
const fail = (m: string): never => { console.error(m); process.exit(1); };
let a: { values: Record<string, string | string[] | undefined>; positionals: string[] } = { values: {}, positionals: [] };
try {
  a = parseArgs({
    args: Bun.argv.slice(2), allowPositionals: true, strict: true,
    options: {
      describe: { type: 'string', multiple: true }, text: { type: 'string' }, sample: { type: 'string' }, language: { type: 'string' },
      seed: { type: 'string' }, pick: { type: 'string' }, description: { type: 'string' },
    },
  });
} catch (e) { usage(e instanceof Error ? e.message : String(e)); }
const ID = a.positionals[0] ?? usage('usage: voice-design <voice-id> --describe "A=<description>" ... | --pick <key>');
if (!/^[a-z0-9][a-z0-9-]*$/.test(ID)) usage(`voice id "${ID}": lowercase letters, digits, hyphens`);
const OUT = path.join(ROOT, 'out', 'voice-design', ID);
const VOICE = path.join(ROOT, 'voices', ID);
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

const MODEL = 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16', REVISION = '7d3824abff87e49756bb0f83fb5411de75d160c4';
const MLX_AUDIO = 'mlx-audio==0.6.1';
const ENV = path.join(ROOT, '.cache', 'voice-design');
const PY = path.join(ENV, 'venv', 'bin', 'python');
const BUNDLE = path.join(ROOT, '.cache', 'tts', 'models', 'CosyVoice3-0.5B-MLX-bf16');

function run(what: string, cmd: string[], env: Record<string, string> = {}): string {
  const p = Bun.spawnSync(cmd, { cwd: ROOT, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, UV_CACHE_DIR: path.join(ROOT, '.cache', 'uv'), HF_HOME: path.join(ROOT, '.cache', 'hf'), ...env } });
  if (p.exitCode !== 0) fail(`${what} failed (${p.exitCode}):\n${p.stderr.toString().trim().split('\n').slice(-15).join('\n')}`);
  return p.stdout.toString();
}

if (a.values.pick) {
  // keep one candidate as a voice
  const report = existsSync(path.join(OUT, 'report.json')) ? JSON.parse(readFileSync(path.join(OUT, 'report.json'), 'utf8')) : fail(`no report at ${path.relative(ROOT, OUT)}: run the design first`);
  const key = a.values.pick as string;
  const c = report.candidates.find((x: { key: string }) => x.key === key) ?? fail(`--pick ${key}: one of ${report.candidates.map((x: { key: string }) => x.key).join(', ')}`);
  if (existsSync(VOICE)) fail(`voices/${ID} already exists`);
  mkdirSync(VOICE, { recursive: true });
  copyFileSync(c.file, path.join(VOICE, 'prompt.wav'));
  const voice = {
    id: ID,
    description: (a.values.description as string | undefined) ?? `${report.language === 'English' ? 'English' : 'Mandarin'}; ${c.description.replace(/[。.]$/, "")}; median F0 about ${Math.round(c.f0)} Hz (audio/voice_design.py). A designed clip: Qwen3-TTS VoiceDesign made it from the description; the narration clones it zero-shot`,
    file: 'prompt.wav',
    text: report.text,
    language: report.language.toLowerCase(),
    source: `generated with Qwen3-TTS-12Hz-1.7B-VoiceDesign in MLX (${MODEL} at revision ${REVISION}), ${report.tools}; ${c.rate / 1000} kHz, 16-bit mono, ${c.seconds} s`,
    generator: { call: `load_model(model).generate_voice_design(text, language='${report.language}', instruct) after mx.random.seed(${report.seed})`, instruct: c.description, seed: report.seed },
    audition: Object.fromEntries(report.candidates.map((x: { key: string; description: string }) => [x.key === key ? `${x.key} (chosen)` : x.key, x.description])),
    transcriptSource: `the text the clip was generated from (transcribed back as "${c.transcript}")`,
    license: 'Apache-2.0 (Qwen3-TTS model licence); a designed voice, not a recording or clone of a person',
    sha256: sha256(readFileSync(path.join(VOICE, 'prompt.wav'))),
  };
  writeFileSync(path.join(VOICE, 'voice.json'), JSON.stringify(voice, null, 1) + '\n');
  console.log(`voices/${ID}: prompt.wav and voice.json written; use it with "voice": "${ID}" in a film plan`);
  process.exit(0);
}

if (process.platform !== 'darwin' || process.arch !== 'arm64') fail('voice-design runs on Apple silicon only (MLX)');
const describe = (a.values.describe as string[] | undefined) ?? usage('give at least one --describe "A=<description>"');
const candidates: Record<string, string> = {};
for (const d of describe) {
  const m = /^([A-Za-z0-9]+)=(.+)$/s.exec(d) ?? usage(`--describe "${d}": write it as <key>=<description>`);
  if (candidates[m[1]]) usage(`--describe: key ${m[1]} given twice`);
  candidates[m[1]] = m[2].trim();
}
const english = (a.values.language ?? 'chinese') === 'english';
const TEXT = (a.values.text as string | undefined) ?? (english ? 'We start from the simplest question and, step by step, go all the way down.' : '我们从最简单的问题出发，一步一步，走到它的深处。');
const SAMPLE = (a.values.sample as string | undefined) ?? (english ? 'The less likely the event, the more it tells you. A fair coin gives you exactly one bit.' : '越不可能的事，告诉你的越多。抛一枚公平的硬币，无论落在哪一面，你得到一比特的信息。而信息，就是被消除的不确定。');
const SEED = parseInt((a.values.seed as string | undefined) ?? '7', 10);
if (!Bun.which('speech')) fail('the speech tool is missing: run just tts-setup');
if (!existsSync(path.join(BUNDLE, 'speech_tokenizer.safetensors'))) fail('the CosyVoice3 MLX bundle is missing: run just tts-setup');

// the pinned design environment and model
const ok = existsSync(PY) && Bun.spawnSync([PY, '-c', `import importlib.metadata as m; assert m.version('mlx-audio') == '${MLX_AUDIO.split('==')[1]}'`]).exitCode === 0;
if (!ok) {
  console.log(`- ${MLX_AUDIO} into ${path.relative(ROOT, ENV)}/venv`);
  run('uv venv', ['uv', 'venv', '--quiet', '--python', '3.12', path.join(ENV, 'venv')]);
  run('uv pip install', ['uv', 'pip', 'install', '--quiet', '--python', PY, MLX_AUDIO]);
}
console.log(`- ${MODEL} @ ${REVISION.slice(0, 8)}`);
const modelDir = run('model download', [PY, '-c', `from huggingface_hub import snapshot_download; print(snapshot_download(${JSON.stringify(MODEL)}, revision=${JSON.stringify(REVISION)}))`]).trim().split('\n').pop()!;
const tools = run('versions', [PY, '-c', "import importlib.metadata as m; print(', '.join(f'{p} {m.version(p)}' for p in ('mlx-audio', 'mlx', 'transformers')))"]).trim();

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, 'prompts'), { recursive: true });
const job = path.join(OUT, 'job.json');
writeFileSync(job, JSON.stringify({ model_dir: modelDir, text: TEXT, language: english ? 'English' : 'Chinese', seed: SEED, out: path.join(OUT, 'prompts'), candidates }, null, 1));
console.log(`designing ${Object.keys(candidates).length} voice(s)...`);
const made = run('audio/voice_design.py', [PY, '-I', path.join(ROOT, 'audio', 'voice_design.py'), job]).split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));

// transcribe each clip back
const asr = run('speech transcribe-batch', ['speech', 'transcribe-batch', path.join(OUT, 'prompts'), '--language', english ? 'english' : 'chinese', '--jsonl']);
const heard = new Map<string, string>();
for (const l of asr.split('\n').filter((x) => x.trim().startsWith('{'))) {
  const r = JSON.parse(l);
  const f = String(r.file ?? r.path ?? r.audio ?? '');
  heard.set(path.basename(f).replace(/\.[^.]+$/, ''), String(r.text ?? r.transcript ?? ''));
}
const norm = (s: string) => s.replace(/[\s\p{P}]/gu, '').replace(/[他她]/g, '它').toLowerCase();

const rows = [];
for (const c of made) {
  const wav = path.join(OUT, `${c.key}-sample.wav`);
  run(`speech speak (${c.key})`, ['speech', 'speak', SAMPLE, '--engine', 'cosyvoice', '--language', english ? 'english' : 'chinese',
    '--cosy-bundle-dir', BUNDLE, '--cosy-speech-tokenizer', path.join(BUNDLE, 'speech_tokenizer.safetensors'),
    '--voice-sample', c.file, '--cosy-reference-transcript', TEXT, '--seed', '42', '-o', wav]);
  run(`mp3 (${c.key})`, ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-q:a', '2', path.join(OUT, `${c.key}-sample.mp3`)]);
  rmSync(wav, { force: true });
  const transcript = heard.get(c.key) ?? '';
  rows.push({ ...c, description: candidates[c.key], transcript, saysText: norm(transcript) === norm(TEXT), sample: path.join(OUT, `${c.key}-sample.mp3`) });
}
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ voice: ID, model: MODEL, revision: REVISION, tools, text: TEXT, sample: SAMPLE, language: english ? 'English' : 'Chinese', seed: SEED, candidates: rows }, null, 1) + '\n');
for (const r of rows) console.log(`${r.key}: ${r.seconds}s, median F0 ${r.f0} Hz, ${r.saysText ? 'says its text' : `heard "${r.transcript}"`}  ->  ${path.relative(ROOT, r.sample)}`);
console.log(`listen to the samples, then: just voice-design ${ID} --pick <key>`);
