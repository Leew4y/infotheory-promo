"""Synthesis library for film scores: felt piano, strings, cello, sound effects, convolution reverb, mix and master.

A film's score module calls init() with the film's resolved timeline (timeline.json, exported by the page), writes
its arrangement with the instruments below, places the page's cue sheet with place_cues(), then calls render().
Times are seconds on the film clock; at(scene, bars) gives a time relative to a scene, snapped to the sample grid.
Everything is deterministic: one seeded generator for noise, fixed seeds for the reverb impulses.
"""
import json
import os
import subprocess
import wave

import numpy as np
from scipy.ndimage import maximum_filter1d
from scipy.signal import butter, fftconvolve, lfilter, sosfilt, sosfiltfilt

SR = 44100
F32 = np.float32
TAU = 2 * np.pi

# set by init()
BPM = BEAT = BAR = EIGHTH = TOTAL = 0.0
N = 0
BUS = {}
SCENES = {}
rng = None


def init(timeline):
    """Size the buses for the film and read its bar grid and scene starts from a timeline dict."""
    global BPM, BEAT, BAR, EIGHTH, TOTAL, N, BUS, SCENES, rng
    BPM = timeline['bpm']
    BEAT = 60 / BPM
    BAR = 4 * BEAT
    EIGHTH = BEAT / 2
    TOTAL = timeline['duration']
    N = int((TOTAL + 1) * SR)
    BUS = {k: np.zeros((2, N), F32) for k in ('mus', 'pad', 'sfx', 'hall', 'plate', 'room', 'sfxwet')}
    SCENES = {s['name']: s for s in timeline['scenes']}
    rng = np.random.default_rng(11)


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def at(scene, bars_in=0.0):
    """Seconds at `bars_in` bars after the start of `scene`, snapped to the sample grid."""
    return round((SCENES[scene]['start'] + bars_in * BAR) * SR) / SR


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tv(dur):
    return np.arange(max(1, int(dur * SR))) / SR


def noise(n):
    return rng.standard_normal(n).astype(F32)


def put(sig, t0, bus, gain=1.0, pan=0.0, hall=0.0, plate=0.0, room=0.0, wet=0.0):
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
    for k, g in (('hall', hall), ('plate', plate), ('room', room), ('sfxwet', wet)):
        if g:
            BUS[k][:, i:i + n] += seg * g


def adsr(n, a, d, s, r, hold):
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    return (e * (1 - np.clip((t - hold) / max(r, 1e-4), 0, 1))).astype(F32)


def lp(x, f, o=2):
    return sosfilt(butter(o, min(f, SR * .45), 'low', fs=SR, output='sos'), x).astype(F32)


def hp(x, f, o=2):
    return sosfilt(butter(o, max(f, 10), 'high', fs=SR, output='sos'), x).astype(F32)


def bp(x, lo, hi, o=2):
    return sosfilt(butter(o, [max(lo, 10), min(hi, SR * .45)], 'band', fs=SR, output='sos'), x).astype(F32)


def saw(f, t, det=0.0, vib=0.0, vr=5.5, ph=0.0):
    inst = f * (1 + det) * (1 + vib * np.sin(TAU * vr * t + ph)) if vib else np.full(t.shape, f * (1 + det), F32)
    phase = (np.cumsum(inst, dtype=np.float64) / SR + ph / TAU) % 1.0
    dt = inst / SR
    y = 2 * phase - 1
    m = phase < dt
    x = phase[m] / dt[m]
    y[m] -= x + x - x * x - 1
    m = phase > 1 - dt
    x = (phase[m] - 1) / dt[m]
    y[m] -= x * x + x + x + 1
    return y.astype(F32)


# ================================================================== instruments
def felt(t0, m, gain=.06, dec=2.2, pan=0.0, bus='mus', wet=0.0):
    """Felt piano: soft attack, few harmonics, a little hammer noise, long natural decay."""
    f = midi(m)
    t = tv(dec * 2.5)
    env = np.minimum(1, t / .012) * np.exp(-t / dec) * (1 - .35 * (1 - np.exp(-t / .15)))
    s = np.sin(TAU * f * t) + .35 * np.sin(TAU * 2 * f * t) * np.exp(-t / (dec * .5)) + .12 * np.sin(TAU * 3 * f * t) * np.exp(-t / (dec * .3))
    s += .25 * np.sin(TAU * f * 1.002 * t)
    s = s * env
    n = int(.03 * SR)
    s[:n] += lp(noise(n), 1200) * np.exp(-tv(.03) / .006) * .25
    put(lp(s, 3200 + 20 * m), t0, bus, gain, pan, hall=.7, wet=wet)


