"""Score for tongzhou (同舟): a light, forward-moving bed in D major at 80 BPM — felt piano on the beat over soft
strings, a cello root from the first chapter on, a lift under the result card, a resolve on the closing plate.
No drums; nothing competes with the voice (just mix sets the music under it and ducks it under every line).

    just cues tongzhou         (the page writes films/tongzhou/cues.json and timeline.json)
    just music tongzhou        -> out/tongzhou/music.wav (master), out/tongzhou/music.mp3 (preview)

Chords change on the film's bar grid (bpm 80, one bar = 3 s), placed from scene starts in timeline.json.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'audio'))
import synth  # noqa: E402
from synth import bed, cello, felt, strings, fx_chime, fx_swell, fx_tone  # noqa: E402

synth.init(synth.load_json(os.path.join(HERE, 'timeline.json')))
BAR, BEAT, T = synth.BAR, synth.BEAT, synth.TOTAL
# D major: I V vi IV, voiced close and mid-register so it stays out of the voice's way
CH = {
    'D': [50, 57, 62, 66], 'A': [45, 57, 61, 64], 'Bm': [47, 54, 62, 66], 'G': [43, 55, 59, 62],
}
LOOP = ['D', 'A', 'Bm', 'G']


def bars(t0, t1, gain_felt, gain_str, low=False, arp=True):
    """One chord per bar from t0 up to t1: strings bed, felt notes on beats 1-4 an octave up, optional cello root."""
    t, k = t0, 0
    while t < t1 - 0.25:
        c = CH[LOOP[k % 4]]
        dur = min(BAR, t1 - t)
        strings(t, [m + 12 for m in c[1:]], dur + 0.4, gain_str, att=1.0, rel=1.6, cut=2000)
        if arp:
            for i, m in enumerate([c[1], c[2], c[3], c[2]]):
                if t + i * BEAT < t1 - 0.1:
                    felt(t + i * BEAT, m + 12, gain_felt * (1.0 if i == 0 else .75), 2.0, pan=(-.3, .1, .3, -.1)[i])
        if low:
            cello(t, c[0], dur * .95, .03)
        t += BAR
        k += 1


title, value, understand, result, end = (synth.at(s) for s in ('title', 'value', 'understand', 'result', 'end'))
# opening: a pad and a swell under the name, a chime when the name lands
bed(0.0, [50, 57], value + 0.5, .012, att=2.0, rel=1.5)
fx_swell(0.2, 3.0)
fx_chime(1.1, 74)
# value card: piano and strings, no low end yet
bars(value, understand, .014, .008)
# the six chapters: same loop with a cello root; a soft tone on each chapter's first beat
bars(understand, result, .013, .008, low=True)
for s in ('understand', 'decide', 'check', 'guide', 'replan', 'cost'):
    fx_tone(synth.at(s), 74)
# result: a lift (brighter strings, a little more piano)
bars(result, end, .016, .011, low=True)
fx_swell(result - 1.5, 2.5)
# closing: resolve on D, a last chime, let it ring out
strings(end, [62, 66, 69, 74], T - end, .010, att=0.8, rel=2.0, cut=2200)
cello(end, 38, T - end, .03)
felt(end, 74, .016, 3.5)
fx_chime(end + 0.6, 78)
synth.place_cues(synth.load_json(os.path.join(HERE, 'cues.json')))
synth.render(os.path.join(ROOT, 'out', 'tongzhou', 'music.wav'), os.path.join(ROOT, 'out', 'tongzhou', 'music.mp3'))
