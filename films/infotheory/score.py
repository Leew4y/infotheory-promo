"""Score for the information-theory film: A minor, 80 BPM, a quiet chamber score (felt piano, string bed, cello, no drums).

    just cues infotheory    (the page writes films/infotheory/cues.json and timeline.json)
    just music infotheory   -> out/infotheory/music.wav (master), out/infotheory/music.mp3 (preview)

Positions are relative to scenes: at('surprise') is the first bar of the surprise chapter, at('dawn') + 2.2 is 2.2 s
into the dawn plate. Change a scene's length on the page, re-run `just cues`, and the score follows.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'audio'))
import synth  # noqa: E402
from synth import CH, at, bed, cello, chordf, felt, progression, strings  # noqa: E402

synth.init(synth.load_json(os.path.join(HERE, 'timeline.json')))
BAR = synth.BAR
bars = lambda n: n * BAR  # noqa: E731

# ---- dawn: first light, a string swell, single notes, the title chord
dawn = at('dawn')
strings(dawn + 0.0, [57, 64, 69, 76], 12.0, .028, att=4.0, rel=2.0, cut=1800)
bed(dawn + 0.0, [45, 52], 14.0, .03, att=3.0)
felt(dawn + 2.2, 57, .05, 3.0)
felt(dawn + 7.0, 60, .05, 3.0)
chordf(dawn + 11.0, CH['Am9'] + [69, 76], .055, 4.0)
strings(dawn + 11.0, [64, 69, 72, 76], at('preface') - 11.0 + .5, .035, att=.8)
cello(dawn + 11.0, 33, at('preface') - 11.0, .05, att=.3)
# ---- preface: sparse
for k, m in enumerate([57, 60, 64, 60, 57, 65, 60, 57, 55, 60, 64, 67]):
    felt(at('preface') + .6 + k * synth.BEAT, m, .038, 2.4, synth.np.sin(k) * .4)
bed(at('preface'), [45, 52, 60], bars(3) - .3, .024, att=1.5)
# ---- 01 surprise
progression(at('surprise'), ['Am', 'F', 'C', 'G', 'Am', 'E'], .04, .022)
# ---- 02 entropy
progression(at('entropy'), ['F', 'G', 'Am', 'Em', 'F', 'G'], .042, .024)
# ---- breath
strings(at('dusk1'), [60, 64, 67, 72], bars(2), .036, att=1.6)
felt(at('dusk1') + 1.0, 72, .045, 3.0)
cello(at('dusk1'), 36, bars(2) - .2, .045)
# ---- 03 compression: a little more motion in the arpeggio
progression(at('compress'), ['Am', 'C', 'G', 'F', 'Am', 'C', 'G'], .04, .022, arp_gain=.034)
# ---- 04 noise: darker, lower, no arpeggio
progression(at('noise'), ['Am', 'Dm', 'E', 'Am', 'Dm'], .038, .0, arp=False)
bed(at('noise'), [45, 52, 57], bars(5) - .3, .035, att=1.0)
# ---- 05 error correction: resolve
progression(at('hamming'), ['F', 'C', 'G', 'Am', 'F', 'C'], .044, .026)
# ---- breath
strings(at('dusk2'), [53, 60, 64, 69], bars(2), .036, att=1.6)
felt(at('dusk2') + 1.0, 76, .045, 3.0)
cello(at('dusk2'), 41, bars(2) - .2, .045)
# ---- 06 capacity: rising arpeggio
progression(at('capacity'), ['C', 'G', 'Am', 'F', 'C', 'G'], .044, .026, arp_gain=.036)
# ---- 07 mutual information: warm strings
progression(at('mutual'), ['F', 'Am', 'G', 'C', 'F', 'Am'], .042, .034)
# ---- 08 everywhere: the fullest passage
progression(at('everywhere'), ['Am', 'F', 'C', 'G', 'Am', 'F', 'C'], .05, .036, arp_gain=.038)
strings(at('everywhere'), [69, 72, 76, 81], bars(7), .02, att=3.0)
# ---- morning, then the sources: resolve to A major, held to the end of the film
progression(at('morning'), ['F', 'G', 'Am', 'C'], .046, .034)
resolve = at('sources', 0.8)
END = synth.TOTAL - resolve + 1.0
chordf(resolve, CH['Aadd9'] + [45, 76, 81], .055, 5.0)
strings(resolve, [61, 64, 69, 73], END, .04, att=.8, rel=3.0)
cello(resolve, 33, END - 1.0, .05, att=.3, rel=3.0)
for k, m in enumerate([81, 85, 88, 93]):
    felt(resolve + 2.4 + k * .35, m, .035, 3.5, (k - 1.5) * .3)

synth.place_cues(synth.load_json(os.path.join(HERE, 'cues.json')))
OUT = os.path.join(ROOT, 'out', os.path.basename(HERE))
synth.render(os.path.join(OUT, 'music.wav'), os.path.join(OUT, 'music.mp3'))
