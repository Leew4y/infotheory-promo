"""Final mix of a film: its music with the narration over it, ducked, then mastered (synth.master: two-pass loudnorm to
-16 LUFS, true peak <= -1.5 dBTP, checked).

    uv run --project audio python audio/mix.py --film <film> [--music out/<film>/music.wav | none]
                                               [--placements out/<film>/narration.cues.json]

Inputs: the placements the page reports (bun scripts/export.ts --film <film> --narration: the film's duration and
where every line plays), the lock films/<film>/narration.lock.json, and each line's audio films/<film>/narration/<id>.flac,
whose sha256 must be the lock's. Each line is levelled to VOICE_RMS over its speech; the music is lowered by DUCK_DB
from PRE seconds before a line to POST seconds after it, with smooth edges (RAMP).
Outputs: out/<film>/master.wav (the export muxes it), master.mp3 (preview), master.json (sha256 of the music, the lock
and the placements it was made from: the export refuses a master that no longer matches them).
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import wave

import numpy as np
from scipy.signal import lfilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import synth  # noqa: E402

SR = synth.SR
VOICE_RMS_DB = -20.0
DUCK_DB = -12.0
PRE, POST, RAMP = 0.15, 0.30, 0.12


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def placements_digest(placements):
    """The placements' identity, computed the same way by scripts/export.ts (id, start, duration to 1 µs)."""
    text = '\n'.join(f"{p['id']}:{p['t']:.6f}:{p['dur']:.6f}" for p in placements)
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def decode(path, channels):
    """Any audio file -> float32 array (channels, n) at SR, via ffmpeg."""
    out = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', str(channels), '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).reshape(-1, channels).T.copy()


def smooth(mask, seconds):
    """A 0/1 mask with its edges eased over about `seconds` (one-pole forward and backward)."""
    a = np.exp(-1 / (seconds * SR / 3))
    y = lfilter([1 - a], [1, -a], mask)
    return lfilter([1 - a], [1, -a], y[::-1])[::-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--film', required=True)
    ap.add_argument('--music')
    ap.add_argument('--placements')
    a = ap.parse_args()
    film = a.film
    if not film.replace('-', '').isalnum() or film != film.lower():
        raise SystemExit(f'--film {film}: lowercase letters, digits, hyphens')
    out_dir = os.path.join(ROOT, 'out', film)
    music_path = a.music or os.path.join(out_dir, 'music.wav')
    cues_path = a.placements or os.path.join(out_dir, 'narration.cues.json')
    lock_path = os.path.join(ROOT, 'films', film, 'narration.lock.json')
    for p, how in [(cues_path, f'bun scripts/export.ts --film {film} --narration'), (lock_path, f'just narrate {film}')]:
        if not os.path.exists(p):
            raise SystemExit(f'{os.path.relpath(p, ROOT)} not found: run {how}')
    cues = synth.load_json(cues_path)
    lock = synth.load_json(lock_path)
    if cues.get('film') != film or lock.get('film') != film:
        raise SystemExit('the placements or the lock belong to another film')
    duration, placements = float(cues['duration']), cues['placements']
    synth.init({'bpm': 60, 'duration': duration, 'scenes': []})
    n = int(round(duration * SR))

    # music bed (or silence)
    if music_path == 'none':
        music, music_sha = np.zeros((2, n), np.float32), 'none'
    else:
        if not os.path.exists(music_path):
            raise SystemExit(f'{os.path.relpath(music_path, ROOT)} not found: run just music {film}, or pass --music none')
        music, music_sha = decode(music_path, 2), sha256_file(music_path)
        music = music[:, :n] if music.shape[1] >= n else np.pad(music, ((0, 0), (0, n - music.shape[1])))

    # narration, checked against the lock and levelled
    voice = np.zeros(n, np.float32)
    duck = np.zeros(n, np.float32)
    for p in placements:
        e = lock['lines'].get(p['id'])
        if e is None:
            raise SystemExit(f"line {p['id']} is placed but not in the lock: run just narrate {film}")
        f = os.path.join(ROOT, 'films', film, 'narration', f"{p['id']}.flac")
        if not os.path.exists(f) or sha256_file(f) != e['sha256']:
            raise SystemExit(f"{os.path.relpath(f, ROOT)} is missing or not the audio in the lock (sha256)")
        x = decode(f, 1)[0]
        rms = float(np.sqrt(np.mean(x.astype(np.float64) ** 2))) or 1.0
        x = x * (10 ** (VOICE_RMS_DB / 20) / rms)
        i = int(round(p['t'] * SR))
        if i < 0 or i + len(x) > n:
            raise SystemExit(f"line {p['id']} ({p['t']:.3f}s + {len(x) / SR:.3f}s) does not fit in the film ({duration:.3f}s)")
        voice[i:i + len(x)] += x
        duck[max(0, i - int(PRE * SR)):min(n, i + len(x) + int(POST * SR))] = 1
    gain = 1 - (1 - 10 ** (DUCK_DB / 20)) * np.clip(smooth(duck, RAMP), 0, 1)
    mix = (music * gain.astype(np.float32) + voice[None, :]).astype(np.float32)
    peak = float(np.max(np.abs(mix))) or 1.0
    mix /= max(1.0, peak / 0.89)  # headroom before loudnorm; the master stage sets the level

    os.makedirs(out_dir, exist_ok=True)
    mix_path, wav_path = os.path.join(out_dir, 'master.mix.wav'), os.path.join(out_dir, 'master.wav')
    with wave.open(mix_path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(mix, -1, 1).T * 32767).astype(np.int16).tobytes())
    try:
        synth.master(mix_path, wav_path)
    finally:
        os.remove(mix_path)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_path, '-b:a', '192k', os.path.join(out_dir, 'master.mp3')], check=True)
    music_meta = 'none' if music_sha == 'none' else {'path': os.path.abspath(music_path), 'sha256': music_sha}
    meta = {'film': film, 'music': music_meta, 'lock': sha256_file(lock_path), 'placements': placements_digest(placements)}
    with open(os.path.join(out_dir, 'master.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=1)
    print(f'mix: {len(placements)} lines over {"silence" if music_sha == "none" else os.path.relpath(music_path, ROOT)} -> {os.path.relpath(wav_path, ROOT)}')


if __name__ == '__main__':
    main()