def chordf(t0, notes, gain=.05, dec=3.0, spread=.6):
    for i, m in enumerate(notes):
        felt(t0 + i * .018, m, gain, dec, ((i / max(1, len(notes) - 1)) - .5) * spread)


def strings(t0, notes, dur, gain=.03, att=1.6, rel=2.2, cut=2400, hall=1.1, spread=.9):
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    e = adsr(n, att, .8, .92, rel, dur)
    for i, m in enumerate(notes):
        f = midi(m)
        s = saw(f, t, -.003, .004, 4.8) + saw(f, t, .0035, .004, 5.3, 1.7) + .5 * saw(f * 2, t, .001, .003, 5.0, 2.4)
        s = lp(s, cut)
        put(s * e / 3, t0, 'pad', gain, ((i / max(1, len(notes) - 1)) - .5) * spread, hall=hall)


def bed(t0, notes, dur, gain=.03, att=1.2, rel=1.8):
    strings(t0, notes, dur, gain, att, rel, cut=900, hall=.8, spread=.5)


def cello(t0, m, dur, gain=.05, att=.5, rel=1.4):
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    e = adsr(n, att, .6, .9, rel, dur)
    f = midi(m)
    s = lp(saw(f, t, 0, .006, 5.2) + .6 * saw(f, t, .002, .006, 5.0, 1.1), 700)
    put(s * e, t0, 'mus', gain, -.15, hall=.9)


def sub(t0, m, dur, gain=.1):
    t = tv(dur + .4)
    e = adsr(len(t), .05, .2, 1.0, .4, dur)
    put(np.sin(TAU * midi(m) * t) * e, t0, 'mus', gain)


# ================================================================== harmony
CH = {'Am': [57, 60, 64, 67], 'Am9': [57, 60, 64, 71], 'F': [53, 57, 60, 65], 'Fmaj7': [53, 57, 60, 64], 'C': [55, 60, 64, 67], 'G': [55, 59, 62, 67],
      'Dm': [53, 57, 62, 65], 'Em': [52, 55, 59, 64], 'E': [52, 56, 59, 64], 'A': [57, 61, 64, 69], 'Aadd9': [57, 61, 64, 71]}
ROOT = {'Am': 45, 'Am9': 45, 'F': 41, 'Fmaj7': 41, 'C': 48, 'G': 43, 'Dm': 50, 'Em': 52, 'E': 52, 'A': 45, 'Aadd9': 45}
LOW = {k: v - 12 for k, v in ROOT.items()}


def progression(t0, chords, felt_gain=.045, str_gain=.026, arp=True, lows=True, arp_gain=.03):
    """One chord per bar from t0: a felt chord on the downbeat, a soft quarter-note arpeggio, a string bed, a cello root."""
    for i, c in enumerate(chords):
        t = t0 + i * BAR
        chordf(t, CH[c], felt_gain, 3.2)
        if str_gain:
            strings(t, [m + 12 for m in CH[c][1:]], BAR, str_gain, att=1.4)
        if lows:
            cello(t, LOW[c], BAR * .95, .045)
        if arp:
            notes = CH[c]
            for k in range(1, 4):
                felt(t + k * BEAT, notes[(k * 2) % 4] + 12, arp_gain * (.8 if k % 2 else 1), 1.8, np.sin(k * 1.9) * .5)


# ================================================================== sound effects from the cue sheet
def fx_page(t, **o):
    tt = tv(.32)
    s = bp(noise(len(tt)), 600, 5000) * np.sin(np.pi * tt / .32) ** 2
    s += lp(noise(len(tt)), 200) * np.exp(-tt / .04) * .8
    put(s, t, 'sfx', .09, -.1, wet=.35)


