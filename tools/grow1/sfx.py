"""Sound for the pilot short grow1 (《长高一倍，体重变几倍？》): no music under the voice, only effects.

    python tools/grow1/sfx.py [--snap] [--mix] [--samples films/grow1/audio/samples]
        -> out/grow1/music.wav (the bed audio/mix.py expects: silent except the effects)
    python audio/mix.py --film grow1 --music out/grow1/music.wav        (from the repository root; --mix runs it)
    python tools/grow1/sfx_measure.py                                  (--mix runs it too)

Cues: tools/grow1/sfx_cues.json (tools/grow1/sfx_cues.py from the scene's films/grow1/cues.json), film seconds:
    [{"t": 2.46, "kind": "stamp", "day": 1}, {"t": 5.44, "kind": "pop"}, {"t": 18.05, "kind": "gauge"}, ...]
  (a bare list, or {"cues": [...]}; "name" is accepted for "kind", "tick" for "gauge"). Per kind:
  - stamp {day}: the rubber stamp's impact at t (the counter step to that day). Synthesised: a low thump, a knock body
    (420/680 Hz on day 1, so a phone speaker plays it) and a short band-passed noise burst; no reverb. Day 1 is v1's
    stamp (120 ms); days 2 and 3 are heavier: more and lower thump, a lower and longer knock, 150 and 180 ms, 0.7 and
    1.4 dB more energy in the 300 Hz - 8 kHz band (what a phone plays) than day 1 (STAMPS). A stamp without a day is
    day 1. A stamp too long for its pause has its tail cut (at least STAMP_MIN_LEN), printed.
  - gauge: the pressure gauge starts rising at t; optional "dur" (s the ticks are spread over, default 0.24) and "n"
    (ticks, default 3, fewer if they would be closer than GAUGE_STEP). Soft high ticks, each 22 ms, a little higher in
    pitch each time.
  - pop: a neighbour's speech bubble appears: a soft bubble "bloop" (a sine gliding up from 520 to 1250 Hz), 60 ms,
    POP_DB re the voice (well under it).
  - end: the end motif starts at t: three harp notes (VSCO 2 CE, CC0) D5 A4 D4, 0.16 s apart, faded to zero at the
    film's last sample.
  Without sfx_cues.json: provisional cues from the committed audio (PROVISIONAL: a stamp in the silence before g1
  (day 1), after s1-5 (day 2) and after s1-7 (day 3); gauge ticks in the pauses before 「扛两倍」, s1-8b's 「8 倍」 and
  s1-10's 「两倍」 and 「8 倍」; a pop after g1 and one in g5b's pause after 「头顶到了 5 楼」; the end motif after the
  voiced end of the last line). They are written to sfx_cues.provisional.json (not sfx_cues.json) with the clear slots.
  A cue file without an end cue gets the provisional one (the motif is the only sound mix.py can set its gain from).
  --slots prints every pause and where each sound fits in it.

Never under a syllable: the voice is placed and levelled exactly as audio/mix.py does; a 5 ms frame is speech when its
RMS is at least VOICE_RMS_DB + VA_DB. Every stamp, gauge tick and pop must leave BWD_GAP s after the last speech frame
before it and FWD_GAP s (from where its own level is 40 dB under its peak) before the next. A stamp that does not is
first cut shorter where it is; otherwise the script stops and names the clear slot nearest the cue and the start times
that fit in it; --snap moves such a cue into that slot instead (a stamp cut shorter if it must, a gauge rise
shortened to fit, a pop to the nearest start within POP_SNAP_MAX that is clear of speech and SEP clear of the effects
already placed; the picture must then follow: out/grow1/sfx/cues_used.json). A pop with no such room stays where it is
if it is MASK_MARGIN dB under the voice in every 1/3-octave band there (band_worst, as sfx_measure.py judges), else it
is left out with a WARNING (--snap) or the script stops. An end cue earlier than 0.10 s after the
voice's end is moved there (the tail card has no sync point), and said so.

Levels in the mix, as audio/mix.py will leave them (it scales the music by one gain so that its RMS away from the
narration is BED_BELOW_DB under the voice, and ducks it DUCK_DB under each line, from PRE s before a line to POST s
after). The gaps between lines here are 0.2-0.4 s, shorter than PRE + POST, so the duck never opens before the last
line: the only music "away from the narration" is the tail after the last line, i.e. the end motif. The motif is
therefore the anchor: its RMS over that window (divided by the duck curve) is set to VOICE_RMS_DB - BED_BELOW_DB, which
leaves mix.py's gain at the value predicted here. Every other effect is built at its level in the mix (STAMP_DB and
STAMPS, TICK_DB, POP_DB re the voice line RMS) and divided by the predicted gain and mix.py's duck curve. So music.wav
alone is not representative: the stamps in it are about 10 dB hotter than the mix will leave them.

Test only: GROW1_TIMELINE and GROW1_PLACEMENTS name another timeline.json and narration.cues.json (a timeline the
scene has not exported yet; --mix passes the placements to audio/mix.py), GROW1_SFX_CUES another cue file (a missing
path: the provisional cues).

Also written (out/grow1/sfx/, not in git): levels.json (targets, the predicted mix gain, every event with its time,
extent, level re the voice, the speech around it), cues_used.json, stems/fx_in_mix.wav (float, the effects as they go
into the mix before mastering), stems/voice_in_mix.wav.
"""
import argparse
import json
import math
import os
import subprocess
import sys
import wave

import numpy as np
from scipy.signal import butter, sosfilt

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get('GROW1_REPO', os.path.abspath(os.path.join(TOOLS, '..', '..')))
FILM_ID = 'grow1'
FILM = os.path.join(ROOT, 'films', FILM_ID)
OUT = os.path.join(ROOT, 'out', FILM_ID)
SFX_OUT = os.path.join(OUT, 'sfx')
CUES_PATH = os.environ.get('GROW1_SFX_CUES') or os.path.join(TOOLS, 'sfx_cues.json')  # the env var only for tests
PROVISIONAL_PATH = os.path.join(TOOLS, 'sfx_cues.provisional.json')
# the film's timeline and the narration placements (bun scripts/export.ts --film grow1 --cues --timeline --narration);
# the env vars only for tests on a timeline the scene has not exported yet (then pass the same placements to
# audio/mix.py --placements; --mix does)
TIMELINE_PATH = os.environ.get('GROW1_TIMELINE') or os.path.join(FILM, 'timeline.json')
PLACEMENTS_PATH = os.environ.get('GROW1_PLACEMENTS') or os.path.join(OUT, 'narration.cues.json')
SAMPLES_DEFAULT = os.path.join(ROOT, 'films', 'grow1', 'audio', 'samples')
SAMPLER_DIR = TOOLS  # sampler.py, copied from the metre film (VSCO 2 CE player)

