"""Takes of grow1's narration in voice H on this Mac, checked by speech recognition.

    ~/envs/research/bin/python tools/grow1/voice_takes.py <out dir> <seeds, e.g. 1,2,3> [--engine cosyvoice|indextts2|voxcpm2]
        [--style <style>] [--ids a,b]

Voice H's own reference recording is not on this Mac, so the voice is cloned (through the `speech` tool) from two of
grow1's committed voice-H lines, s1-4 and g5b, joined with 0.3 s of silence. Engines (MLX bundles):
- cosyvoice (default): CosyVoice3-0.5B, full zero-shot (prompt tokens + features, with the prompt's exact transcript);
  styles plain, chat. The seed fixes the sampling.
- indextts2: IndexTTS2 (fp16), cloned from the prompt audio; styles plain (emotion from the prompt), calm (the tool's
  calm preset at weight 0.6). The tool has no seed for it and the same text gives the same audio, so the "seed" picks
  the model's speaking rate instead (INDEX_RATES: take 1 at 1.0, 2 at 0.95, 3 at 0.9, 4 at 1.05).
- voxcpm2: VoxCPM2 (int8). plain: continuation cloning (prompt audio + its transcript, the same clip as reference).
  chat: reference-only cloning with a plain-Chinese style instruction (with continuation the tool reads the
  instruction aloud: 44 of 44 takes on 2026-11-28). No seed either.
A style other than plain is written into the take's style as <engine>-<style> (cosyvoice keeps plain / chat).
Each take is trimmed of the silence before and after the
speech (10 ms frames above -45 dBFS and the take's loudest frame - 30 dB; 30 ms kept), written as 24 kHz 16-bit mono,
and transcribed with Qwen3-ASR 1.7B (8-bit, local). One JSON line per take goes to <out dir>/takes.jsonl:
{id, seed, style, file, seconds, asr, match} where match compares the transcript with the line's text, punctuation and
spaces removed. The tool reads markup aloud (<strong>, [ch][áng], an instruct wrapper), so the texts have none.
"""
import json
import os
import subprocess
import sys
import wave

import numpy as np

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
BUNDLE = os.path.join(REPO, '.cache', 'tts', 'models', 'CosyVoice3-0.5B-MLX-bf16')
ASR = 'aufklarer/Qwen3-ASR-1.7B-MLX-8bit'
REF_LINES = ('s1-4', 'g5b')
REF_TEXT = '八倍的体重，压在四倍的截面上：每平方厘米，扛两倍。头顶到了五楼。五楼的邻居，我替你道过歉了。'
CHAT = '请用自然的口语说，像在跟朋友聊天，不要播音腔。'
STYLES = {
    'cosyvoice': {'plain': [], 'chat': ['--cosy-instruct', CHAT]},
    'indextts2': {'plain': [], 'calm': ['--indextts2-emotion', 'calm', '--indextts2-emotion-weight', '0.6']},
    'voxcpm2': {'plain': [], 'chat': ['--voxcpm2-instruct', '自然的口语，像跟朋友聊天，语速适中']},
}

# the spoken-style script (films/grow1/docs/voice_script_real.md), numbers written as they are read
LINES = {
    's1-1': '假如你每天长高一倍。我算过了。',
    'g1': '第一天，三点四米，头顶到二楼。',
    's1-2': '长、宽、厚，各翻一倍，体重八倍，五百六十公斤。',
    's1-3': '可骨头的截面，只算宽和厚，只有四倍。',
    's1-4': '八倍的体重，压在四倍的骨头上，每平方厘米，扛两倍。',
    's1-5': '再翻一倍。',
    's1-7': '再翻一倍。',
    's1-8b': '五百一十二倍，三十五点八四吨。每平方厘米，扛八倍。',
    'g5b': '头顶到了五楼。五楼的阿姨，我替你道过歉了。',
    's1-10': '扛两倍，就是你背着另一个你。扛八倍，背七个。',
    'g9': '第几天，骨头会扛不住？正片里，算给你看。',
    # the trimmed script (159 -> 142 syllables, the numbers unchanged), so the script fits 40 s at the voice's own pace
    's1-3t': '可骨头的截面，只有四倍。',
    's1-4t': '八倍压在四倍上，每平方厘米，扛两倍。',
    's1-8bt': '五百一十二倍，三十五点八四吨，扛八倍。',
    's1-10t': '扛两倍，就是背着另一个你。扛八倍，背七个。',
}
INDEX_RATES = {1: 1.0, 2: 0.95, 3: 0.9, 4: 1.05}
PUNCT = set('，。、；：？！—… ,.?!;:')


def bare(s):
    return ''.join(ch for ch in s if ch not in PUNCT)