def fx_ink(t, **o):
    tt = tv(.16)
    s = bp(noise(len(tt)), 1800, 7000) * np.sin(np.pi * tt / .16) ** 1.5
    put(s, t, 'sfx', .035, .15, wet=.25)


def fx_tick(t, gain=1.0, **o):
    tt = tv(.03)
    s = lp(noise(len(tt)), 3000) * np.exp(-tt / .004)
    put(s, t, 'sfx', .05 * gain, .05, wet=.3)


def fx_tone(t, midi_=64, **o):
    felt(t, midi_, .055, 3.0, bus='sfx', wet=.4)


def fx_chime(t, midi_=76, **o):
    f = midi(midi_)
    tt = tv(4.0)
    s = (np.sin(TAU * f * tt) + .3 * np.sin(TAU * f * 2.01 * tt) * np.exp(-tt / .6) + .15 * np.sin(TAU * f * 3.0 * tt) * np.exp(-tt / .35)) * np.exp(-tt / 1.6)
    put(s * np.minimum(1, tt / .004), t, 'sfx', .04, .2, wet=.7)


def fx_swell(t, dur=4.0, **o):
    tt = tv(dur)
    x = tt / dur
    put(lp(noise(len(tt)), 1200) * np.sin(np.pi * x) ** 2.5, t, 'sfx', .03, wet=.8)


def fx_breath(t, dur=2.0, **o):
    tt = tv(dur)
    x = tt / dur
    put(lp(noise(len(tt)), 900) * np.sin(np.pi * x) ** 3, t, 'sfx', .022, wet=.6)


def fx_low(t, midi_=45, dur=2.5, **o):
    cello(t, midi_, dur, .04)


def fx_stamp(t, **o):
    tt = tv(.25)
    s = np.sin(TAU * 140 * tt) * np.exp(-tt / .05) + lp(noise(len(tt)), 800) * np.exp(-tt / .02) * .6
    put(s, t, 'sfx', .14, wet=.3)


FX = {k[3:]: v for k, v in globals().items() if k.startswith('fx_')}


def place_cues(cues):
    """Place every cue of the page's cue sheet; an unknown cue name is an error."""
    missing = sorted({c['name'] for c in cues} - FX.keys())
    if missing:
        raise SystemExit(f'no sound for cues: {missing}')
    for c in cues:
        o = {('midi_' if k == 'midi' else k): v for k, v in c.items() if k not in ('t', 'name')}
        FX[c['name']](c['t'], **o)
    print(f'placed {len(cues)} sound effects')


# ================================================================== mix + master
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
        for k in range(er):
            y[int((pre + r.random() * .06) * SR)] += (.6 - k * .05) * (1 if r.random() < .5 else -1)
        y = np.concatenate([np.zeros(int(pre * SR), F32), y])
        out.append(y / np.sqrt(np.sum(y ** 2)))
    return out


def conv(bus, h):
    return np.stack([fftconvolve(BUS[bus][c], h[c])[:N].astype(F32) for c in range(2)])


