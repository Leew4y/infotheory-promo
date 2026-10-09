"""Score for math-lessons: D Dorian, 60 BPM, a liturgical texture (held bass and drones, single bells), no drums.

    just cues math-lessons     (the page writes films/math-lessons/cues.json and timeline.json)
    just music math-lessons    -> out/math-lessons/music.wav (master), out/math-lessons/music.mp3 (preview)

Design: script/sound.md. There is no voice track yet; the music leaves the voice's band (200-1000 Hz) free of
sustained melody and stays about 3 dB under the reference film. The page's cue sheet carries the sound marks: the
verse bell (chime, pitch rising with the verse number), the refrain's low D, the counter-argument's lower A.
Positions are relative to scenes (at(scene) + seconds), so the score follows if a scene's length changes.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'audio'))
import synth  # noqa: E402
from synth import at, bed, cello, chordf, felt, strings, sub  # noqa: E402

synth.init(synth.load_json(os.path.join(HERE, 'timeline.json')))
D1, A1, B1f, C2, D2, A2, D3, F3, A3, D4, E4, F4, G4, A4, D5 = 26, 33, 34, 36, 38, 45, 50, 53, 57, 62, 64, 65, 67, 69, 74
UP = 24  # single bells sit two octaves up, above the future voice's band (measured after the first render)
end = lambda scene: synth.SCENES[scene]['end']  # noqa: E731
span = lambda a, b: end(b) - at(a)  # noqa: E731

# ---- invocation and title: the drone rises out of nothing; the title adds a dark open fifth
bed(at('invocation'), [D2, A2], span('invocation', 'title') + 1.0, .016, att=6.0, rel=3.0)
sub(at('invocation') + 2.0, D2, span('invocation', 'title') - 2.0, .022)
strings(at('title'), [D3, A3, D4], 5.0, .009, att=2.0, rel=2.5, cut=1200)

# ---- chapter 1 (fontenelle .. numbers): a held D Dorian drone
bed(at('fontenelle'), [D2, A2, D3], span('fontenelle', 'defenders') - .4, .022, att=2.0)
# the cycloid keeps time: the bass changes when the beads reach the bottom (9 s after the scene's start + 1, 3, 5)
for k, t in enumerate([10.0, 12.0, 14.0]):
    cello(at('cycloid') + t, D2 if k % 2 == 0 else A1, 1.9, .03, att=.15, rel=1.2)
# the litany of defenders: one bell per name, then everything holds its breath at Hardy's "no"
for t, m in [(0.8, D4), (1.8, F4), (2.8, A4)]:
    felt(at('defenders') + t, m + UP, .022, 2.6)
# Hardy's "no": the drone stops for a beat, then returns under his defence
bed(at('hardy') + 1.6, [D2, A2], span('hardy', 'hardy') - 1.6, .02, att=1.5)
felt(at('hardy') + 7.7, D5 + 12, .022, 3.0)
# number theory: the bass moves to C (the Dorian flat seventh); D returns with Hardy
bed(at('numbers'), [C2, 43], span('numbers', 'numbers'), .02, att=1.5)

# ---- chapter 2 (release, needed): the drone brightens for the numbers, darkens for the argument
bed(at('release'), [D2, A2], span('release', 'release'), .02, att=1.0)
strings(at('release') + 1.0, [D4, A4], 12.5, .012, att=3.0, rel=2.0, cut=2600)
bed(at('needed'), [D2, A2, D3], span('needed', 'needed'), .022, att=1.5)

# ---- chapter 3 (statement, dispute): the bass hangs on A, unresolved; three single notes for three voices
bed(at('statement'), [A1, A2], span('statement', 'statement'), .022, att=1.5)
felt(at('statement') + 10.8, A4 + UP, .022, 3.0)
for t, m in [(0.6, E4), (1.4, G4), (7.6, A4)]:
    felt(at('dispute') + t, m + UP, .02, 2.8)
bed(at('dispute'), [A1, A2], 13.6, .02, att=1.0)
bed(at('dispute') + 13.6, [D2, A2], span('dispute', 'dispute') - 13.6, .022, att=1.2)

# ---- chapter 4 (withdrawal, kernel): the bass steps down as the count goes down
bed(at('withdrawal'), [D2, A2], 6.3, .02, att=1.0)
for k, m in enumerate([C2, B1f]):
    cello(at('withdrawal') + 6.3 + .6 * k, m, 2.2 - .3 * k, .03, att=.2)
bed(at('withdrawal') + 7.5, [B1f + 12, F3], span('withdrawal', 'withdrawal') - 7.5, .018, att=1.5)
bed(at('kernel'), [D2, A2], span('kernel', 'kernel'), .016, att=2.0)

# ---- the essay's voice: no bass, only a high suspended fifth; the bass returns with the counter-argument
strings(at('voice'), [D5, A4 + 12], 14.0, .012, att=3.0, rel=3.0, cut=3000)
bed(at('voice') + 14.4, [A1, A2], span('voice', 'voice') - 14.4, .02, att=1.0)

# ---- the fire: D returns; the closing sentence rises to a borrowed D major, then settles on the open fifth
bed(at('fire'), [D2, A2], 34.1, .022, att=1.5)
close = at('fire') + 34.1
strings(close, [D3, A3, D4, F4 + 1, A4], 13.0, .015, att=2.5, rel=3.0, cut=1800)
cello(close, D2, 13.0, .04, att=.8, rel=3.0)
chordf(close + .2, [D4 + 12, F4 + 13, A4 + 12], .022, 4.0)
tail = span('fire', 'colophon') - 34.1 - 13.0
strings(close + 13.0, [D3, A3, D4], max(1.0, tail - 3.0), .016, att=1.0, rel=2.5, cut=1800)
bed(close + 13.0, [D2, A2], max(1.0, tail - 3.0), .02, att=1.0, rel=2.5)

synth.place_cues(synth.load_json(os.path.join(HERE, 'cues.json')))
OUT = os.path.join(ROOT, 'out', os.path.basename(HERE))
synth.render(os.path.join(OUT, 'music.wav'), os.path.join(OUT, 'music.mp3'))
