"""A small sample player for the score: real recorded notes from the VSCO 2 Community Edition (CC0).
Copied from films/second/audio/sampler.py (itself films/light/audio/sampler.py plus reset()); the only addition here is
the `bus` argument of note(), so the score can keep its layers (under the lines, in the pauses, the ending) apart.

    from sampler import Sampler
    s = Sampler(SR, N)                     # N: length of the output in samples
    s.note('vcpz', t, midi, vel, dur)     # vel 0..1, dur in seconds (the key or bow is held this long)
    s.note('harp', t, midi, vel, dur, bus='punct:harp')   # into a named bus instead of the group's own
    buses = s.buses                        # dict: bus name -> stereo float32 array (2, N)
    s.reset()                              # empty the buses and the note log; keep the loaded samples

Instruments: piano (upright, three dynamics, a sample every 4 semitones), vln / vla / vc (string sections, sustained
with vibrato, two dynamics), harp, vlnpz / vcpz (pizzicato, two takes each). Per sample, on loading:
- pitch: VSCO names the string-section octaves one lower than scientific pitch (its 'A2' sounds as A3); the harp names
  are scientific. The pitch is measured (harmonic search, then parabolic peak interpolation on the first partials) and
  used when it agrees with the name to within 0.6 semitone, otherwise the name is used;
- level: every sample is scaled to one reference loudness (-30 dBFS RMS: plucked and piano notes over the first 0.3 s,
  sustained notes over 0.5 s from the end of the attack), so velocity alone sets loudness and a dynamic layer only
  changes the tone colour. Loudness follows 36·log10(vel / 0.45) dB (vel 0.3 = -6 dB, 0.6 = +4.5 dB);
- stereo: left and right are balanced; harp and pizzicato are narrowed (mid + 0.5 side) so pan is the real position;
- timing: leading silence is removed; a string note with attack <= 0.3 starts at the sample's half-level point, so a
  hit lands on time instead of swelling in.
Notes pick the nearest sample in pitch (alternating takes for repeated pizzicato and harp notes, with a small seeded
level and timing variation) and are resampled by at most a few semitones. Sustained notes longer than their sample
are extended by looping a matched part of the sustain with 1.5 s equal-power crossfades, with a per-note offset so
simultaneous voices do not splice at the same moment.
"""
import glob
import os
import re
from fractions import Fraction

import numpy as np
import scipy.io.wavfile as wavfile
from scipy.signal import resample_poly

F32 = np.float32
HERE = os.path.dirname(os.path.abspath(__file__))
# the VSCO 2 CE samples (CC0, about 500 MB, not in git): $VSCO_SAMPLES
BASE = os.environ.get('VSCO_SAMPLES') or os.path.join(HERE, '..', '..', '..', 'audio', 'samples')
NAMES = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
OCT = {'vln': 12, 'vla': 12, 'vc': 12, 'vlnpz': 12, 'vcpz': 12, 'harp': 0}  # name octave -> sounding octave
SUSTAINED = ('vln', 'vla', 'vc')
LAYERS = {'piano': [0.32, 0.5], 'vln': [0.44], 'vla': [0.44], 'vc': [0.44], 'vlnpz': [0.44], 'vcpz': [0.44]}
VARIED = ('harp', 'vlnpz', 'vcpz')
REF = 10 ** (-30 / 20)
TUNE = 0.04  # semitones: the other groups are tuned to the upright piano, which sits ~4 cents sharp

# group -> (glob, dynamic-layer regex, release seconds, bus)
GROUPS = {
    'piano': ('Keys/Upright Piano/Player_dyn*_rr1_*.wav', r'dyn(\d)', 0.45, 'piano'),
    'vln': ('Strings/Violin Section/susVib/*.wav', r'_v(\d)', 0.6, 'strings'),
    'vla': ('Strings/Viola Section/susvib/*.wav', r'_v(\d)', 0.6, 'strings'),
    'vc': ('Strings/Cello Section/susvib/*.wav', r'_v(\d)', 0.6, 'strings'),
    'harp': ('Strings/Harp/*.wav', None, 2.5, 'harp'),
    'vlnpz': ('Strings/Violin Section/Pizz/*.wav', r'_v(\d)', 0.3, 'pizz'),
    'vcpz': ('Strings/Cello Section/pizzT/*.wav', r'_v(\d)', 1.0, 'pizz'),
}


