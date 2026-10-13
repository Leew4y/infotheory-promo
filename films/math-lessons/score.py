"""Score for math-lessons: D Dorian, 60 BPM, a liturgical texture (held bass and drones, single bells), no drums.

    just cues math-lessons     (the page writes films/math-lessons/cues.json and timeline.json)
    just music math-lessons    -> out/math-lessons/music.wav (master), out/math-lessons/music.mp3 (preview)

Design: script/sound.md. The music leaves the voice's band (200-1000 Hz) free of sustained melody; just mix ducks it
under the narration. v4 (2026-10-13): scenes follow the voice, so music that lands on a sentence reads the line's start
from out/<film>/narration.cues.json (written by just cues). The page's cue sheet carries the sound marks: the
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

# where each narration line starts (film seconds; just cues writes them): music that lands on a sentence
_cues = synth.load_json(os.path.join(ROOT, 'out', os.path.basename(HERE), 'narration.cues.json'))
line = {p['id']: p['t'] for p in _cues['placements']}.__getitem__

# ---- chapter 1 (claim, paths, dispute): the announcement over a held D; the problem statement hangs on A, unresolved
bed(at('claim'), [D2, A2, D3], span('claim', 'claim'), .02, att=1.5)
strings(line('claim1') + 2.0, [D4, A4], span('claim', 'claim') - 2.5, .010, att=3.0, rel=2.0, cut=2600)
bed(at('paths'), [A1, A2], span('paths', 'paths'), .022, att=1.5)
felt(line('second'), A4 + UP, .022, 3.0)
for id_, m in [('math1', E4), ('math2', G4)]:
    felt(line(id_), m + UP, .02, 2.8)
bed(at('dispute'), [A1, A2], line('n23') - at('dispute'), .02, att=1.0)
bed(line('n23'), [D2, A2], end('dispute') - line('n23'), .022, att=1.2)

# ---- chapter 2 (useless, numbers, hardy): the question in silence, then a held D Dorian drone for the history
sub(line('ask'), D2, 3.0, .016)
bed(line('preface'), [D2, A2, D3], end('useless') - line('preface'), .022, att=2.0)
# number theory: the bass moves to C (the Dorian flat seventh); D returns with Hardy's defence
bed(at('numbers'), [C2, 43], span('numbers', 'numbers'), .02, att=1.5)
bed(at('hardy'), [D2, A2], span('hardy', 'hardy'), .02, att=1.5)
felt(line('n08'), D5 + 12, .022, 3.0)

# ---- chapter 3 (needed): the drone darkens for the argument; A under the counter-argument
bed(at('needed'), [D2, A2, D3], line('n15') - at('needed'), .022, att=1.5)
bed(line('n15'), [A1, A2], line('n16') - line('n15'), .02, att=1.0)
bed(line('n16'), [D2, A2], end('needed') - line('n16'), .022, att=1.0)

# ---- chapter 4 (release, withdrawal, kernel): brighter for the number, the bass steps down as the count goes down
bed(at('release'), [D2, A2], span('release', 'release'), .02, att=1.0)
strings(at('release') + .5, [D4, A4], span('release', 'release') - .5, .012, att=2.0, rel=2.0, cut=2600)
down = line('n24') + 5.3  # "722，变成 719": the count settles
bed(at('withdrawal'), [D2, A2], down - at('withdrawal'), .02, att=1.0)
for k, m in enumerate([C2, B1f]):
    cello(down + .6 * k, m, 2.2 - .3 * k, .03, att=.2)
bed(down + 1.2, [B1f + 12, F3], end('withdrawal') - down - 1.2, .018, att=1.5)
bed(at('kernel'), [D2, A2], span('kernel', 'kernel'), .016, att=2.0)

# ---- the essay's voice: no bass, only a high suspended fifth; the bass returns with the counter-argument
strings(at('voice'), [D5, A4 + 12], line('n32') - at('voice'), .012, att=3.0, rel=3.0, cut=3000)
bed(line('n32'), [A1, A2], end('voice') - line('n32'), .02, att=1.0)

# ---- the fire: D returns; the closing sentence rises to a borrowed D major, then settles on the open fifth
close = line('n41')
bed(at('fire'), [D2, A2], close - at('fire'), .022, att=1.5)
strings(close, [D3, A3, D4, F4 + 1, A4], 13.0, .015, att=2.5, rel=3.0, cut=1800)
cello(close, D2, 13.0, .04, att=.8, rel=3.0)
chordf(close + .2, [D4 + 12, F4 + 13, A4 + 12], .022, 4.0)
# the coda: the open fifth thins to the bass alone under the last line, then the index
tail = end('colophon') - close - 13.0
strings(close + 13.0, [D3, A3], max(1.0, tail - 3.0), .014, att=1.0, rel=2.5, cut=1500)
bed(close + 13.0, [D2, A2], max(1.0, tail - 3.0), .02, att=1.0, rel=2.5)

synth.place_cues(synth.load_json(os.path.join(HERE, 'cues.json')))
OUT = os.path.join(ROOT, 'out', os.path.basename(HERE))
synth.render(os.path.join(OUT, 'music.wav'), os.path.join(OUT, 'music.mp3'))
