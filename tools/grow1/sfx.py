"""Sound for the pilot short grow1 (《长高一倍，体重变几倍？》): no music under the voice, only effects.

    python D:/demo/.cache/grow1-tools/sfx.py [--snap] [--mix] [--samples D:/earthage-promo/audio/samples]
        -> out/grow1/music.wav (the bed audio/mix.py expects: silent except the effects)
    python audio/mix.py --film grow1 --music out/grow1/music.wav        (from the repository root; --mix runs it)
    python D:/demo/.cache/grow1-tools/sfx_measure.py                    (--mix runs it too)

Cues: D:/demo/.cache/grow1-tools/sfx_cues.json, written by the scene builder, film seconds:
    [{"t": 2.62, "kind": "stamp"}, {"t": 15.30, "kind": "gauge"}, {"t": 35.07, "kind": "end"}]
  (a bare list, or {"cues": [...]}; "name" is accepted for "kind", "tick" for "gauge"). Per kind:
  - stamp: the rubber stamp's impact at t (the counter step). Synthesised: a low thump, a knock body at 420/680 Hz
    (so a phone speaker plays it) and a short band-passed noise burst; 120 ms, no reverb, the same sound every time.
  - gauge: the pressure gauge starts rising at t; optional "dur" (s the ticks are spread over, default 0.24) and "n"
    (ticks, default 3, fewer if they would be closer than GAUGE_STEP). Soft high ticks, each 22 ms, a little higher in
    pitch each time.
  - end: the end motif starts at t: three harp notes (VSCO 2 CE, CC0) D5 A4 D4, 0.16 s apart, faded to zero at the
    film's last sample.
  Without sfx_cues.json: provisional cues from the committed audio (a stamp in the silence before s1-2, s1-5, s1-7 and
  s1-8; gauge ticks in the pauses before 「扛两倍」「四倍」「八倍」 and before s1-10's 「两倍」 and 「八倍」; the end motif after
  the voiced end of s1-11). They are written to sfx_cues.provisional.json (not sfx_cues.json) with the clear slots.
  A cue file without an end cue gets the provisional one (the motif is the only sound mix.py can set its gain from).

Never under a syllable: the voice is placed and levelled exactly as audio/mix.py does; a 5 ms frame is speech when its
RMS is at least VOICE_RMS_DB + VA_DB. Every stamp and gauge tick must leave BWD_GAP s after the last speech frame before
it and FWD_GAP s (from where its own level is 40 dB under its peak) before the next. Otherwise the script stops and names
the clear slot nearest the cue and the start times that fit in it; --snap moves such a cue into that slot instead (a
gauge rise is shortened to fit; the picture must then follow: out/grow1/sfx/cues_used.json). An end cue earlier than
0.10 s after the voice's end is moved there (the tail card has no sync point), and said so.

Levels in the mix, as audio/mix.py will leave them (it scales the music by one gain so that its RMS away from the
narration is BED_BELOW_DB under the voice, and ducks it DUCK_DB under each line, from PRE s before a line to POST s
after). The gaps between lines here are 0.35-0.41 s, shorter than PRE + POST, so the duck never opens before the last
line: the only music "away from the narration" is the tail after s1-11, i.e. the end motif. The motif is therefore the
anchor: its RMS over that window (divided by the duck curve) is set to VOICE_RMS_DB - BED_BELOW_DB, which leaves
mix.py's gain at the value predicted here. Every other effect is built at its level in the mix (STAMP_DB, TICK_DB re
the voice line RMS) and divided by the predicted gain and mix.py's duck curve. So music.wav alone is not
representative: the stamps in it are 10 dB hotter than the mix will leave them.

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
ROOT = os.environ.get('GROW1_REPO', 'D:/promo-films-light')
FILM_ID = 'grow1'
FILM = os.path.join(ROOT, 'films', FILM_ID)
OUT = os.path.join(ROOT, 'out', FILM_ID)
SFX_OUT = os.path.join(OUT, 'sfx')
CUES_PATH = os.environ.get('GROW1_SFX_CUES') or os.path.join(TOOLS, 'sfx_cues.json')  # the env var only for tests
PROVISIONAL_PATH = os.path.join(TOOLS, 'sfx_cues.provisional.json')
SAMPLES_DEFAULT = 'D:/earthage-promo/audio/samples'
SAMPLER_DIR = os.path.join(ROOT, 'films', 'metre', 'audio')  # sampler.py of the metre film (VSCO 2 CE player)

sys.path.insert(0, os.path.join(ROOT, 'audio'))
import mix  # noqa: E402  (audio/mix.py: the mixer's rate, levels, masks)

SR = mix.SR
F32 = np.float32
# levels in the mix, dB re the voice line RMS (mix.VOICE_RMS_DB, every line levelled to it)
STAMP_DB = -6.0  # RMS over the stamp's 120 ms
TICK_DB = -16.0  # RMS over each 22 ms tick
# speech detection and the clearance rules
FRAME = 0.005  # s
VA_DB = -25.0  # a 5 ms frame is speech when its RMS is at least VOICE_RMS_DB + VA_DB
BWD_GAP, FWD_GAP = 0.02, 0.06  # s: clear of speech before an effect's start / after its end (-40 dB re its peak)
EXTENT_DB = -40.0  # an effect's extent: its 5 ms frames within this of its loudest frame
MASK_MARGIN = 12.0  # dB: sfx_measure.py's verdict for an effect that overlaps speech (none should): this far under the
#                    voice in every 1/3-octave band the voice uses
END_AFTER = 0.10  # s: the end motif starts at least this long after the voice's last speech frame
# the sounds
STAMP_LEN = 0.12
TICK_LEN = 0.022
GAUGE_DUR, GAUGE_N = 0.24, 3
GAUGE_STEP = 0.06  # s: ticks of one rise at least this far apart (fewer ticks when the rise is short)
END_NOTES = [(0.0, 74, 0.50, 0.10), (0.16, 69, 0.47, 0.0), (0.32, 62, 0.50, -0.10)]  # offset s, MIDI, velocity, pan
END_FADE = 0.5  # s: the motif fades to zero at the film's last sample
FILE_PEAK = -3.0  # dBFS: the sample peak of music.wav (mix.py sets the level in the mix)
# provisional cues: (kind, line, index of the voiced span the slot ends at: 0 = the silence before the line)
PROVISIONAL = [('stamp', 's1-2', 0), ('stamp', 's1-5', 0), ('stamp', 's1-7', 0), ('stamp', 's1-8', 0),
               ('gauge', 's1-4', -1), ('gauge', 's1-6', -1), ('gauge', 's1-8', -1), ('gauge', 's1-10', 0), ('gauge', 's1-10', 3)]


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
def stamp_sound():
    """A rubber stamp on paper on a desk: a thump falling from 180 to 95 Hz, a knock body at 420 and 680 Hz (most of the
    level, so a phone speaker that plays nothing under ~300 Hz still plays the stamp), a noise burst at 0.9-4 kHz and a
    little paper slap at 4-8 kHz. 120 ms, ends at zero, no reverb, seeded (always the same)."""
    n = int(round(STAMP_LEN * SR))
    t = np.arange(n) / SR
    r = np.random.default_rng(20261127)
    f = 95 + 85 * np.exp(-t / 0.012)
    ph = 2 * np.pi * np.cumsum(f) / SR
    att = 1 - np.exp(-t / 0.0015)
    thump = (np.sin(ph) + 0.35 * np.sin(2 * ph)) * att * np.exp(-t / 0.030)
    body = (0.55 * np.sin(2 * np.pi * 420 * t) * np.exp(-t / 0.014) + 0.32 * np.sin(2 * np.pi * 680 * t + 0.7) * np.exp(-t / 0.009)) * att
    w = r.standard_normal(n).astype(F32)
    burst = bandpass(w, 900, 4000) * (1 - np.exp(-t / 0.0004)) * np.exp(-t / 0.007)
    slap = bandpass(r.standard_normal(n).astype(F32), 4000, 8000) * (1 - np.exp(-t / 0.0003)) * np.exp(-t / 0.0025)
    burst = burst / (np.max(np.abs(burst)) + 1e-12)
    slap = slap / (np.max(np.abs(slap)) + 1e-12)
    x = 0.45 * thump + 2.2 * body + 1.1 * burst + 0.33 * slap
    x = highpass(x.astype(F32), 50)
    k = int(0.04 * SR)
    x[-k:] *= np.cos(np.linspace(0, np.pi / 2, k)) ** 2  # to zero by 120 ms
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
    tl = json.load(open(os.path.join(FILM, 'timeline.json'), encoding='utf-8'))
    cues_path = os.path.join(OUT, 'narration.cues.json')
    if not os.path.exists(cues_path):
        raise SystemExit(f'out/{FILM_ID}/narration.cues.json not found: run bun scripts/export.ts --film {FILM_ID} --cues --timeline --narration')
    cues = json.load(open(cues_path, encoding='utf-8'))
    frames, fps = int(tl['frames']), int(tl['fps'])
    if int(cues['frames']) != frames or int(cues['fps']) != fps:
        raise SystemExit(f"out/{FILM_ID}/narration.cues.json is for {cues['frames']} frames at {cues['fps']} fps, the timeline has {frames} "
                         f'at {fps}: run bun scripts/export.ts --film {FILM_ID} --cues --timeline --narration')
    lock = json.load(open(os.path.join(FILM, 'narration.lock.json'), encoding='utf-8'))
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
def read_cues(F, active, B, slots):
    if os.path.exists(CUES_PATH):
        raw = json.load(open(CUES_PATH, encoding='utf-8'))
        raw = raw.get('cues', raw) if isinstance(raw, dict) else raw
        cues = []
        for c in raw:
            k = str(c.get('kind', c.get('name', ''))).lower()
            k = {'tick': 'gauge'}.get(k, k)
            if k not in ('stamp', 'gauge', 'end'):
                raise SystemExit(f'sfx_cues.json: unknown kind {k!r} in {c} (stamp, gauge, end)')
            cues.append({**{x: y for x, y in c.items() if x not in ('kind', 'name')}, 'kind': k, 't': float(c['t'])})
        return sorted(cues, key=lambda c: c['t']), 'sfx_cues.json'
    lines = {L['id']: L for L in F['lines']}

    def slot_before(t):  # the clear slot that ends at this speech onset
        best = min(slots, key=lambda s: abs(s[1] - t))
        if abs(best[1] - t) > 0.08:
            raise SystemExit(f'no clear slot ends near {t:.2f}s')
        return best
    cues = []
    for kind, lid, k in PROVISIONAL:
        a, b = slot_before(lines[lid]['spans'][k][0])
        if kind == 'stamp':
            t = a + (b - a - STAMP_LEN) / 2
            cues.append({'t': round(t, 3), 'kind': 'stamp', 'anchor': f'silence before {lid}', 'slot': [a, b]})
        else:
            dur = round(max(0.0, min(GAUGE_DUR, b - a - TICK_LEN - BWD_GAP - FWD_GAP - 0.04)), 3)
            t = a + (b - a - dur - TICK_LEN) / 2
            cues.append({'t': round(t, 3), 'kind': 'gauge', 'dur': dur, 'n': min(GAUGE_N, 1 + int(dur / GAUGE_STEP + 1e-9)),
                         'anchor': f'pause before voiced span {k} of {lid}', 'slot': [a, b]})
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
        st = stamp_sound()
        e0, e1 = extent(st, 0.0)
        tk = tick_sound(0, 1)
        k0, k1 = extent(tk, 0.0)
        starts = {L['i0'] / SR: L['id'] for L in F['lines']}
        print(f'pauses (no speech frame; a stamp is {e1 - e0:.3f}s, a tick {k1 - k0:.3f}s; {BWD_GAP}s clear before, {FWD_GAP}s after):')
        for sl in slots:
            fs, ft = fits(sl, e1 - e0), fits(sl, k1 - k0)
            if not ft:
                continue
            nxt = min((t for t in starts if t >= sl[1] - 0.06), default=None)
            where = ('after the last line' if nxt is None else f'before {starts[nxt]}' if nxt - sl[1] < 0.06 else 'inside a line')
            print(f"  {sl[0]:7.3f}-{sl[1]:7.3f}s ({sl[1] - sl[0]:.2f}s, {where}): stamp start {f'{fs[0]:.3f}-{fs[1]:.3f}s' if fs else 'no room'}, "
                  f'ticks from {ft[0]:.3f}s to {ft[1]:.3f}s')
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
    stamp = stamp_sound()
    stamp *= np.float32(10 ** ((mix.VOICE_RMS_DB + STAMP_DB) / 20) / rms(stamp))

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

    for c in cues:
        kind, t = c['kind'], c['t']
        tag = {'anchor': c['anchor']} if 'anchor' in c else {}
        if kind == 'stamp':
            e0, e1 = extent(stamp, t)
            ok, prev, nxt = clear(e0, e1)
            if not ok:
                sl = nearest_slot(t)
                fit = fits(sl, e1 - e0)
                if a.snap and fit:
                    t_new = round(min(max(t, fit[0]), fit[1]), 3)
                    moved.append({'kind': kind, 'from': t, 'to': t_new})
                    t = t_new
                    e0, e1 = extent(stamp, t)
                    ok, prev, nxt = clear(e0, e1)
                else:
                    errors.append(f'stamp at {t:.3f}s ({e1 - e0:.3f}s long) is within {BWD_GAP}s/{FWD_GAP}s of speech '
                                  f'(speech ends {f3(prev)}s, starts {f3(nxt)}s); ' + slot_text(sl, e1 - e0, 'a stamp'))
                    continue
            i = int(round(t * SR))
            m = min(len(stamp), n - i)
            fx[:, i:i + m] += stamp[None, :m]
            events.append({'kind': kind, 't': t, 'start': round(e0, 4), 'end': round(e1, 4), 'speech_before': prev, 'speech_after': nxt,
                           'target_db': STAMP_DB, **tag})
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
    act_rms = rms(np.concatenate([voice[int(a0 * SR):int(b0 * SR)] for L in F['lines'] for a0, b0 in L['spans']]))
    for ev in events:
        i0, i1 = int(ev['start'] * SR), int(ev['end'] * SR)
        seg = Xm[i0:i1]
        ev['rms_db_re_voice'] = round(db(rms(seg)) - mix.VOICE_RMS_DB, 2)
        ev['peak_dbfs_premaster'] = round(db(np.max(np.abs(X[:, i0:i1]))), 2)
        ev['band_300_8k_db_re_voice'] = round(db(rms(bandpass(seg, 300, 8000)) if len(seg) > 64 else 0) - mix.VOICE_RMS_DB, 2)
        ev['length_ms'] = round((ev['end'] - ev['start']) * 1000, 1)
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
        'targets_db_re_voice_line_rms': {'stamp_rms_120ms': STAMP_DB, 'tick_rms_22ms': TICK_DB,
                                         'end_rms_away': -mix.BED_BELOW_DB},
        'voice_active_rms_db_re_line': round(db(act_rms) - mix.VOICE_RMS_DB, 2),
        'away_window_s': [round(float(np.argmax(away)) / SR, 3), round(total, 3)],
        'predicted_mix_gain_on_music_wav_db': round(g_pred, 3), 'mix_gain_from_decoded_file_db': round(g_mix, 3),
        'clear_slots': slots, 'events': events,
    }
    with open(os.path.join(SFX_OUT, 'levels.json'), 'w', encoding='utf-8') as f:
        json.dump(levels, f, indent=1, ensure_ascii=False)
    with open(os.path.join(SFX_OUT, 'cues_used.json'), 'w', encoding='utf-8') as f:
        json.dump([{'t': e['t'], 'kind': e['kind']} for e in events if e['kind'] != 'tick'] +
                  [{'t': e['t'], 'kind': 'tick', 'cue_t': e['cue_t']} for e in events if e['kind'] == 'tick'], f, indent=1)
    import scipy.io.wavfile as wavfile
    wavfile.write(os.path.join(SFX_OUT, 'stems', 'fx_in_mix.wav'), SR, X.T.astype(np.float32))
    wavfile.write(os.path.join(SFX_OUT, 'stems', 'voice_in_mix.wav'), SR, voice.astype(np.float32))
    print(f'music.wav: {n} samples, peak {FILE_PEAK} dBFS; mix.py gain on it predicted {g_pred:+.2f} dB, from the decoded file {g_mix:+.2f} dB')
    for ev in events:
        gb, ga = ev.get('gap_before_ms'), ev.get('gap_after_ms')
        print(f"  {ev['kind']:5s} {ev['t']:7.3f}s  {ev['length_ms']:6.1f} ms  rms {ev['rms_db_re_voice']:+6.1f} dB re voice"
              f"  (300 Hz-8 kHz {ev['band_300_8k_db_re_voice']:+6.1f})  peak {ev['peak_dbfs_premaster']:+6.1f} dBFS"
              f"  clear of speech: {gb} ms before, {ga} ms after")
    if moved:
        print('moved (the picture must follow, see out/grow1/sfx/cues_used.json): ' + ', '.join(f"{m['kind']} {m['from']} -> {m['to']}" for m in moved))
    if a.mix:
        sys.stdout.flush()
        r = subprocess.run([sys.executable, os.path.join(ROOT, 'audio', 'mix.py'), '--film', FILM_ID, '--music', music_path], cwd=ROOT)
        if r.returncode:
            raise SystemExit(f'audio/mix.py failed ({r.returncode})')
        r = subprocess.run([sys.executable, os.path.join(TOOLS, 'sfx_measure.py')], cwd=ROOT)
        if r.returncode:
            raise SystemExit(f'sfx_measure.py failed ({r.returncode})')


if __name__ == '__main__':
    main()