def load(path):
    sr, x = wavfile.read(path)
    if x.dtype == np.int16:
        x = x.astype(F32) / 32768
    elif x.dtype == np.int32:
        x = x.astype(F32) / 2147483648
    else:
        x = x.astype(F32)
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    return sr, x.T.copy()


def onset(x, sr):
    """Index where the note starts: first point the envelope reaches 3 % of its peak (minus 3 ms)."""
    env = np.max(np.abs(x), axis=0)
    i = int(np.argmax(env > 0.03 * env.max()))
    return max(0, i - int(0.003 * sr))


def envelope(x, sr, win=0.05):
    h = max(1, int(win * sr))
    m = (x ** 2).mean(0)
    n = len(m) // h
    return np.sqrt(m[:n * h].reshape(n, h).mean(1) + 1e-20), h


def f0_midi(x, sr, hint):
    """Measured pitch (fractional MIDI) from the steady part, searched from 14 below to 19 above the hint."""
    m = x.mean(0)
    n = len(m)
    seg = m[int(n * 0.25):int(n * 0.25) + min(int(sr * 1.0), n // 2)] if n > sr * 0.6 else m[int(0.02 * sr):]
    seg = seg * np.hanning(len(seg))
    NF = 1 << 18
    spec = np.abs(np.fft.rfft(seg, NF))
    df = sr / NF
    spec = spec / (spec.max() + 1e-12)

    def at(f):
        j = int(round(f / df))
        return spec[max(0, j - 3):j + 4].max() if j < len(spec) else 0.0

    best, bm = -1e9, hint
    # energy at the half-way points between partials counts against a candidate (rejects sub-octaves)
    for cand in np.arange(hint - 14, hint + 19.01, 0.05):
        f = 440 * 2 ** ((cand - 69) / 12)
        if f * 5 > sr / 2:
            break
        s = sum(at(f * k) - at(f * (k - 0.5)) for k in range(1, 6))
        if s > best:
            best, bm = s, cand
    # refine: parabolic interpolation of the first three partial peaks
    f = 440 * 2 ** ((bm - 69) / 12)
    ests, ws = [], []
    for k in (1, 2, 3):
        j0 = int(round(f * k / df))
        lo, hi = max(1, j0 - 6), min(len(spec) - 2, j0 + 6)
        if hi <= lo:
            continue
        j = lo + int(np.argmax(spec[lo:hi + 1]))
        a, b, c = np.log(spec[j - 1] + 1e-12), np.log(spec[j] + 1e-12), np.log(spec[j + 1] + 1e-12)
        d = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0.0
        ests.append((j + d) * df / k)
        ws.append(spec[j])
    if ests:
        f = float(np.average(ests, weights=ws))
        bm = 69 + 12 * np.log2(f / 440)
    return float(bm)


class Sampler:
    def __init__(self, sr, n):
        self.sr = sr
        self.n = n
        self.buses = {}
        self.sets = {}
        self.cache = {}
        self.rr = {}
        self.log = []  # (t, group, midi, vel, dur): every note played, for checks
        self.gain_at = None  # optional function t -> gain multiplier (the score's scene levels)

    def reset(self):
        """Empty the buses, the note log and the round-robin counters; the loaded sample sets stay."""
        self.buses = {}
        self.rr = {}
        self.log = []

    # -------------------------------------------------- sample sets
    def _set(self, g):
        if g in self.sets:
            return self.sets[g]
        pat, dynre, rel, bus = GROUPS[g]
        out = []
        sr = self.sr
        for p in sorted(glob.glob(os.path.join(BASE, pat))):
            srp, x = load(p)
            assert srp == sr, (p, srp)
            name = os.path.basename(p)
            dyn = int(re.search(dynre, name).group(1)) if dynre else 1
            if g == 'piano':
                key = 21 + 2 * int(re.search(r'_(\d{3})\.wav', name).group(1))  # MappingChart.txt: file NNN = key 21 + 2·NNN
                meas = f0_midi(x, sr, key) if key >= 33 else float(key)  # measured: the upright is stretch-tuned
                m = meas if abs(meas - key) <= 0.6 else float(key)
            else:
                mm = re.search(r'_([A-G])(#|b)?(\d)', name)
                hint = 12 * (int(mm.group(3)) + 1) + NAMES[mm.group(1)] + (1 if mm.group(2) == '#' else -1 if mm.group(2) == 'b' else 0)
                expect = hint + OCT[g]
                meas = f0_midi(x, sr, hint)
                m = meas if abs(meas - expect) <= 0.6 else float(expect)
            o = onset(x, sr)
            x = x[:, o:]
            # stereo: balance the channels; narrow plucked sounds
            rl, rr = np.sqrt((x[0] ** 2).mean()) + 1e-12, np.sqrt((x[1] ** 2).mean()) + 1e-12
            x[0] *= np.sqrt(rl * rr) / rl
            x[1] *= np.sqrt(rl * rr) / rr
            if g in VARIED:
                mid, side = (x[0] + x[1]) / 2, (x[0] - x[1]) / 2
                x = np.stack([mid + 0.5 * side, mid - 0.5 * side])
            # level reference and the half-level point of the attack
            env, h = envelope(x, sr)
            if g in SUSTAINED:
                sus = float(np.median(env[int(len(env) * 0.2):max(int(len(env) * 0.6), int(len(env) * 0.2) + 1)]))
                i90 = int(np.argmax(env >= 0.9 * sus))
                i50 = int(np.argmax(env >= 0.5 * sus))
                i85 = int(np.argmax(env >= 0.85 * sus))
                ref = float(np.sqrt(np.mean(env[i90:i90 + max(1, int(0.5 * sr / h))] ** 2)))
                t50, t85 = i50 * h, i85 * h
            else:
                ref = float(np.sqrt(np.mean(env[:max(1, int(0.3 * sr / h))] ** 2)))
                t50 = t85 = 0
            out.append({'x': x, 'midi': m, 'dyn': dyn, 'name': name, 'norm': REF / max(ref, 1e-6), 't50': t50, 't85': t85})
        dyns = sorted({s['dyn'] for s in out})
        self.sets[g] = {'s': out, 'dyns': dyns, 'rel': rel, 'bus': bus}
        return self.sets[g]

    def report(self, g):
        st = self._set(g)
        return [(s['name'], round(s['midi'], 3), s['dyn'], round(20 * np.log10(s['norm']), 1)) for s in st['s']]

    def _shifted(self, g, i, semis):
        key = (g, i, round(semis, 3))
        if key in self.cache:
            return self.cache[key]
        x = self._set(g)['s'][i]['x']
        if abs(semis) < 1e-3:
            y = x
        else:
            r = Fraction(2 ** (-semis / 12)).limit_denominator(1000)  # play faster = fewer samples
            y = resample_poly(x, r.numerator, r.denominator, axis=1).astype(F32)
        self.cache[key] = y
        return y

    # -------------------------------------------------- notes
    def note(self, g, t, midi, vel=0.45, dur=1.0, pan=0.0, gain=1.0, attack=0.0, release=None, bus=None):
        st = self._set(g)
        self.log.append((round(t, 3), g, round(float(midi), 2), round(vel, 3), round(dur, 3), bus or st['bus']))
        dyns = st['dyns']
        cut = LAYERS.get(g, [])  # velocity thresholds between dynamic layers (timbre only: loudness is matched)
        layer = dyns[min(len(dyns) - 1, sum(vel >= c for c in cut))]
        cands = [i for i, s in enumerate(st['s']) if s['dyn'] == layer]
        best = min(abs(st['s'][k]['midi'] - midi) for k in cands)
        near = [k for k in cands if abs(st['s'][k]['midi'] - midi) <= best + 0.35]
        key = (g, round(midi))
        self.rr[key] = self.rr.get(key, -1) + 1
        i = near[self.rr[key] % len(near)]
        s = st['s'][i]
        semis = midi + (TUNE if g != 'piano' else 0.0) - s['midi']
        x = self._shifted(g, i, semis)
        sr = self.sr
        lvl = s['norm'] * 10 ** (36 * np.log10(max(vel, 0.05) / 0.45) / 20)
        if g in VARIED:  # a little life in repeated plucks: +-1.5 dB, +-6 ms, seeded by time and pitch
            h = np.sin(t * 12.9898 + midi * 78.233) * 43758.5453
            u = h - np.floor(h)
            lvl *= 10 ** ((u * 3 - 1.5) / 20)
            t += (u - 0.5) * 0.012
        rel = st['rel'] if release is None else release
        start = 0
        if g in SUSTAINED and attack <= 0.1 and s['t85'] > 0:  # a hit: start where the bow is almost up to level
            start = max(0, int(s['t85'] * 2 ** (-semis / 12)) - int(0.03 * sr))
            attack = max(attack, 0.03)
        elif g in SUSTAINED and attack <= 0.3 and s['t50'] > 0:
            start = max(0, int(s['t50'] * 2 ** (-semis / 12)) - int(0.02 * sr))
            attack = max(attack, 0.02)
        need = start + int((dur + rel) * sr)
        if g in SUSTAINED and need > x.shape[1] - int(0.2 * sr):
            x = self._extend(x, need + int(0.3 * sr), seed=t * 7.1 + midi)
        y = x[:, start:need].copy()
        L = y.shape[1]
        tt = np.arange(L) / sr
        env = np.ones(L, F32)
        if attack > 0:
            env *= np.minimum(1, tt / attack).astype(F32)
        if L / sr > dur:
            env *= (np.clip(1 - (tt - dur) / max(rel, 1e-3), 0, 1) ** 2).astype(F32)
        if self.gain_at is not None:  # the score's scene levels, followed over the whole note (held notes cross scenes)
            gs = np.array([self.gain_at(t + k * 0.05) for k in range(int(L / sr / 0.05) + 2)], dtype=F32)
            env *= np.interp(tt, np.arange(len(gs)) * 0.05, gs).astype(F32)
        y *= env
        a = (np.clip(pan, -1, 1) + 1) * np.pi / 4
        y[0] *= np.cos(a) * 1.4142
        y[1] *= np.sin(a) * 1.4142
        self._put(bus or st['bus'], y * (lvl * gain), t)

    def _extend(self, x, need, seed=0.0):
        """Loop a long, matched part of the sustain: splice points a in [0.2n, 0.45n] and b up to 0.95n, at least
        3.5 s apart where the sample allows, chosen for correlation with a penalty for level difference; the loop is
        level-matched with a gain ramp so it repeats without a step; 0.7 s equal-power crossfades; a per-note offset
        of up to 0.3 s so simultaneous voices do not splice together."""
        sr = self.sr
        n = x.shape[1]
        cf = int(0.7 * sr)
        mono = x.mean(0)
        w = int(0.1 * sr)
        hop = int(0.05 * sr)
        span = min(int(3.5 * sr), int(0.45 * n))

        def rms(i):
            return np.sqrt(np.mean(mono[i:i + w] ** 2)) + 1e-12

        best, ab = -1e9, (int(n * 0.3), int(n * 0.9))
        for a in range(int(n * 0.2), int(n * 0.45), hop):
            for b in range(a + max(span, cf + w), min(int(n * 0.95), n - w), hop):
                pa, pb = mono[a:a + w], mono[b:b + w]
                c = float(np.dot(pa, pb) / (np.linalg.norm(pa) * np.linalg.norm(pb) + 1e-12))
                c -= 0.3 * abs(20 * np.log10(rms(a) / rms(b)))
                if c > best:
                    best, ab = c, (a, b)
        a, b = ab
        h = np.sin(seed * 12.9898) * 43758.5453
        b = max(a + cf + w, b - int((h - np.floor(h)) * 0.3 * sr))
        seg = x[:, a:b].copy()
        seg *= np.linspace(1.0, rms(a) / rms(b - w), seg.shape[1], dtype=F32)  # end at the level it starts with
        out = x[:, :b].copy()
        fade = np.sin(np.linspace(0, np.pi / 2, cf, dtype=F32))
        while out.shape[1] < need:
            tail = out[:, -cf:] * fade[::-1] + seg[:, :cf] * fade
            out = np.concatenate([out[:, :-cf], tail, seg[:, cf:]], axis=1)
        return out

    def _put(self, bus, y, t):
        if bus not in self.buses:
            self.buses[bus] = np.zeros((2, self.n), F32)
        i = int(round(t * self.sr))
        if i < 0:
            y = y[:, -i:]
            i = 0
        m = min(y.shape[1], self.n - i)
        if m > 0:
            self.buses[bus][:, i:i + m] += y[:, :m]