sys.path.insert(0, os.path.join(ROOT, 'audio'))
import mix  # noqa: E402  (audio/mix.py: the mixer's rate, levels, masks)

SR = mix.SR
F32 = np.float32
# levels in the mix, dB re the voice line RMS (mix.VOICE_RMS_DB, every line levelled to it)
TICK_DB = -16.0  # RMS over each 22 ms tick
POP_DB = -20.0   # RMS over the bubble pop's 60 ms
# speech detection and the clearance rules
FRAME = 0.005  # s
VA_DB = -25.0  # a 5 ms frame is speech when its RMS is at least VOICE_RMS_DB + VA_DB
BWD_GAP, FWD_GAP = 0.02, 0.06  # s: clear of speech before an effect's start / after its end (-40 dB re its peak)
EXTENT_DB = -40.0  # an effect's extent: its 5 ms frames within this of its loudest frame
MASK_MARGIN = 12.0  # dB: sfx_measure.py's verdict for an effect that overlaps speech (none should): this far under the
#                    voice in every 1/3-octave band the voice uses
END_AFTER = 0.10  # s: the end motif starts at least this long after the voice's last speech frame
# the sounds
# The stamp per day (the counter step to day 1, 2, 3): later days heavier. Day 1 is v1's stamp, sample for sample.
# len: s (ends at zero, the last `taper` s a cos^2 fade); thump: end frequency, sweep above it, sweep and decay time
# constants, amplitude; body: the knock's two partials (Hz), their decays (s), amplitudes; burst / slap: the noise
# bursts' decays and amplitudes. Level: day 1 as v1, RMS over its 120 ms STAMP_DB re the voice line RMS; days 2 and 3
# by their energy in the 300 Hz - 8 kHz band (what a phone speaker plays), `phone` dB above day 1's, so they are a
# little louder on a phone too and the rest of their extra weight is the thump under 300 Hz. Days 2 and 3 have more and
# lower thump with a longer decay and a lower, longer knock; their length is limited by the pauses they sit in (0.22 s
# of silence between s1-5 and s1-7, 0.26 s between s1-7 and s1-8b, less BWD_GAP and FWD_GAP): if a stamp still does not
# fit its pause, its tail is cut shorter (STAMP_MIN_LEN at least) and the change is printed.
STAMP_DB = -6.0
STAMPS = {
    1: dict(len=0.12, taper=0.04, thump=(95, 85, 0.012, 0.030, 0.45), body=((420, 680), (0.014, 0.009), (0.55, 0.32)),
            burst=(0.007, 1.1), slap=(0.0025, 0.33), phone=0.0),
    2: dict(len=0.15, taper=0.05, thump=(78, 92, 0.014, 0.042, 0.75), body=((385, 625), (0.018, 0.011), (0.58, 0.33)),
            burst=(0.008, 1.1), slap=(0.0025, 0.30), phone=0.7),
    3: dict(len=0.18, taper=0.06, thump=(64, 96, 0.016, 0.055, 1.0), body=((350, 575), (0.022, 0.013), (0.60, 0.34)),
            burst=(0.009, 1.1), slap=(0.0025, 0.28), phone=1.4),
}
STAMP_MIN_LEN = 0.10
STAMP_LEN = STAMPS[1]['len']
POP_LEN = 0.06
TICK_LEN = 0.022
GAUGE_DUR, GAUGE_N = 0.24, 3
GAUGE_STEP = 0.06  # s: ticks of one rise at least this far apart (fewer ticks when the rise is short)
END_NOTES = [(0.0, 74, 0.50, 0.10), (0.16, 69, 0.47, 0.0), (0.32, 62, 0.50, -0.10)]  # offset s, MIDI, velocity, pan
END_FADE = 0.5  # s: the motif fades to zero at the film's last sample
FILE_PEAK = -3.0  # dBFS: the sample peak of music.wav (mix.py sets the level in the mix)
SEP = 0.03  # s: a pop moved by --snap keeps this far from every other effect
POP_SNAP_MAX = 0.6  # s: --snap moves a pop at most this far
# provisional cues: (kind, line, index of the voiced span the slot ends at: 0 = the silence before the line, params)
# (pilot_short_1_v2.md: day 1 stamped before g1, day 2 after s1-5, day 3 after s1-7; the gauge after 「扛两倍」 is set
# in the pause before it, likewise 「八倍」 of s1-8b and s1-10's 「两倍」「8 倍」; the neighbours' 「？」 after g1's
# 「头顶到了 2 楼」 and 「……」 in g5b's pause after 「头顶到了 5 楼」; day 2's 「！」 has no pause of its own)
PROVISIONAL = [('stamp', 'g1', 0, {'day': 1}), ('stamp', 's1-7', 0, {'day': 2}), ('stamp', 's1-8b', 0, {'day': 3}),
               ('gauge', 's1-4', -1, {}), ('gauge', 's1-8b', -1, {}), ('gauge', 's1-10', 0, {}), ('gauge', 's1-10', 3, {}),
               ('pop', 's1-2', 0, {}), ('pop', 'g5b', 1, {})]


def db(x):
    return 20 * math.log10(max(float(x), 1e-12))


def rms(x):
    x = np.asarray(x, np.float64)
    return math.sqrt(float(np.mean(x * x))) if x.size else 0.0


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype='band', fs=SR, output='sos'), x).astype(F32)


def highpass(x, f, order=2):
    return sosfilt(butter(order, f, btype='high', fs=SR, output='sos'), x).astype(F32)


