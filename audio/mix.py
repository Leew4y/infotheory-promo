"""Final mix of a film: its music with the narration over it, then mastered (synth.master: two-pass loudnorm to
-16 LUFS, true peak <= -1.5 dBTP, checked).

    uv run --project audio python audio/mix.py --film <film> [--music out/<film>/music.wav | <file> | none]
                                               [--placements out/<film>/narration.cues.json]

Inputs: the placements the page reports (bun scripts/export.ts --film <film> --narration: the film's frame count and
rate, its bar length, where every line plays, and the placements' digest), the lock films/<film>/narration.lock.json and
each line's audio films/<film>/narration/<id>.flac, whose sha256 must be the lock's. A film without narration (no lock,
no placements) is mixed from its music alone.

Levels: every line is levelled to VOICE_RMS_DB over its speech; the music is set so that, away from the narration, it
sits BED_BELOW_DB under the voice, and it is lowered a further DUCK_DB from PRE seconds before a line to POST seconds
after it (smooth edges). After mastering, every line's window must be at least MIN_LIFT_DB louder (RMS) than the music
alone away from the narration; otherwise the mix fails and nothing is published.

Length: the film lasts ceil(frames / fps x SR) samples. Music longer than the film is cut with a FADE_OUT fade; shorter
music is looped, each repeat cut on a bar line (when the film has a bar grid) and joined with an equal-power crossfade
of XFADE seconds.

Outputs, published together only when everything passed (temporary files, then renamed): out/<film>/master.wav (the
export muxes it), master.mp3 (the preview plays it) and master.json (what the master was made from: frames, fps, the
placements' digest, the lock's sha256, the music's path and sha256, the master's own sha256), so the export can refuse a
master that no longer matches the film.
"""
import argparse
import hashlib
import json
import math
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
BED_BELOW_DB = 10.0
DUCK_DB = -10.0
MIN_LIFT_DB = 6.0
PRE, POST, RAMP = 0.15, 0.30, 0.12
XFADE, FADE_OUT = 1.0, 2.0
MIX_VERSION = 2


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def snapshot(path):
    """The bytes of an input and their sha256, read once: what is decoded is exactly what master.json names."""
    with open(path, 'rb') as f:
        data = f.read()
    return data, hashlib.sha256(data).hexdigest()


def decode(src, channels):
    """An audio file (path) or its bytes -> float32 array (channels, n) at SR, via ffmpeg."""
    data = src if isinstance(src, bytes) else None
    out = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'pipe:0' if data is not None else src, '-f', 'f32le', '-ac', str(channels), '-ar', str(SR), '-'],
                         input=data, capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).reshape(-1, channels).T.copy()


def smooth(mask, seconds):
    """A 0/1 mask with its edges eased over about `seconds` (one-pole forward and backward)."""
    a = np.exp(-1 / (seconds * SR / 3))
    y = lfilter([1 - a], [1, -a], mask)
    return lfilter([1 - a], [1, -a], y[::-1])[::-1]


def rms_db(x):
    x = np.asarray(x, np.float64)
    return 10 * math.log10(float(np.mean(x * x)) + 1e-20) if x.size else -math.inf


