"""Music and sound design for the light film.

    just cues light                       (films/light/cues.json, timeline.json)
    python films/light/audio/music.py     -> out/light/music.wav, music.mp3   (VSCO_SAMPLES = the VSCO 2 CE folder)

Music: an original score written against the picture (films/light/audio/score.py), played with recorded instruments
from the VSCO 2 Community Edition (CC0; upright piano by Simon Dalzell of Ivy Audio, string sections, harp, pizzicato)
through sampler.py (the samples are not in git: $VSCO_SAMPLES). Each section starts from its scene's start
time in the page's timeline, and its hits come from the cue sheet and the caption times, so the score follows the
timeline if it moves.

Dynamic arc: TARGET gives each scene's loudness relative to the definition chapter (the peak). The score is rendered,
each scene's level is measured, the per-scene gains are corrected and the score is rendered again (CAL_PASSES).
Sound effects are synthesized from the cue sheet. The instrument groups share a short hall, the effects a plate.
Master: a fixed gain to -17 LUFS (ffmpeg ebur128) and a 4x-oversampled true-peak limiter at -1.5 dBTP.
Also written, for checking: out/light/notes.json (every note), levels.json and stems/<group>.wav (not in git).
"""
import json
import os
import re
import subprocess
import wave

import numpy as np
from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d
from scipy.signal import butter, fftconvolve, lfilter, resample_poly, sosfilt

import score

HERE = os.path.dirname(os.path.abspath(__file__))
FILM = os.path.normpath(os.path.join(HERE, '..'))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'out', 'light'))
os.makedirs(OUT, exist_ok=True)
TL = json.load(open(os.path.join(FILM, 'timeline.json'), encoding='utf-8'))
SR = 44100
TOTAL = TL['duration']
# the score's grid: effective tempo (bpm / stretch), scenes and captions in film seconds
GRID = {'bpm': TL['bpm'], 'stretch': TL.get('stretch', 1.0), 'total': TOTAL,
        'scenes': [{'name': x['name'], 'start': x['start'], 'end': x['end']} for x in TL['scenes']]}
BAR = 4 * 60 / GRID['bpm']
N = int((TOTAL + 1) * SR)
F32 = np.float32
TAU = 2 * np.pi
rng = np.random.default_rng(11)
BUS = {k: np.zeros((2, N), F32) for k in ('sfx', 'sfxwet')}
GROUP_GAIN = {'piano': 1.0, 'strings': 0.75, 'harp': 0.95, 'pizz': 0.8}
GROUP_HALL = {'piano': 0.4, 'strings': 0.3, 'harp': 0.35, 'pizz': 0.2}
# scene loudness in dB relative to the definition chapter: a clear opening, a quiet start of the history, a slow rise
# as the measurements get better, the peak where the number is fixed, a calm close
TARGET = {'open': -4.0, 'lanterns': -8.0, 'roemer': -6.5, 'bradley': -6.0, 'wheel': -4.5, 'foucault': -5.0,
          'maxwell': -4.5, 'michelson': -4.0, 'laser': -3.0, 'definition': 0.0, 'coda': -4.0, 'sources': -8.0}
REF = 'definition'
CAL_PASSES = 2
MUSIC_RMS = -26.0  # dBFS: the whole score's RMS before the effects are added (sets the music / effects balance)
LUFS = -17.0  # leaves the climax room under the true-peak ceiling; narration would sit on top later
CEIL = -1.5  # dBTP


def tv(dur):
    return np.arange(max(1, int(dur * SR))) / SR


def noise(n):
    return rng.standard_normal(n).astype(F32)


def put(sig, t0, bus, gain=1.0, pan=0.0, wet=0.0):
    if gain == 0:
        return
    sig = np.asarray(sig, F32)
    if sig.ndim == 1:
        a = (np.clip(pan, -1, 1) + 1) * np.pi / 4
        sig = np.stack([sig * np.cos(a), sig * np.sin(a)]) * 1.4142
    i = int(round(t0 * SR))
    if i < 0:
        sig = sig[:, -i:]
        i = 0
    n = min(sig.shape[1], N - i)
    if n <= 0:
        return
    seg = sig[:, :n] * gain
    BUS[bus][:, i:i + n] += seg
    if wet:
        BUS['sfxwet'][:, i:i + n] += seg * wet


