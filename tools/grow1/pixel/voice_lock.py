"""Write the pixel cut's narration in the new voice from a voice_pick.py choice.

    ~/envs/research/bin/python tools/grow1/pixel/voice_lock.py <picked json> [--out dir]

The picked json is voice_pick.py's picked_<style>[_natural][_trim].json (each line's chosen take: file, seed, asr, sim).
Writes to --out (default films/grow1/pixel_voice/):
- narration/<id>.flac: each chosen take as the engine made it (trimmed of the silence around it by voice_takes.py),
  FLAC at its own rate. The ids are the line slots of the v2 script (s1-1, g1, ... g9); a trimmed take (s1-3t) fills
  the slot of its line (s1-3).
- narration.json: the lines in order: id, text (what the captions show, numbers as digits), said (the words spoken),
  pause (the silence after the line, s: GAPS, the gaps of ordinary speech that voice_pick.py --natural joins with,
  longer after g5b for the picture).
- narration.lock.json: per line text, said, duration (s, from the sample count), sha256 of the FLAC, spans (the speech
  between pauses, measured as scripts/narrate.ts does: 10 ms frames of 16 kHz mono louder than both -45 dBFS and the
  loudest frame - 30 dB, a pause at least 0.15 s, spans under 50 ms dropped), chars (each character's start and end, s,
  from forced alignment of the words spoken: `speech align`, Qwen3-ForcedAligner; 80 ms steps, approximate, for finding
  which span a word is in), start (the line's start in the film, s) and the take (engine, style, take, file, transcript,
  speaker similarity to voice H). Also the engine, the model and how the voice was cloned.
Nothing is written unless every take's transcript matches the words spoken (punctuation aside).
"""
import hashlib
import json
import os
import re
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO, 'tools', 'grow1'))
from voice_takes import LINES, REF_LINES, bare  # noqa: E402

ORDER = ['s1-1', 'g1', 's1-2', 's1-3', 's1-4', 's1-5', 's1-7', 's1-8b', 'g5b', 's1-10', 'g9']
GAPS = {'s1-1': 0.5, 's1-5': 0.35, 'g5b': 0.95}   # the rest 0.45 s; none after the last line. After g5b the
# 「已道歉」 stamp holds about 1 s before the cut to today, which lands on 「扛两倍」
GAP = 0.45
# what the captions show (numbers as digits), per take id
TEXT = {
    's1-1': '假如你每天长高一倍。我算过了。',
    'g1': '第 1 天，3.4 米，头顶到 2 楼。',
    's1-2': '长、宽、厚，各翻一倍，体重 8 倍，560 公斤。',
    's1-3': '可骨头的截面，只算宽和厚，只有 4 倍。',
    's1-3t': '可骨头的截面，只有 4 倍。',
    's1-4': '8 倍的体重，压在 4 倍的骨头上，每平方厘米，扛两倍。',
    's1-4t': '8 倍压在 4 倍上，每平方厘米，扛两倍。',
    's1-5': '再翻一倍。',
    's1-7': '再翻一倍。',
    's1-8b': '512 倍，35.84 吨。每平方厘米，扛 8 倍。',
    's1-8bt': '512 倍，35.84 吨，扛 8 倍。',
    'g5b': '头顶到了 5 楼。5 楼的阿姨，我替你道过歉了。',
    's1-10': '扛两倍，就是你背着另一个你。扛 8 倍，背七个。',
    's1-10t': '扛两倍，就是背着另一个你。扛 8 倍，背七个。',
    'g9': '第几天，骨头会扛不住？正片里，算给你看。',
}
ENGINES = {
    'indextts2': ('IndexTTS2', 'IndexTeam/IndexTTS-2 as the MLX bundle aufklarer/IndexTTS2-MLX-fp16'),
    'voxcpm2': ('VoxCPM2', 'openbmb/VoxCPM2 as the MLX bundle aufklarer/VoxCPM2-MLX-int8'),
    'cosyvoice': ('CosyVoice3', 'FunAudioLLM/Fun-CosyVoice3-0.5B-2512 as the MLX bundle CosyVoice3-0.5B-MLX-bf16'),
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def pcm16k(path):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'],
                       capture_output=True, check=True)
    return np.frombuffer(p.stdout, np.int16).astype(np.float64) / 32768