# ------------------------------------------------------------------ the sounds (mono, peak 1 before levelling)
def stamp_sound(day=1, length=None):
    """A rubber stamp on paper on a desk: a thump falling from about 180 Hz to its end frequency (95 Hz on day 1), a
    knock body at two partials (420 and 680 Hz on day 1: most of the level, so a phone speaker that plays nothing under
    ~300 Hz still plays the stamp), a noise burst at 0.9-4 kHz and a little paper slap at 4-8 kHz. STAMPS[day] sets
    the parameters (day 1: v1's 120 ms stamp, sample for sample); `length` (s) cuts it shorter (a pause too short for
    the day's stamp), with the same fade to zero. No reverb, seeded (always the same)."""
    p = STAMPS[day]
    L = p['len'] if length is None else min(p['len'], length)
    n = int(round(L * SR))
    t = np.arange(n) / SR
    r = np.random.default_rng(20261127)
    f_end, f_sw, tau_f, tau_th, a_th = p['thump']
    f = f_end + f_sw * np.exp(-t / tau_f)
    ph = 2 * np.pi * np.cumsum(f) / SR
    att = 1 - np.exp(-t / 0.0015)
    thump = (np.sin(ph) + 0.35 * np.sin(2 * ph)) * att * np.exp(-t / tau_th)
    (f1, f2), (d1, d2), (b1, b2) = p['body']
    body = (b1 * np.sin(2 * np.pi * f1 * t) * np.exp(-t / d1) + b2 * np.sin(2 * np.pi * f2 * t + 0.7) * np.exp(-t / d2)) * att
    w = r.standard_normal(n).astype(F32)
    burst = bandpass(w, 900, 4000) * (1 - np.exp(-t / 0.0004)) * np.exp(-t / p['burst'][0])
    slap = bandpass(r.standard_normal(n).astype(F32), 4000, 8000) * (1 - np.exp(-t / 0.0003)) * np.exp(-t / p['slap'][0])
    burst = burst / (np.max(np.abs(burst)) + 1e-12)
    slap = slap / (np.max(np.abs(slap)) + 1e-12)
    x = a_th * thump + 2.2 * body + p['burst'][1] * burst + p['slap'][1] * slap
    x = highpass(x.astype(F32), 50)
    k = int(min(p['taper'], L / 3) * SR)
    x[-k:] *= np.cos(np.linspace(0, np.pi / 2, k)) ** 2  # to zero at the end
    return (x / np.max(np.abs(x))).astype(F32)


def band_energy(x):
    x = bandpass(x, 300, 8000)
    return float(np.sum(np.asarray(x, np.float64) ** 2))


_stamp_gain = {}


def stamp_level(x, day):
    """The stamp x (stamp_sound(day, ...)) at its level in the mix: day 1 RMS over its 120 ms STAMP_DB re the voice line
    RMS (as v1); days 2 and 3 with STAMPS[day]['phone'] dB more 300 Hz - 8 kHz energy than day 1. The gain is the full
    stamp's: a stamp cut shorter keeps the level of the samples it keeps (the same sound, only its tail is gone)."""
    if day not in _stamp_gain:
        s1 = stamp_sound(1)
        g1 = 10 ** ((mix.VOICE_RMS_DB + STAMP_DB) / 20) / rms(s1)
        if day == 1:
            _stamp_gain[day] = g1
        else:
            full = stamp_sound(day)
            _stamp_gain[day] = g1 * math.sqrt(band_energy(s1) / band_energy(full) * 10 ** (STAMPS[day]['phone'] / 10))
    return (x * np.float32(_stamp_gain[day])).astype(F32)


def pop_sound():
    """A speech bubble popping up: a soft "bloop", a sine gliding up from 520 to 1250 Hz over its first 28 ms (a
    phone speaker plays all of it), attack 3 ms, decay time constant 13 ms, with a 1 ms breath of noise above 2 kHz at
    -18 dB under it at the start for definition; 60 ms, the last 20 ms a cos^2 fade to zero; seeded."""
    n = int(round(POP_LEN * SR))
    t = np.arange(n) / SR
    T = 0.028
    f = np.where(t < T, 520 * (1250 / 520) ** (t / T), 1250.0)
    ph = 2 * np.pi * np.cumsum(f) / SR
    env = (1 - np.exp(-t / 0.003)) * np.exp(-t / 0.013)
    tone = np.sin(ph) * env
    r = np.random.default_rng(4242)
    breath = highpass(r.standard_normal(n).astype(F32), 2000) * np.exp(-t / 0.001) * (1 - np.exp(-t / 0.0004))
    breath = breath / (np.max(np.abs(breath)) + 1e-12)
    x = highpass((tone / np.max(np.abs(tone)) + 10 ** (-18 / 20) * breath).astype(F32), 200)
    k = int(0.02 * SR)
    x[-k:] *= np.cos(np.linspace(0, np.pi / 2, k)) ** 2
    return (x / np.max(np.abs(x))).astype(F32)


def tick_sound(i, n):
    """One soft gauge tick: a damped 2.2-2.8 kHz ping (higher for later ticks of the rise) and a 1 ms noise click above
    3 kHz. 22 ms, ends at zero."""
    m = int(round(TICK_LEN * SR))
    t = np.arange(m) / SR
    f = 2200 + 600 * (i / max(n - 1, 1))
    r = np.random.default_rng(77 + i)
    ping = np.sin(2 * np.pi * f * t) * (1 - np.exp(-t / 0.0003)) * np.exp(-t / 0.0025)
    click = highpass(r.standard_normal(m).astype(F32), 3000) * np.exp(-t / 0.001)
    click = click / (np.max(np.abs(click)) + 1e-12)
    x = ping + 0.5 * click
    k = int(0.008 * SR)
    x[-k:] *= np.cos(np.linspace(0, np.pi / 2, k)) ** 2
    return (x / np.max(np.abs(x))).astype(F32)


def end_motif(samples, n_total, t0):
    """The end motif from t0 to the end of the film: three harp notes through the metre film's sampler (stereo)."""
    os.environ['VSCO_SAMPLES'] = samples
    if not os.path.isdir(os.path.join(samples, 'Strings', 'Harp')):
        raise SystemExit(f'the VSCO 2 CE harp samples are not in {samples}: pass --samples <folder>')
    sys.path.insert(0, SAMPLER_DIR)
    import sampler  # noqa: E402
    S = sampler.Sampler(SR, n_total)
    for dt, midi, vel, pan in END_NOTES:
        S.note('harp', t0 + dt, midi, vel, dur=1.4, pan=pan, bus='end')
    y = S.buses['end']
    i = np.arange(n_total)
    fade = np.clip((n_total - 1 - i) / (END_FADE * SR), 0, 1) ** 2  # 0 at the last sample
    y = y * fade.astype(F32)
    y[:, :max(0, int(t0 * SR) - int(0.01 * SR))] = 0
    return y, S.log