def lp(x, f, o=2):
    return sosfilt(butter(o, min(f, SR * .45), 'low', fs=SR, output='sos'), x).astype(F32)


def bp(x, lo, hi, o=2):
    return sosfilt(butter(o, [max(lo, 10), min(hi, SR * .45)], 'band', fs=SR, output='sos'), x).astype(F32)


def hp(x, f, o=2):
    return sosfilt(butter(o, max(f, 10), 'high', fs=SR, output='sos'), x, axis=-1).astype(F32)


def biquad(x, kind, f0, gain_db, q=0.707):
    """RBJ cookbook low shelf / peaking EQ on a (2, n) signal."""
    A = 10 ** (gain_db / 40)
    w = TAU * f0 / SR
    cw, sw = np.cos(w), np.sin(w)
    if kind == 'lowshelf':
        al = sw / 2 * np.sqrt((A + 1 / A) * (1 / 0.9 - 1) + 2)
        b = [A * ((A + 1) - (A - 1) * cw + 2 * np.sqrt(A) * al), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - 2 * np.sqrt(A) * al)]
        a = [(A + 1) + (A - 1) * cw + 2 * np.sqrt(A) * al, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - 2 * np.sqrt(A) * al]
    else:
        al = sw / (2 * q)
        b = [1 + al * A, -2 * cw, 1 - al * A]
        a = [1 + al / A, -2 * cw, 1 - al / A]
    return lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=-1).astype(F32)


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)


cues = json.load(open(os.path.join(FILM, 'cues.json'), encoding='utf-8'))
GRID['subs'] = [{'a': c['start'], 'b': c['end'], 'zh': c['zh'], 'en': c['en'], 'scene': c['scene']} for c in TL.get('captions', [])]
SCENES = GRID['scenes']


def tame(x, pct=99.0, ratio=3.0):
    """Fast peak compressor for one bus: only the sharpest attacks (above the bus's 99th-percentile peak level) are
    reduced, 1 ms attack, 40 ms release; sustain and the dynamic arc are untouched."""
    env = np.max(np.abs(x), axis=0)
    thr = np.percentile(env[env > 1e-5], pct)
    tgt = np.where(env > thr, (env / thr) ** (1 / ratio - 1), 1.0)
    tgt = minimum_filter1d(tgt, int(0.001 * SR) * 2 + 1)
    a = np.exp(-1 / (0.04 * SR))
    g = np.minimum(tgt, lfilter([1 - a], [1, -a], tgt, zi=[tgt[0] * a])[0])
    return x * g.astype(F32)


def dry_mix(buses):
    out = np.zeros((2, N), F32)
    for k, v in buses.items():
        x = v * GROUP_GAIN.get(k, 1.0)
        if k == 'strings':
            x = biquad(biquad(biquad(x, 'lowshelf', 250, -3.0), 'peak', 350, -2.0, 1.0), 'peak', 6000, 2.5, 0.7)
        elif k == 'piano':
            x = biquad(x, 'peak', 300, -2.0, 1.0)
        out += x
    return out


def scene_db(x):
    out = {}
    for s in SCENES:
        i0, i1 = int((s['start'] + 0.3) * SR), int((s['end'] - 0.3) * SR)
        out[s['name']] = rms_db(x[:, i0:i1])
    return out


# ================================================================== the score, calibrated to the dynamic arc
level = {s['name']: 1.0 for s in SCENES}
for p in range(CAL_PASSES + 1):
    print(f'score (pass {p + 1})...')
    MUSIC = score.render(SR, N, GRID, cues, level)
    for k in ('piano', 'harp'):
        if k in MUSIC:
            MUSIC[k] = tame(MUSIC[k])
    lv = scene_db(dry_mix(MUSIC))
    ref = lv[REF]
    err = {k: (TARGET[k] - (v - ref)) for k, v in lv.items()}
    print('  scene dB vs target: ' + ', '.join(f'{k} {v - ref:+.1f}/{TARGET[k]:+.1f}' for k, v in lv.items()))
    if p == CAL_PASSES or max(abs(e) for e in err.values()) < 0.6:
        break
    for k in level:
        level[k] *= 10 ** (err[k] / 20)