def spans(path):
    """scripts/narrate.ts speechSpans, the same rule."""
    x = pcm16k(path)
    n = 160
    rms = [float(np.sqrt(np.mean(x[i:i + n] ** 2))) for i in range(0, len(x), n)]
    floor = max(10 ** (-45 / 20), max(rms) * 10 ** (-30 / 20))
    runs = []
    for k, r in enumerate(rms):
        if r <= floor:
            continue
        if runs and k - runs[-1][1] <= 15:
            runs[-1][1] = k + 1
        else:
            runs.append([k, k + 1])
    return [[a / 100, b / 100] for a, b in runs if b - a >= 5]


def align(path, said):
    p = subprocess.run(['speech', 'align', path, '--text', said, '--language', 'chinese'], capture_output=True, text=True)
    out = []
    for line in (p.stdout + p.stderr).splitlines():
        m = re.match(r'\[(\d+\.\d+)s - (\d+\.\d+)s\] (\S+)', line.strip())
        if m:
            out.append([bare(m.group(3)), float(m.group(1)), float(m.group(2))])
    if bare(''.join(c for c, _, _ in out)) != bare(said):
        sys.exit(f'{path}: the alignment does not spell the line ({"".join(c for c, _, _ in out)})')
    return out


def main():
    picked = json.load(open(sys.argv[1], encoding='utf-8'))
    out = os.path.abspath(sys.argv[sys.argv.index('--out') + 1]) if '--out' in sys.argv else os.path.join(REPO, 'films', 'grow1', 'pixel_voice')
    takes = {}
    for tid, v in picked.items():
        slot = tid[:-1] if tid not in ORDER and tid[:-1] in ORDER else tid
        takes[slot] = (tid, v)
    if list(takes) != ORDER:
        sys.exit(f'the picked lines are not the script: {list(takes)}')
    for slot, (tid, v) in takes.items():
        if bare(v['asr']) != bare(LINES[tid]):
            sys.exit(f'{tid}: the transcript {v["asr"]} is not the line {LINES[tid]}')
    os.makedirs(os.path.join(out, 'narration'), exist_ok=True)
    first = os.path.basename(next(iter(picked.values()))['file']).split('_')[1]     # <id>_<style>_<take>.wav
    engine = first.split('-')[0] if first.split('-')[0] in ENGINES else 'cosyvoice'
    lines, lock, t = [], {}, 0.0
    for k, slot in enumerate(ORDER):
        tid, v = takes[slot]
        flac = os.path.join(out, 'narration', f'{slot}.flac')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', v['file'], '-c:a', 'flac', flac], check=True)
        p = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', flac],
                                      capture_output=True, text=True, check=True).stdout)
        dur = round(float(p['format']['duration']), 3)
        pause = 0.0 if k == len(ORDER) - 1 else GAPS.get(slot, GAP)
        style = os.path.basename(v['file']).split('_')[1]
        lines.append({'id': slot, 'text': TEXT[tid], 'said': LINES[tid], 'pause': pause})
        lock[slot] = {'text': TEXT[tid], 'said': LINES[tid], 'duration': dur, 'sha256': sha256(flac), 'start': round(t, 3),
                      'spans': spans(flac), 'chars': align(flac, LINES[tid]),
                      'take': {'id': tid, 'style': style, 'take': v['seed'], 'file': os.path.basename(v['file']),
                               'transcript': v['asr'], 'similarity': round(v['sim'], 3)}}
        t += dur + pause
        print(f"{slot:6s} {lock[slot]['start']:6.2f}-{t - pause:6.2f} s  spans {len(lock[slot]['spans'])}  {TEXT[tid]}")
    name, model = ENGINES[engine]
    meta = {'film': 'grow1', 'cut': 'pixel', 'engine': name, 'model': model,
            'voice': f'zh-female-yujie (voice H), cloned from grow1\'s committed v2 lines {" + ".join(REF_LINES)} '
                     '(the original reference recording is not on this machine)',
            'made_with': 'tools/grow1/voice_takes.py, voice_pick.py --natural, tools/grow1/pixel/voice_lock.py',
            'end': round(t, 3)}
    json.dump({**meta, 'lines': lines}, open(os.path.join(out, 'narration.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump({**meta, 'lines': lock}, open(os.path.join(out, 'narration.lock.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{len(ORDER)} lines, the voice ends at {t:.2f} s -> {os.path.relpath(out, REPO)}')


if __name__ == '__main__':
    main()