def fit_music(music, n, bar):
    """Music of exactly n samples: cut with a fade-out, or looped (cuts on bar lines, equal-power crossfades)."""
    m = music.shape[1]
    fade = int(FADE_OUT * SR)
    if m >= n:
        out = music[:, :n].copy()
        if m > n:
            k = min(fade, n)
            out[:, n - k:] *= np.cos(np.linspace(0, np.pi / 2, k, dtype=np.float32)) ** 2
        return out
    xf = int(XFADE * SR)
    loop = m
    if bar > 0:
        # whole bars plus the crossfade, so every repeat starts on a bar line
        bars = int((m - xf) // (bar * SR))
        if bars < 1:
            raise SystemExit(f'the music ({m / SR:.2f}s) is shorter than one bar ({bar:.2f}s) plus the {XFADE}s crossfade: it cannot loop on bar lines')
        loop = int(round(bars * bar * SR)) + xf
    if loop - xf <= 0:
        raise SystemExit(f'the music ({m / SR:.2f}s) is too short to loop with a {XFADE}s crossfade')
    out = np.zeros((2, n), np.float32)
    fin = np.sin(np.linspace(0, np.pi / 2, xf, dtype=np.float32))
    fout = np.cos(np.linspace(0, np.pi / 2, xf, dtype=np.float32))
    seg = music[:, :loop].copy()
    pos = 0
    first = True
    while pos < n:
        s = seg.copy()
        if not first:
            s[:, :xf] *= fin
        s[:, loop - xf:] *= fout
        k = min(loop, n - pos)
        out[:, pos:pos + k] += s[:, :k]
        pos += loop - xf
        first = False
    k = min(fade, n)
    out[:, n - k:] *= np.cos(np.linspace(0, np.pi / 2, k, dtype=np.float32)) ** 2
    return out


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
    if not os.path.exists(cues_path):
        raise SystemExit(f'{os.path.relpath(cues_path, ROOT)} not found: run bun scripts/export.ts --film {film} --narration')
    cues = synth.load_json(cues_path)
    if cues.get('film') != film:
        raise SystemExit('the placements belong to another film')
    placements = cues['placements']
    lock_bytes, lock_sha = snapshot(lock_path) if os.path.exists(lock_path) else (None, 'none')
    lock = json.loads(lock_bytes.decode('utf-8')) if lock_bytes is not None else None
    if placements and lock is None:
        raise SystemExit(f'{os.path.relpath(lock_path, ROOT)} not found: run just narrate {film}')
    if lock is not None and lock.get('film') != film:
        raise SystemExit('the narration lock belongs to another film')
    frames, fps = int(cues['frames']), int(cues['fps'])
    duration = frames / fps
    n = -(-frames * SR // fps)  # ceil: the audio never ends before the last frame
    synth.init({'bpm': cues.get('bpm') or 60, 'duration': n / SR, 'scenes': []})

    # narration, checked against the lock and levelled
    voice = np.zeros(n, np.float32)
    duck = np.zeros(n, np.float32)
    windows = []
    for p in placements:
        e = lock['lines'].get(p['id'])
        if e is None:
            raise SystemExit(f"line {p['id']} is placed but not in the lock: run just narrate {film}")
        f = os.path.join(ROOT, 'films', film, 'narration', f"{p['id']}.flac")
        data, sha = snapshot(f) if os.path.exists(f) else (None, None)
        if sha != e['sha256']:
            raise SystemExit(f"{os.path.relpath(f, ROOT)} is missing or not the audio in the lock (sha256)")
        x = decode(data, 1)[0]
        x = x * (10 ** (VOICE_RMS_DB / 20) / max(10 ** (rms_db(x) / 20), 1e-9))
        i = int(round(p['t'] * SR))
        over = i + len(x) - n
        if over > 0:
            if over > int(0.01 * SR):
                raise SystemExit(f"line {p['id']} ({p['t']:.3f}s + {len(x) / SR:.3f}s) does not fit in the film ({duration:.3f}s)")
            x = x[:len(x) - over]  # resampling rounding at the very end of the film
        voice[i:i + len(x)] += x
        duck[max(0, i - int(PRE * SR)):min(n, i + len(x) + int(POST * SR))] = 1
        windows.append((p['id'], i, i + len(x)))
    away = duck == 0  # the music alone, away from the narration

    # music bed (or silence): fitted to the film, set under the voice, ducked under each line
    if music_path == 'none':
        music, music_meta = np.zeros((2, n), np.float32), 'none'
    else:
        if not os.path.exists(music_path):
            raise SystemExit(f'{os.path.relpath(music_path, ROOT)} not found: run just music {film}, or pass --music none')
        music_bytes, music_sha = snapshot(music_path)
        music = fit_music(decode(music_bytes, 2), n, float(cues.get('bar') or 0))
        rel = os.path.relpath(os.path.abspath(music_path), ROOT)
        inside = not rel.startswith('..') and not os.path.isabs(rel)
        music_meta = {'path': rel.replace(os.sep, '/') if inside else os.path.abspath(music_path), 'external': not inside, 'sha256': music_sha}
    if placements and music_meta != 'none':
        bed = rms_db(music[:, away]) if away.any() else rms_db(music)
        if bed > -math.inf:
            music *= np.float32(10 ** ((VOICE_RMS_DB - BED_BELOW_DB - bed) / 20))
    gain = 1 - (1 - 10 ** (DUCK_DB / 20)) * np.clip(smooth(duck, RAMP), 0, 1)
    bed_only = music.mean(axis=0)  # the music at full level (before ducking), for the check when no part is music alone
    mix = (music * gain.astype(np.float32) + voice[None, :]).astype(np.float32)
    peak = float(np.max(np.abs(mix))) or 1.0
    mix /= max(1.0, peak / 0.89)  # headroom before loudnorm; the master stage sets the level

    # master into temporary files; check; publish together (one mix per film at a time)
    os.makedirs(out_dir, exist_ok=True)
    lock_dir = os.path.join(out_dir, '.mix.lock')
    try:
        os.mkdir(lock_dir)
    except FileExistsError:
        raise SystemExit(f'another mix of {film} is running (or one crashed: remove {lock_dir})')
    tag = f'{os.getpid()}.tmp'
    mix_path = os.path.join(out_dir, f'master.mix.{tag}.wav')
    tmp = {k: os.path.join(out_dir, f'master.{tag}.{k}') for k in ('wav', 'mp3', 'json')}
    try:
        with wave.open(mix_path, 'wb') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((np.clip(mix, -1, 1).T * 32767).astype(np.int16).tobytes())
        synth.master(mix_path, tmp['wav'])
        if windows and music_meta != 'none':
            if away.any():
                # the master: every line's window against the music alone, away from the narration
                y = decode(tmp['wav'], 1)[0]
                bed_db = rms_db(y[:n][away])
                lifts = [(lid, rms_db(y[s:e]) - bed_db) for lid, s, e in windows]
            else:
                # narration everywhere, so no music alone in the master: the mix before mastering (mastering is one
                # linear gain plus a peak limiter), each window against the music at full level in that window
                mono = mix.mean(axis=0)
                lifts = [(lid, rms_db(mono[s:e]) - rms_db(bed_only[s:e])) for lid, s, e in windows]
            low = [f'{lid} {d:.1f} dB' for lid, d in lifts if d < MIN_LIFT_DB]
            if low:
                raise SystemExit(f'narration not clear of the music by {MIN_LIFT_DB} dB in: {", ".join(low)}')
            print('lines over the music: ' + ', '.join(f'{lid} {d:.1f} dB' for lid, d in lifts))
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp['wav'], '-b:a', '192k', '-f', 'mp3', tmp['mp3']], check=True)
        meta = {
            'version': MIX_VERSION, 'film': film, 'frames': frames, 'fps': fps, 'placements': cues['digest'],
            'lock': lock_sha, 'music': music_meta, 'master': sha256_file(tmp['wav']),
        }
        with open(tmp['json'], 'w', encoding='utf-8') as f:
            json.dump(meta, f, indent=1)
        # publish: the old set aside, the new one in (the manifest last); a failure before the manifest is in puts the
        # old set back; after that, only cleanup (warnings)
        final = {k: os.path.join(out_dir, f'master.{k}') for k in ('wav', 'mp3', 'json')}
        aside = []
        try:
            for k in ('wav', 'mp3', 'json'):
                bak = f'{final[k]}.{tag}.bak'
                had = os.path.exists(final[k])
                if had:
                    os.replace(final[k], bak)
                aside.append((final[k], bak if had else None))
                os.replace(tmp[k], final[k])
        except Exception:
            for f, bak in reversed(aside):
                try:
                    if os.path.exists(f):
                        os.remove(f)
                    if bak:
                        os.replace(bak, f)
                except OSError as e:
                    print(f'could not restore {f}: {e}', file=sys.stderr)
            raise
        for _, bak in aside:
            if bak:
                try:
                    os.remove(bak)
                except OSError as e:
                    print(f'warning: could not remove {bak}: {e}', file=sys.stderr)
    finally:
        for p in [mix_path, *tmp.values()]:
            if os.path.exists(p):
                os.remove(p)
        os.rmdir(lock_dir)
    print(f'mix: {len(placements)} lines over {"silence" if music_meta == "none" else os.path.relpath(music_path, ROOT)} -> {os.path.relpath(os.path.join(out_dir, "master.wav"), ROOT)}')


if __name__ == '__main__':
    main()