def render(wav_path, mp3_path):
    """Reverbs, mix, bus compression and look-ahead limiting, then the loudness-normalized WAV master (wav_path) and an
    MP3 for the preview player encoded from it (mp3_path). The export muxes the WAV master."""
    hall = ir([((0, 300), 1.5), ((300, 1500), 1.3), ((1500, 5000), .9), ((5000, 16000), .4)], 4.2, .028, 1)
    plate = ir([((0, 500), .6), ((500, 4000), .7), ((4000, 16000), .5)], 2.0, .008, 2)
    room = ir([((0, 400), .2), ((400, 6000), .18), ((6000, 16000), .09)], .7, .004, 3)
    print('reverbs...')
    wet_music = conv('hall', hall) * .6 + conv('plate', plate) * .35 + conv('room', room) * .5
    wet_sfx = conv('sfxwet', plate) * .6
    music = BUS['mus'] + BUS['pad'] + wet_music
    sfx = BUS['sfx'] + wet_sfx
    mix = music * .95 + sfx
    mix = np.stack([hp(mix[c], 28) for c in range(2)])
    mix -= .3 * sosfiltfilt(butter(2, 110, 'low', fs=SR, output='sos'), mix, axis=1).astype(F32)
    mix -= .2 * sosfiltfilt(butter(2, 8000, 'high', fs=SR, output='sos'), mix, axis=1).astype(F32)

    mono = np.sqrt((mix[0] ** 2 + mix[1] ** 2) / 2)
    a = np.exp(-1 / (.2 * SR))
    env = np.sqrt(lfilter([1 - a], [1, -a], mono ** 2) + 1e-12)
    lvl = 20 * np.log10(env / (np.max(env) + 1e-9) + 1e-9)
    g = 10 ** (-np.maximum(0, lvl + 10) * (1 - 1 / 1.8) / 20)
    mix *= g.astype(F32)
    mix /= np.max(np.abs(mix)) + 1e-9
    L = int(.004 * SR)
    pk = maximum_filter1d(np.max(np.abs(mix), axis=0), size=2 * L + 1)
    g = np.minimum(1, .5 / np.maximum(pk, 1e-9))
    a = np.exp(-1 / (.09 * SR))
    gs = lfilter([1 - a], [1, -a], g)
    mix *= np.minimum(g, gs).astype(F32)
    end = round(TOTAL * SR)  # a whole number of samples up to float error (260.4 * 44100 = 11483639.999999998): int() would drop one
    mix = mix[:, :end]
    mix *= np.minimum(1, (end - np.arange(end)) / (3.0 * SR)).astype(F32)
    mix /= np.max(np.abs(mix)) + 1e-9
    pcm = (mix.T * 32000).astype(np.int16)
    os.makedirs(os.path.dirname(wav_path) or '.', exist_ok=True)
    mix_path = wav_path[:-4] + '.mix.wav'
    with wave.open(mix_path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    master(mix_path, wav_path)
    os.remove(mix_path)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_path, '-b:a', '192k', mp3_path], check=True)
    print(f'music: {TOTAL:.2f}s -> {wav_path} (master), {mp3_path} (preview)')


# loudness targets of the master: integrated loudness, its tolerance, and the true-peak ceiling
TARGET_I, TOL_I, MAX_TP = -16.0, 0.5, -1.5


def master(mix_path, wav_path):
    """Two-pass loudnorm to TARGET_I with a sample-peak limiter, written as the 16-bit WAV master, then measured:
    a master off target in loudness, true peak or duration is an error (SystemExit)."""
    ln = f'loudnorm=I={TARGET_I}:TP={MAX_TP}:LRA=13'
    m = subprocess.run(['ffmpeg', '-hide_banner', '-i', mix_path, '-af', ln + ':print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
    m = json.loads(m[m.rindex('{'):m.rindex('}') + 1])
    ln += f":measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mix_path, '-af', ln + ',alimiter=limit=-1.8dB:level=false',
                    '-ar', str(SR), '-c:a', 'pcm_s16le', wav_path], check=True)
    q = measure(wav_path)
    print(f"master: {q['duration']:.3f}s, {q['I']:.2f} LUFS, true peak {q['TP']:.2f} dBTP")
    errors = []
    if abs(q['I'] - TARGET_I) > TOL_I:
        errors.append(f"integrated loudness {q['I']:.2f} LUFS is not within {TARGET_I}±{TOL_I}")
    if q['TP'] > MAX_TP:
        errors.append(f"true peak {q['TP']:.2f} dBTP is above {MAX_TP}")
    if abs(q['duration'] - TOTAL) > 1 / SR:
        errors.append(f"duration {q['duration']:.6f}s differs from the film's {TOTAL}s")
    if errors:
        raise SystemExit('master out of spec: ' + '; '.join(errors))


def measure(path):
    """Integrated loudness and true peak (EBU R128, ffmpeg ebur128) and duration of an audio file."""
    out = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    summary = out[out.rindex('Summary:'):]
    loud = float(summary.split('I:')[1].split('LUFS')[0])
    peak = float(summary.split('Peak:')[1].split('dBFS')[0])
    with wave.open(path, 'rb') as w:
        duration = w.getnframes() / w.getframerate()
    return {'I': loud, 'TP': peak, 'duration': duration}
