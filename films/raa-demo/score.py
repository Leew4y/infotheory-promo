"""Score for raa-demo: a light, steady bed in C major at 80 BPM (felt piano arpeggio over soft strings), no drums.

    just cues raa-demo         (the page writes films/raa-demo/cues.json and timeline.json)
    just music raa-demo        -> out/raa-demo/music.wav (master), out/raa-demo/music.mp3 (preview)

The voice carries the film; the mix (just mix) sets the music 10 dB under it and ducks it under every line. Chords
change on the bar grid of the film (bpm 80, one bar = 3 s), so they line up with the timeline and the loop points.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'audio'))
import synth  # noqa: E402
from synth import bed, felt, strings  # noqa: E402

synth.init(synth.load_json(os.path.join(HERE, 'timeline.json')))
C3, G3, A3, F3, E4, G4, C4, A4, B3, D4, F4 = 48, 55, 57, 53, 64, 67, 60, 69, 59, 62, 65
CHORDS = [[C3, G3, E4], [A3, E4, C4 + 12], [F3, C4, A4], [G3, D4, B3 + 12]]  # I vi IV V
T = synth.TOTAL
bar = synth.BAR
t, k = 0.0, 0
while t < T - 0.5:
    ch = CHORDS[k % len(CHORDS)]
    strings(t, ch, min(bar * 2, T - t) + 0.5, .010, att=1.2, rel=2.0, cut=1600)
    for i, m in enumerate([ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12]):
        felt(t + i * synth.BEAT * 2, m + 12, .016, 2.4)
    t += bar * 2
    k += 1
bed(0.0, [C3, G3], T, .010, att=3.0, rel=3.0)
synth.place_cues(synth.load_json(os.path.join(HERE, 'cues.json')))
synth.render(os.path.join(ROOT, 'out', 'raa-demo', 'music.wav'), os.path.join(ROOT, 'out', 'raa-demo', 'music.mp3'))