# ------------------------------------------------------------------ the narration as audio/mix.py builds it
def load_film():
    tl = json.load(open(TIMELINE_PATH, encoding='utf-8'))
    if not os.path.exists(PLACEMENTS_PATH):
        raise SystemExit(f'{PLACEMENTS_PATH} not found: run bun scripts/export.ts --film {FILM_ID} --cues --timeline --narration')
    cues = json.load(open(PLACEMENTS_PATH, encoding='utf-8'))
    frames, fps = int(tl['frames']), int(tl['fps'])
    if int(cues['frames']) != frames or int(cues['fps']) != fps:
        raise SystemExit(f"{PLACEMENTS_PATH} is for {cues['frames']} frames at {cues['fps']} fps, {TIMELINE_PATH} has {frames} "
                         f'at {fps}: run bun scripts/export.ts --film {FILM_ID} --cues --timeline --narration')
    lock = json.load(open(os.path.join(FILM, 'narration.lock.json'), encoding='utf-8'))
    missing = [p['id'] for p in cues['placements'] if p['id'] not in lock['lines']]
    if missing:
        raise SystemExit(f'{PLACEMENTS_PATH} places lines that are not in the narration lock {missing}: run the export again')
    n = -(-frames * SR // fps)  # audio/mix.py: ceil, the audio never ends before the last frame
    voice = np.zeros(n, F32)
    mask = np.zeros(n, F32)
    lines = []
    for p in cues['placements']:
        x = mix.decode(os.path.join(FILM, 'narration', f"{p['id']}.flac"), 1)[0]
        x = x * (10 ** (mix.VOICE_RMS_DB / 20) / max(10 ** (mix.rms_db(x) / 20), 1e-9))
        i = int(round(p['t'] * SR))
        x = x[:n - i]
        voice[i:i + len(x)] += x
        mask[max(0, i - int(mix.PRE * SR)):min(n, i + len(x) + int(mix.POST * SR))] = 1
        lines.append({'id': p['id'], 't': p['t'], 'i0': i, 'i1': i + len(x),
                      'spans': [(p['t'] + a, p['t'] + b) for a, b in lock['lines'][p['id']]['spans']]})
    away = mask == 0
    duck = (1 - (1 - 10 ** (mix.DUCK_DB / 20)) * np.clip(mix.smooth(mask, mix.RAMP), 0, 1)).astype(F32)
    return {'tl': tl, 'cues': cues, 'n': n, 'frames': frames, 'fps': fps, 'voice': voice, 'mask': mask, 'away': away,
            'duck': duck, 'lines': lines}


def frame_db(x):
    """5 ms frame levels (dBFS RMS) of a mono signal; frame k covers samples k*B .. (k+1)*B."""
    B = int(FRAME * SR)
    nb = len(x) // B
    e = (np.asarray(x[:nb * B], np.float64).reshape(nb, B) ** 2).mean(1)
    return 10 * np.log10(e + 1e-20), B


def speech_frames(voice):
    lv, B = frame_db(voice)
    return lv >= mix.VOICE_RMS_DB + VA_DB, B


def clear_slots(active, B, min_len=0.1):
    """Runs of non-speech frames at least min_len long: [(start s, end s)]."""
    out, k, nb = [], 0, len(active)
    while k < nb:
        if active[k]:
            k += 1
            continue
        j = k
        while j < nb and not active[j]:
            j += 1
        a, b = k * B / SR, j * B / SR
        if b - a >= min_len:
            out.append((round(a, 4), round(b, 4)))
        k = j
    return out


def speech_near(active, B, a, b):
    """Last speech frame end before time a, first speech frame start after time b (None if none within 2 s)."""
    ka, kb = int(a * SR) // B, int(math.ceil(b * SR / B))
    prev = next_ = None
    for k in range(min(ka, len(active)) - 1, max(-1, ka - int(2 / FRAME)), -1):
        if active[k]:
            prev = (k + 1) * B / SR
            break
    for k in range(max(kb, 0), min(len(active), kb + int(2 / FRAME))):
        if active[k]:
            next_ = k * B / SR
            break
    return prev, next_


def extent(x, t0):
    """Start and end (s) of a placed sound: its 5 ms frames within EXTENT_DB of its loudest."""
    lv, B = frame_db(x)
    ok = np.nonzero(lv >= lv.max() + EXTENT_DB)[0]
    return t0 + ok[0] * B / SR, t0 + (ok[-1] + 1) * B / SR


# ------------------------------------------------------------------ band check (a sound over speech)
BANDS = [1000 * 2 ** (k / 3) for k in range(-8, 10)]  # 1/3-octave centres 157 Hz .. 7.9 kHz
NFFT, HOP = 1024, 441


def band_worst(v, e, a, b):
    """The effect's level re the voice (dB), worst 1/3-octave band, over STFT frames (23 ms, 10 ms hop) between sample
    a and b where the voice is speech (windowed RMS >= VOICE_RMS_DB + VA_DB), the effect is within EXTENT_DB of its
    loudest frame there, and the band is within 35 dB of the voice's strongest band in that frame. None: no such frame."""
    w = np.hanning(NFFT).astype(np.float64)
    fr = np.fft.rfftfreq(NFFT, 1 / SR)
    edges = [(fc * 2 ** (-1 / 6), fc * 2 ** (1 / 6)) for fc in BANDS]
    idx = [np.nonzero((fr >= lo) & (fr < hi))[0] for lo, hi in edges]
    starts = list(range(max(0, a - NFFT // 2), max(0, min(len(v) - NFFT, b - NFFT // 2)) + 1, HOP))
    if not starts:
        return None
    ew = [rms(e[s:s + NFFT] * w) for s in starts]
    emax = max(ew) if ew else 0
    worst = None
    thr = 10 ** ((mix.VOICE_RMS_DB + VA_DB) / 20) * rms(w)
    for s, er in zip(starts, ew):
        vs = v[s:s + NFFT] * w
        if rms(vs) < thr or er < emax * 10 ** (EXTENT_DB / 20) or er <= 0:
            continue
        V = np.abs(np.fft.rfft(vs)) ** 2
        E = np.abs(np.fft.rfft(e[s:s + NFFT] * w)) ** 2
        vb = np.array([V[ix].sum() for ix in idx]) + 1e-30
        eb = np.array([E[ix].sum() for ix in idx]) + 1e-30
        use = vb >= vb.max() * 10 ** (-35 / 10)
        r = float(np.max(10 * np.log10(eb[use] / vb[use])))
        worst = r if worst is None else max(worst, r)
    return worst


# ------------------------------------------------------------------ cues
KINDS = ('stamp', 'gauge', 'pop', 'end')


def stamp_day(c, where):
    """A stamp cue's day (1, 2 or 3); a cue without one is day 1, said so."""
    d = c.get('day')
    if d is None:
        print(f'  {where}: stamp at {c["t"]:.3f}s has no day: day 1')
        return 1
    if d not in STAMPS and not (isinstance(d, (int, float)) and int(d) == d and int(d) in STAMPS):
        raise SystemExit(f'{where}: stamp day {d!r} in {c} (1, 2 or 3)')
    return int(d)


def read_cues(F, active, B, slots):
    if os.path.exists(CUES_PATH):
        raw = json.load(open(CUES_PATH, encoding='utf-8'))
        raw = raw.get('cues', raw) if isinstance(raw, dict) else raw
        cues = []
        for c in raw:
            k = str(c.get('kind', c.get('name', ''))).lower()
            k = {'tick': 'gauge'}.get(k, k)
            if k not in KINDS:
                raise SystemExit(f'sfx_cues.json: unknown kind {k!r} in {c} ({", ".join(KINDS)})')
            cue = {**{x: y for x, y in c.items() if x not in ('kind', 'name')}, 'kind': k, 't': float(c['t'])}
            if k == 'stamp':
                cue['day'] = stamp_day(cue, 'sfx_cues.json')
            cues.append(cue)
        return sorted(cues, key=lambda c: c['t']), 'sfx_cues.json'
    lines = {L['id']: L for L in F['lines']}

    def slot_before(t):  # the clear slot that ends at this speech onset
        best = min(slots, key=lambda s: abs(s[1] - t))
        if abs(best[1] - t) > 0.08:
            raise SystemExit(f'no clear slot ends near {t:.2f}s')
        return best
    cues = []
    for kind, lid, k, params in PROVISIONAL:
        a, b = slot_before(lines[lid]['spans'][k][0])
        where = f'silence before {lid}' if k == 0 else f'pause before voiced span {k} of {lid}'
        if kind in ('stamp', 'pop'):
            if kind == 'stamp':
                e0, e1 = extent(stamp_sound(params['day']), 0.0)
            else:
                e0, e1 = extent(pop_sound(), 0.0)
            ln = e1 - e0
            if b - a - BWD_GAP - FWD_GAP >= ln:  # centred in the room the gaps leave
                t = a + BWD_GAP + (b - a - BWD_GAP - FWD_GAP - ln) / 2 - e0
            else:  # too short: sfx.py cuts a stamp's tail (and stops for a pop)
                t = a + BWD_GAP - e0
            cues.append({'t': round(t, 3), 'kind': kind, **params, 'anchor': where, 'slot': [a, b]})
        else:
            dur = round(max(0.0, min(GAUGE_DUR, b - a - TICK_LEN - BWD_GAP - FWD_GAP - 0.04)), 3)
            t = a + (b - a - dur - TICK_LEN) / 2
            cues.append({'t': round(t, 3), 'kind': 'gauge', 'dur': dur, 'n': min(GAUGE_N, 1 + int(dur / GAUGE_STEP + 1e-9)),
                         'anchor': where, 'slot': [a, b]})
    last = F['lines'][-1]
    lastk = np.nonzero(active[:int(last['i1']) // B + 1])[0][-1]
    t_end = (lastk + 1) * B / SR + END_AFTER
    cues.append({'t': round(t_end, 3), 'kind': 'end', 'anchor': f"{END_AFTER} s after the voiced end of {last['id']}"})
    cues.sort(key=lambda c: c['t'])
    with open(PROVISIONAL_PATH, 'w', encoding='utf-8') as f:
        json.dump({'note': 'provisional cues derived from the committed audio; the scene builder writes sfx_cues.json',
                   'cues': cues, 'clear_slots': slots}, f, indent=1, ensure_ascii=False)
    return cues, 'provisional (no sfx_cues.json)'


def fits(slot, length):
    """Start times at which a sound of this extent fits in a clear slot with the gaps."""
    lo, hi = slot[0] + BWD_GAP, slot[1] - FWD_GAP - length
    return (round(lo, 3), round(hi, 3)) if hi >= lo else None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--samples', default=os.environ.get('VSCO_SAMPLES') or SAMPLES_DEFAULT)
    ap.add_argument('--snap', action='store_true', help='move a stamp or the end motif that lands on speech into the nearest clear slot')
    ap.add_argument('--mix', action='store_true', help='then run audio/mix.py and sfx_measure.py')
    ap.add_argument('--slots', action='store_true', help='print where a stamp or a gauge tick fits (the pauses) and exit')
    a = ap.parse_args()
    os.makedirs(os.path.join(SFX_OUT, 'stems'), exist_ok=True)
    F = load_film()
    n, voice, duck, away = F['n'], F['voice'], F['duck'], F['away']
    total = n / SR
    active, B = speech_frames(voice)
    slots = clear_slots(active, B)
    if a.slots:
        ext = {f'stamp day {d}': extent(stamp_sound(d), 0.0) for d in STAMPS}
        ext['pop'] = extent(pop_sound(), 0.0)
        ext['tick'] = extent(tick_sound(0, 1), 0.0)
        print('pauses (no speech frame; ' + ', '.join(f'{k} {e1 - e0:.3f}s' for k, (e0, e1) in ext.items()) +
              f'; {BWD_GAP}s clear before, {FWD_GAP}s after; a sound fits with its start t in the range given):')
        for sl in slots:
            if not fits(sl, ext['tick'][1] - ext['tick'][0]):
                continue
            nxt = next((L for L in F['lines'] if L['i0'] / SR >= sl[1] - 0.06), None)
            inside = next((L for L in F['lines'] if L['i0'] / SR < sl[0] and sl[1] < L['i1'] / SR), None)
            where = (f"inside {inside['id']}" if inside else f"before {nxt['id']}" if nxt else 'after the last line')
            parts = []
            for k, (e0, e1) in ext.items():
                ft = fits(sl, e1 - e0)
                parts.append(f'{k} ' + (f'{ft[0] - e0:.3f}-{ft[1] - e0:.3f}' if ft else 'no room'))
            print(f"  {sl[0]:7.3f}-{sl[1]:7.3f}s ({sl[1] - sl[0]:.2f}s, {where}): " + ', '.join(parts))
        print(f"  end motif: from {(np.nonzero(active)[0][-1] + 1) * B / SR + END_AFTER:.3f}s")
        return
    cues, source = read_cues(F, active, B, slots)
    print(f'sfx: {len(cues)} cues from {source}; film {F["frames"]} frames at {F["fps"]} fps = {total:.3f}s; '
          f'music away from the narration: {away.sum() / SR:.2f}s from {np.argmax(away) / SR:.2f}s')
    last_speech = (np.nonzero(active)[0][-1] + 1) * B / SR
    if not any(c['kind'] == 'end' for c in cues):
        # the end motif is the only sound away from the narration and audio/mix.py sets the music's gain from it
        cues.append({'t': round(last_speech + END_AFTER, 3), 'kind': 'end', 'anchor': 'added by sfx.py: no end cue in the cue file'})
        print(f'  no end cue: the end motif is placed at {last_speech + END_AFTER:.3f}s ({END_AFTER} s after the voice ends)')

    # every event at its level in the mix (pre-master units: the voice line RMS is VOICE_RMS_DB)
    fx = np.zeros((2, n), F32)
    endb = np.zeros((2, n), F32)
    events, errors, moved = [], [], []
    pop = pop_sound()
    pop *= np.float32(10 ** ((mix.VOICE_RMS_DB + POP_DB) / 20) / rms(pop))

    def nearest_slot(t):
        return min(slots, key=lambda s: 0 if s[0] <= t <= s[1] else min(abs(t - s[0]), abs(t - s[1])))

    def clear(t0, t1):
        prev, nxt = speech_near(active, B, t0, t1)
        k0, k1 = max(0, int((t0 - BWD_GAP) * SR) // B), int(math.ceil((t1 + FWD_GAP) * SR / B))
        hit = bool(active[k0:k1].any())
        return (not hit), prev, nxt

    def f3(v):
        return '-' if v is None else f'{float(v):.3f}'

    def slot_text(sl, length, what):
        fit = fits(sl, length)
        return (f'nearest clear slot {sl[0]:.3f}-{sl[1]:.3f}s: {what} fits with its start in {fit[0]:.3f}-{fit[1]:.3f}s' if fit
                else f'nearest clear slot {sl[0]:.3f}-{sl[1]:.3f}s is too short for {what}')

    def gauge_ticks(t, dur, nt):
        """The ticks of one rise: (events, sounds, errors)."""
        nt = max(1, min(nt, 1 + int(dur / GAUGE_STEP + 1e-9)))
        evs, snd, errs = [], [], []
        for j in range(nt):
            tj = t + (dur * j / (nt - 1) if nt > 1 else 0)
            x = tick_sound(j, nt)
            x *= np.float32(10 ** ((mix.VOICE_RMS_DB + TICK_DB) / 20) / rms(x))
            e0, e1 = extent(x, tj)
            ok, prev, nxt = clear(e0, e1)
            i = int(round(tj * SR))
            m = min(len(x), n - i)
            if not ok:
                errs.append(f'gauge tick at {tj:.3f}s is within {BWD_GAP}s/{FWD_GAP}s of speech (speech ends {f3(prev)}s, starts {f3(nxt)}s)')
                continue
            snd.append((i, x[:m]))
            evs.append({'kind': 'tick', 't': round(tj, 4), 'cue_t': t, 'start': round(e0, 4), 'end': round(e1, 4), 'speech_before': prev,
                        'speech_after': nxt, 'target_db': TICK_DB})
        return evs, snd, errs

    def stamp_at(day, L, t):
        x = stamp_level(stamp_sound(day, L), day)
        return (x,) + extent(x, t)

    def busy(t0, t1):
        """An effect already placed (stamp, tick or pop) within SEP of [t0, t1]."""
        return any(ev['start'] - SEP < t1 and t0 < ev['end'] + SEP for ev in events if ev['kind'] != 'end')

    # stamps first, then the gauges and the end motif, then the pops (a pop moved by --snap avoids what is placed)
    order = {'stamp': 0, 'gauge': 1, 'end': 2, 'pop': 3}
    for c in sorted(cues, key=lambda c: (order[c['kind']], c['t'])):
        kind, t = c['kind'], c['t']
        tag = {'anchor': c['anchor']} if 'anchor' in c else {}
        if kind == 'stamp':
            day = c.get('day', 1)
            L0 = L = STAMPS[day]['len']
            x, e0, e1 = stamp_at(day, L, t)
            ok, prev, nxt = clear(e0, e1)
            # too long for its pause: first cut its tail where it is (it stays on the picture's beat) ...
            while not ok and L - 0.005 >= STAMP_MIN_LEN - 1e-9:
                L = round(L - 0.005, 3)
                x, e0, e1 = stamp_at(day, L, t)
                ok, prev, nxt = clear(e0, e1)
            if not ok:  # ... else (speech before it, or still too long) move it with --snap, as long as fits there
                L = L0
                x, e0, e1 = stamp_at(day, L, t)
                sl = nearest_slot(t)
                while not fits(sl, e1 - e0) and L - 0.005 >= STAMP_MIN_LEN - 1e-9:
                    L = round(L - 0.005, 3)
                    x, e0, e1 = stamp_at(day, L, t)
                fit = fits(sl, e1 - e0)
                if a.snap and fit:
                    off = e0 - t
                    t_new = round(min(max(t, fit[0] - off), fit[1] - off), 3)
                    moved.append({'kind': kind, 'day': day, 'from': t, 'to': t_new, **({'len': L} if L < L0 else {})})
                    t = t_new
                    x, e0, e1 = stamp_at(day, L, t)
                    ok, prev, nxt = clear(e0, e1)
                else:
                    errors.append(f'stamp (day {day}) at {t:.3f}s ({e1 - e0:.3f}s long at {L:.3f}s) is within {BWD_GAP}s/{FWD_GAP}s of'
                                  f' speech (speech ends {f3(prev)}s, starts {f3(nxt)}s); ' + slot_text(sl, e1 - e0, 'the stamp'))
                    continue
            if L < L0:
                print(f'  stamp (day {day}) at {t:.3f}s: cut from {L0 * 1000:.0f} to {L * 1000:.0f} ms to stay clear of speech')
            i = int(round(t * SR))
            m = min(len(x), n - i)
            fx[:, i:i + m] += x[None, :m]
            events.append({'kind': kind, 'day': day, 't': t, 'start': round(e0, 4), 'end': round(e1, 4), 'speech_before': prev,
                           'speech_after': nxt, 'len_ms': round(L * 1000), **tag})
        elif kind == 'pop':
            e0, e1 = extent(pop, t)
            ok, prev, nxt = clear(e0, e1)
            if not ok:
                off, ln = e0 - t, e1 - e0
                best = None
                if a.snap:  # the nearest start within POP_SNAP_MAX that is clear of speech and of the effects placed
                    for sl in slots:
                        fit = fits(sl, ln)
                        if not fit or fit[1] < t + off - POP_SNAP_MAX or fit[0] > t + off + POP_SNAP_MAX:
                            continue
                        for s0 in np.arange(fit[0], fit[1] + 1e-9, 0.005):
                            if abs(s0 - (t + off)) <= POP_SNAP_MAX and not busy(s0, s0 + ln) and (
                                    best is None or abs(s0 - (t + off)) < abs(best - (t + off))):
                                best = float(s0)
                over = None
                if best is None:  # where it is, over speech: only if it stays MASK_MARGIN under the voice in every band
                    i = int(round(t * SR))
                    e = np.zeros(n, F32)
                    e[i:i + len(pop)] = pop[:n - i]
                    over = band_worst(voice, e, max(0, i - int(0.03 * SR)), min(n, i + len(pop) + int(0.06 * SR)))
                if best is None and over is not None and over <= -MASK_MARGIN:
                    print(f'  pop at {t:.3f}s: over speech, {-over:.1f} dB under the voice in its worst band (needs {MASK_MARGIN:.0f})')
                elif best is None:
                    sl = nearest_slot(t)
                    why = (f'pop at {t:.3f}s is within {BWD_GAP}s/{FWD_GAP}s of speech (speech ends {f3(prev)}s, starts {f3(nxt)}s) and only'
                           f' {-over:.1f} dB under the voice in its worst band; ' if over is not None else f'pop at {t:.3f}s: ')
                    if a.snap:  # a pop is decoration: left out rather than stop the build (rebuild.py repeats the WARNING)
                        print(f'  WARNING: {why}no clear room for it within {POP_SNAP_MAX}s: left out')
                        moved.append({'kind': kind, 'from': t, 'to': None})
                    else:
                        errors.append(why + slot_text(sl, ln, 'a pop'))
                    continue
                else:
                    t_new = round(best - off, 3)
                    moved.append({'kind': kind, 'from': t, 'to': t_new})
                    t = t_new
                    e0, e1 = extent(pop, t)
                    ok, prev, nxt = clear(e0, e1)
            if busy(e0, e1):
                print(f'  note: the pop at {t:.3f}s sounds within {SEP}s of another effect')
            i = int(round(t * SR))
            m = min(len(pop), n - i)
            fx[:, i:i + m] += pop[None, :m]
            events.append({'kind': kind, 't': t, 'start': round(e0, 4), 'end': round(e1, 4), 'speech_before': prev, 'speech_after': nxt,
                           'target_db': POP_DB, **tag})
        elif kind == 'gauge':
            nt, dur = int(c.get('n', GAUGE_N)), float(c.get('dur', GAUGE_DUR))
            evs, snd, errs = gauge_ticks(t, dur, nt)
            if errs:
                sl = nearest_slot(t)
                room = sl[1] - sl[0] - BWD_GAP - FWD_GAP - 0.02  # a tick's extent is about 15-20 ms
                if a.snap and room >= 0:
                    dur2 = round(min(dur, room), 3)
                    t2 = round(sl[0] + BWD_GAP + (room - dur2) / 2, 3)
                    moved.append({'kind': kind, 'from': t, 'to': t2, 'dur': dur2})
                    evs, snd, errs = gauge_ticks(t2, dur2, nt)
                if errs:
                    errors += [e + '; ' + slot_text(sl, 0.02, 'one tick') for e in errs]
                    continue
            for i, x in snd:
                fx[:, i:i + len(x)] += x[None, :]
            events += [{**e, **tag} for e in evs]
        else:  # end
            if t > total - 0.6:
                errors.append(f'end motif at {t:.3f}s: less than 0.6 s before the end of the film ({total:.3f}s)')
                continue
            if t < last_speech + END_AFTER:
                t_new = round(last_speech + END_AFTER, 3)
                print(f'  end cue {t:.3f}s is less than {END_AFTER}s after the voice ends ({last_speech:.3f}s): the motif starts at {t_new:.3f}s')
                moved.append({'kind': kind, 'from': t, 'to': t_new})
                t = t_new
            prev, _ = speech_near(active, B, t, t)
            y, notes = end_motif(a.samples, n, t)
            endb += y
            events.append({'kind': 'end', 't': t, 'start': round(t, 4), 'end': round(total, 4), 'speech_before': prev, 'speech_after': None,
                           'notes': [{'t': x[0], 'midi': x[2], 'vel': x[3]} for x in notes], **tag})
    if errors:
        raise SystemExit('effects on speech (nothing written):\n  ' + '\n  '.join(errors) + '\n  clear slots: ' +
                         ', '.join(f'{x:.2f}-{y:.2f}' for x, y in slots))

    events.sort(key=lambda e: e['t'])

    # the anchor: mix.py normalises the music's RMS away from the narration (before its duck) to VOICE_RMS_DB - BED_BELOW_DB
    T = 10 ** ((mix.VOICE_RMS_DB - mix.BED_BELOW_DB) / 20)
    fa, ea = (fx / duck)[:, away].astype(np.float64), (endb / duck)[:, away].astype(np.float64)
    N = fa.size
    qa, qb, qc = float(np.sum(ea * ea)), 2 * float(np.sum(fa * ea)), float(np.sum(fa * fa)) - T * T * N
    if qa <= 0:
        raise SystemExit('the end motif has no sound in the window away from the narration '
                         f'(from {np.argmax(away) / SR:.2f}s): move the end cue later')
    if qc >= 0:
        raise SystemExit('effects other than the end motif are already louder than the bed level away from the narration')
    k = (-qb + math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa)
    endb *= np.float32(k)
    X = fx + endb  # the effects as they go into the mix (after mix.py's gain and duck, before its headroom and master)
    Y = X / duck  # what mix.py must receive, up to its one gain
    gfile = float(np.max(np.abs(Y))) / 10 ** (FILE_PEAK / 20)
    music = (Y / gfile).astype(F32)
    music_path = os.path.join(OUT, 'music.wav')
    tmp = music_path + f'.{os.getpid()}.tmp.wav'
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(music.T, -1, 1) * 32767).round().astype(np.int16).tobytes())
    # check what mix.py will see: the file decoded as it decodes it
    dec = mix.decode(tmp, 2)
    if dec.shape[1] != n:
        os.remove(tmp)
        raise SystemExit(f'music.wav has {dec.shape[1]} samples, the film needs {n}')
    g_pred = 20 * math.log10(gfile)
    g_mix = mix.VOICE_RMS_DB - mix.BED_BELOW_DB - mix.rms_db(dec[:, away])
    os.replace(tmp, music_path)

    # levels in the mix, per event
    Xm = X.mean(axis=0)
    e_day1 = band_energy(stamp_level(stamp_sound(1), 1))
    act_rms = rms(np.concatenate([voice[int(a0 * SR):int(b0 * SR)] for L in F['lines'] for a0, b0 in L['spans']]))
    for ev in events:
        i0, i1 = int(ev['start'] * SR), int(ev['end'] * SR)
        seg = Xm[i0:i1]
        ev['rms_db_re_voice'] = round(db(rms(seg)) - mix.VOICE_RMS_DB, 2)
        ev['peak_dbfs_premaster'] = round(db(np.max(np.abs(X[:, i0:i1]))), 2)
        ev['band_300_8k_db_re_voice'] = round(db(rms(bandpass(seg, 300, 8000)) if len(seg) > 64 else 0) - mix.VOICE_RMS_DB, 2)
        ev['length_ms'] = round((ev['end'] - ev['start']) * 1000, 1)
        if ev['kind'] == 'stamp':  # what a phone plays of it, re day 1's stamp
            ev['phone_energy_db_re_day1'] = round(10 * math.log10(band_energy(Xm[i0:i1]) / e_day1), 2)
        if ev['kind'] != 'end':
            ev['gap_before_ms'] = None if ev['speech_before'] is None else round((ev['start'] - ev['speech_before']) * 1000)
            ev['gap_after_ms'] = None if ev['speech_after'] is None else round((ev['speech_after'] - ev['end']) * 1000)
        else:
            ev['gap_before_ms'] = None if ev['speech_before'] is None else round((ev['start'] - ev['speech_before']) * 1000)
            aw = X[:, away]
            ev['rms_away_db_re_voice'] = round(db(rms(aw)) - mix.VOICE_RMS_DB, 2)
            ev['rms_first_1s_db_re_voice'] = round(db(rms(Xm[i0:i0 + SR])) - mix.VOICE_RMS_DB, 2)
    levels = {
        'source': source, 'moved': moved, 'film': {'frames': F['frames'], 'fps': F['fps'], 'samples': n},
        'targets_db_re_voice_line_rms': {'stamp_day1_rms_120ms': STAMP_DB, 'tick_rms_22ms': TICK_DB, 'pop_rms_60ms': POP_DB,
                                         'end_rms_away': -mix.BED_BELOW_DB},
        'stamp_phone_energy_db_re_day1': {d: STAMPS[d]['phone'] for d in STAMPS},
        'stamp_len_ms': {d: round(STAMPS[d]['len'] * 1000) for d in STAMPS},
        'voice_active_rms_db_re_line': round(db(act_rms) - mix.VOICE_RMS_DB, 2),
        'away_window_s': [round(float(np.argmax(away)) / SR, 3), round(total, 3)],
        'predicted_mix_gain_on_music_wav_db': round(g_pred, 3), 'mix_gain_from_decoded_file_db': round(g_mix, 3),
        'clear_slots': slots, 'events': events,
    }
    with open(os.path.join(SFX_OUT, 'levels.json'), 'w', encoding='utf-8') as f:
        json.dump(levels, f, indent=1, ensure_ascii=False)
    with open(os.path.join(SFX_OUT, 'cues_used.json'), 'w', encoding='utf-8') as f:
        json.dump([{'t': e['t'], 'kind': e['kind'], **({'day': e['day']} if 'day' in e else {})} for e in events if e['kind'] != 'tick'] +
                  [{'t': e['t'], 'kind': 'tick', 'cue_t': e['cue_t']} for e in events if e['kind'] == 'tick'], f, indent=1)
    import scipy.io.wavfile as wavfile
    wavfile.write(os.path.join(SFX_OUT, 'stems', 'fx_in_mix.wav'), SR, X.T.astype(np.float32))
    wavfile.write(os.path.join(SFX_OUT, 'stems', 'voice_in_mix.wav'), SR, voice.astype(np.float32))
    print(f'music.wav: {n} samples, peak {FILE_PEAK} dBFS; mix.py gain on it predicted {g_pred:+.2f} dB, from the decoded file {g_mix:+.2f} dB')
    for ev in events:
        gb, ga = ev.get('gap_before_ms'), ev.get('gap_after_ms')
        k = ev['kind'] + (str(ev['day']) if 'day' in ev else '')
        print(f"  {k:6s} {ev['t']:7.3f}s  {ev['length_ms']:6.1f} ms  rms {ev['rms_db_re_voice']:+6.1f} dB re voice"
              f"  (300 Hz-8 kHz {ev['band_300_8k_db_re_voice']:+6.1f})  peak {ev['peak_dbfs_premaster']:+6.1f} dBFS"
              f"  clear of speech: {gb} ms before, {ga} ms after"
              + (f"; phone band energy {ev['phone_energy_db_re_day1']:+.1f} dB re day 1" if 'phone_energy_db_re_day1' in ev else ''))
    if moved:
        print('moved (the picture must follow, see out/grow1/sfx/cues_used.json): ' + ', '.join(f"{m['kind']} {m['from']} -> {m['to']}" for m in moved))
    if a.mix:
        sys.stdout.flush()
        r = subprocess.run([sys.executable, os.path.join(ROOT, 'audio', 'mix.py'), '--film', FILM_ID, '--music', music_path,
                            '--placements', PLACEMENTS_PATH], cwd=ROOT)
        if r.returncode:
            raise SystemExit(f'audio/mix.py failed ({r.returncode})')
        r = subprocess.run([sys.executable, os.path.join(TOOLS, 'sfx_measure.py')], cwd=ROOT)
        if r.returncode:
            raise SystemExit(f'sfx_measure.py failed ({r.returncode})')


if __name__ == '__main__':
    main()