def prompt(out_dir):
    p = os.path.join(out_dir, 'prompt.wav')
    if not os.path.exists(p):
        a, b = (os.path.join(REPO, 'films', 'grow1', 'narration', f'{i}.flac') for i in REF_LINES)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a, '-i', b, '-filter_complex',
                        '[0:a]aresample=24000,aformat=channel_layouts=mono[a];[1:a]aresample=24000,aformat=channel_layouts=mono[b];'
                        'anullsrc=r=24000:cl=mono,atrim=0:0.3[s];[a][s][b]concat=n=3:v=0:a=1', '-c:a', 'pcm_s16le', p], check=True)
    return p


def trim(path):
    with wave.open(path) as w:
        rate = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32768
    if x.size == 0:
        return 0.0
    fr = rate // 100
    n = len(x) // fr
    db = 20 * np.log10(np.sqrt((x[:n * fr].reshape(n, fr) ** 2).mean(axis=1)) + 1e-9)
    loud = db > max(-45.0, db.max() - 30.0)
    run = np.convolve(loud.astype(int), np.ones(5, int), 'valid') == 5
    idx = np.where(run)[0]
    if idx.size == 0:
        return 0.0
    a = max(0, idx[0] * fr - 3 * fr)
    b = min(len(x), (idx[-1] + 5) * fr + 3 * fr)
    y = (np.clip(x[a:b], -1, 1) * 32767).astype(np.int16)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(y.tobytes())
    return len(y) / rate


def synth(text, seed, engine, style, ref, out):
    cmd = ['speech', 'speak', '--engine', engine, '--language', 'chinese', '-o', out]
    if engine == 'cosyvoice':
        cmd += ['--cosy-bundle-dir', BUNDLE, '--cosy-speech-tokenizer', os.path.join(BUNDLE, 'speech_tokenizer.safetensors'),
                '--voice-sample', ref, '--cosy-reference-transcript', REF_TEXT, '--seed', str(seed)]
    elif engine == 'indextts2':
        cmd += ['--voice-sample', ref, '--indextts2-speaking-rate', str(INDEX_RATES.get(seed, 1.0))]
    elif engine == 'voxcpm2':
        cmd += ['--voxcpm2-variant', 'int8', '--voxcpm2-ref-audio', ref]
        if style == 'plain':           # with continuation the tool reads a style instruction aloud, so chat clones without it
            cmd += ['--voxcpm2-prompt-audio', ref, '--voxcpm2-prompt-text', REF_TEXT]
    p = subprocess.run(cmd + STYLES[engine][style] + ['--', text], capture_output=True, text=True)
    log = p.stdout + p.stderr
    if p.returncode or not os.path.exists(out):
        sys.exit(f'speech failed:\n{log[-2000:]}')
    if engine == 'cosyvoice' and 'prompt_token + prompt_feat' not in log:
        sys.exit(f'speech fell back to speaker-only cloning:\n{log[-2000:]}')


def asr(path):
    p = subprocess.run(['speech', 'transcribe', '-m', ASR, '--language', 'chinese', path], capture_output=True, text=True)
    for line in (p.stdout + p.stderr).splitlines():
        if line.startswith('Result:'):
            return line[len('Result:'):].strip()
    return ''


def main():
    out_dir = os.path.abspath(sys.argv[1])
    seeds = [int(s) for s in sys.argv[2].split(',')]
    args = sys.argv[3:]
    engine = args[args.index('--engine') + 1] if '--engine' in args else 'cosyvoice'
    style = args[args.index('--style') + 1] if '--style' in args else 'plain'
    if style not in STYLES.get(engine, {}):
        sys.exit(f'unknown engine or style: {engine} {style}')
    tag = style if engine == 'cosyvoice' else f'{engine}-{style}'
    ids = args[args.index('--ids') + 1].split(',') if '--ids' in args else list(LINES)
    os.makedirs(out_dir, exist_ok=True)
    ref = prompt(out_dir)
    with open(os.path.join(out_dir, 'takes.jsonl'), 'a', encoding='utf-8') as log:
        for i in ids:
            for seed in seeds:
                f = os.path.join(out_dir, f'{i}_{tag}_{seed}.wav')
                synth(LINES[i], seed, engine, style, ref, f)
                secs = trim(f)
                text = asr(f)
                rec = dict(id=i, seed=seed, style=tag, file=f, seconds=round(secs, 2), asr=text,
                           match=bare(text) == bare(LINES[i]))
                log.write(json.dumps(rec, ensure_ascii=False) + '\n'); log.flush()
                print(f"{i:6s} {tag:5s} seed {seed:3d}  {secs:5.2f} s  {'OK ' if rec['match'] else 'BAD'} {text}", flush=True)


if __name__ == '__main__':
    main()