json.dump({k: round(float(20 * np.log10(v)), 2) for k, v in level.items()}, open(os.path.join(OUT, 'levels.json'), 'w'), indent=1)

# for checking: every note with its time, and each instrument group as its own file (audio/stems/, not in git)
json.dump(score.render.log, open(os.path.join(OUT, 'notes.json'), 'w'), indent=0)
STEMS = os.path.join(OUT, 'stems')
os.makedirs(STEMS, exist_ok=True)
for k, v in MUSIC.items():
    with wave.open(os.path.join(STEMS, f'{k}.wav'), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(v.T, -1, 1) * 32000).astype(np.int16).tobytes())


# ================================================================== sound effects from the cue sheet
def fx_page(t, **o):
    tt = tv(.32)
    s = bp(noise(len(tt)), 600, 5000) * np.sin(np.pi * tt / .32) ** 2
    s += lp(noise(len(tt)), 200) * np.exp(-tt / .04) * .8
    put(s, t, 'sfx', .06, -.1, wet=.35)


def fx_ink(t, **o):
    tt = tv(.16)
    s = bp(noise(len(tt)), 1800, 7000) * np.sin(np.pi * tt / .16) ** 1.5
    put(s, t, 'sfx', .022, .15, wet=.25)


def fx_tick(t, gain=1.0, **o):
    tt = tv(.03)
    s = lp(noise(len(tt)), 3000) * np.exp(-tt / .004)
    put(s, t, 'sfx', .032 * gain, .05, wet=.3)


def fx_tone(t, **o):
    pass  # played by the score (harp)


def fx_chime(t, **o):
    pass  # played by the score (harp)


def fx_swell(t, dur=4.0, **o):
    tt = tv(dur)
    x = tt / dur
    put(lp(noise(len(tt)), 1200) * np.sin(np.pi * x) ** 2.5, t, 'sfx', .016, wet=.8)


def fx_breath(t, dur=2.0, **o):
    tt = tv(dur)
    x = tt / dur
    put(lp(noise(len(tt)), 900) * np.sin(np.pi * x) ** 3, t, 'sfx', .014, wet=.6)


def fx_low(t, **o):
    pass  # no synthesized pitches: the score carries the harmony


def fx_stamp(t, **o):
    tt = tv(.25)
    s = np.sin(TAU * 140 * tt) * np.exp(-tt / .05) + lp(noise(len(tt)), 800) * np.exp(-tt / .02) * .6
    put(s, t, 'sfx', .06, wet=.3)


FX = {k[3:]: v for k, v in list(globals().items()) if k.startswith('fx_')}
missing = sorted({c['name'] for c in cues} - FX.keys())
if missing:
    raise SystemExit(f'no sound for cues: {missing}')
for c in cues:
    o = {('midi_' if k == 'midi' else k): v for k, v in c.items() if k not in ('t', 'name')}
    FX[c['name']](c['t'], **o)
print(f'placed {len(cues)} sound effects')


# ================================================================== reverb
def ir(tau_bands, dur, pre=.02, seed=0, er=8):
    r = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = []
    for _ in range(2):
        x = r.standard_normal(n).astype(F32)
        y = np.zeros(n, F32)
        for (lo, hi), tau in tau_bands:
            y += (bp(x, lo, hi) if lo else lp(x, hi)) * np.exp(-t / tau)
        y *= np.minimum(1, t / .008)
        y *= np.minimum(1, (n - np.arange(n)) / (0.5 * SR)).astype(F32) ** 0.5  # no cut-off at the end
        for k in range(er):
            y[int((pre + r.random() * .06) * SR)] += (.6 - k * .05) * (1 if r.random() < .5 else -1)
        y = np.concatenate([np.zeros(int(pre * SR), F32), y])
        out.append(y / np.sqrt(np.sum(y ** 2)))
    return out


def conv(x, h):
    return np.stack([fftconvolve(x[c], h[c])[:N].astype(F32) for c in range(2)])


HALL = ir([((0, 300), 0.36), ((300, 1500), 0.32), ((1500, 5000), 0.24), ((5000, 16000), 0.12)], 3.0, .03, 1)
PLATE = ir([((0, 500), .6), ((500, 4000), .7), ((4000, 16000), .5)], 2.0, .008, 2)
dry = dry_mix(MUSIC)
send = np.zeros((2, N), F32)
PRE = int(0.025 * SR)  # the piano's send is pre-delayed so its attacks stay clear
for k, v in MUSIC.items():
    x = v * GROUP_GAIN.get(k, 1.0) * GROUP_HALL.get(k, .3)
    if k == 'piano':
        x = np.concatenate([np.zeros((2, PRE), F32), x[:, :-PRE]], axis=1)
    send += x
print('reverbs...')
music = dry + conv(hp(send, 150), HALL) * .7
music *= 10 ** ((MUSIC_RMS - rms_db(music[:, np.max(np.abs(music), axis=0) > 1e-5])) / 20)
sfx = BUS['sfx'] + conv(BUS['sfxwet'], PLATE) * .6
print(f'music rms {MUSIC_RMS:.1f} dB, effects rms {rms_db(sfx):.1f} dB')
rel = {}
for c in cues:
    i = int(c['t'] * SR)
    e = sfx[:, i:i + int(.3 * SR)]
    mu = music[:, max(0, i - SR // 2):i + SR // 2]
    if c['name'] in ('page', 'ink', 'tick', 'swell', 'breath') and e.size and np.max(np.abs(mu)) > 1e-4:
        rel.setdefault(c['name'], []).append(20 * np.log10(np.max(np.abs(e)) + 1e-12) - rms_db(mu))
print('effect peak over local music rms (median dB): ' + ', '.join(f'{k} {np.median(v):+.1f}' for k, v in sorted(rel.items())))

# ================================================================== master
mix = hp(music + sfx, 30)
mix = biquad(mix, 'peak', 9000, 1.5, 0.5)  # a little air on top
# no bus compressor: the dynamic arc is set by the per-scene calibration; only the true-peak limiter below
end = int(round(TOTAL * SR))  # 260.4 * 44100 is 11483639.99... in floating point
mix = mix[:, :end]
mix *= np.minimum(1, (end - np.arange(end)) / (3.0 * SR)).astype(F32)


def measure_lufs(x):
    tmp = os.path.join(OUT, '_measure.wav')
    write_wav(tmp, x)
    o = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', tmp, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    os.remove(tmp)
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', o)[-1])


def write_wav(path, x):
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x.T, -1, 1) * 32767).astype(np.int16).tobytes())


def tp_limit(x, ceil_db):
    """4x-oversampled peak detection, 3 ms look-ahead with a ramped attack, 120 ms release."""
    up = resample_poly(x, 4, 1, axis=1)
    pk = np.max(np.abs(up), axis=0)
    pk = pk[:x.shape[1] * 4].reshape(-1, 4).max(1)
    c = 10 ** (ceil_db / 20)
    tgt = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    L = int(0.003 * SR)
    tgt = minimum_filter1d(tgt, 2 * L + 1)
    tgt = uniform_filter1d(tgt, L)  # ramp into each reduction
    a = np.exp(-1 / (0.12 * SR))
    out = np.minimum(tgt, lfilter([1 - a], [1, -a], tgt, zi=[tgt[0] * a])[0])  # down at once, slow release
    return (x * out.astype(F32)), out


x = mix / (np.max(np.abs(mix)) + 1e-9) * 0.5
for it in range(3):
    gain = LUFS - measure_lufs(x)
    x = x * 10 ** (gain / 20)
    x, gr = tp_limit(x, CEIL - 0.1)
    red = 20 * np.log10(gr)
    worst = sorted({round(i / SR, 1) for i in np.argsort(red)[:4000:200]})
    print(f'master pass {it + 1}: gain {gain:+.2f} dB, limiter max reduction {red.min():.2f} dB, '
          f'{np.mean(red < -1) * 100:.2f} % of the time over 1 dB; deepest at {worst[:8]} s')
    if abs(gain) < 0.1:
        break
WAV = os.path.join(OUT, 'music.wav')
MP3 = os.path.join(OUT, 'music.mp3')
write_wav(WAV, x)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', WAV, '-ar', '44100', '-b:a', '256k', MP3], check=True)
print(f'music: {TOTAL:.2f}s -> {MP3}  ({measure_lufs(x):.1f} LUFS)')
