"""The light film's score, written against the picture: every section starts from its scene's start time in the page's
timeline, and the hits come from the caption times in script.md and the scenes' own timing constants.

    render(sr, n, grid, cues, level) -> {'piano': (2, n), 'strings': ..., 'harp': ..., 'pizz': ...}
    level: scene name -> gain (music.py calibrates it so the film has a dynamic arc)

Key D major / B minor; 80 BPM (beat 0.75 s, bar 3 s). One idea runs through the film: the nine digits of 299 792 458
played as a melody (digit d -> the d-th note of the D major scale from D4: 2 = F#4, 9 = F#5, 7 = D5, 4 = A4, 5 = B4,
8 = E5). In the opening it flashes by while the number rolls in; through the history the music measures (a pulse
that is loose at first and gets steadier as the measurements get better); in the definition chapter the melody is
played slowly, digit by digit, and lands on D major when the number is fixed. Ideas by scene:
- open: the digit melody as a fast harp run while the number rolls (0.1 - 0.9 s), a D major chord as it settles, a
  harp note for each year on the time line;
- lanterns: call and answer: A's pizzicato and B's reply 0.3 s later for each exchange of lights; the verdict
  "if not instantaneous, extremely fast" on Bm(add9);
- roemer: a slow harp arpeggio going round like the Earth's orbit; Io's emergence as a pizzicato tick that comes a
  little later each time; Huygens' 16 2/3 as a piano chord; "600 000 times faster than sound" as a low cello note
  against a high harp note;
- bradley: falling harp notes for the starlight, a suspension that leans and resolves as the telescope tilts;
- wheel: a pizzicato ostinato that speeds up with the wheel and stops dead when the returning light is blocked
  (the silence is the eclipse); the result on a full chord;
- foucault: a fast harp figure for the spinning mirror; the result chord;
- maxwell: lower and darker (cello and viola, no harp) for the electrical bench; the computed speed on a chord; the
  inference brings back the first four digits of the melody, as light comes back into the story;
- michelson: open fifths for the two mountains, a long harp sweep across and back, eight pizzicato notes for the
  eight-sided mirror;
- laser: a perfectly steady pizzicato pulse (a frequency); the result chord; the krypton bottleneck left on a sus4;
- definition: the digit melody, slow, one note per settled digit; 1983 on a full chord; "exact" resolved on D major,
  the loudest moment;
- coda: the melody once more, softly, piano and harp in unison, home on D;
- sources: harp notes under the entries, thinning to the end.
"""
import os
import re

from sampler import Sampler

NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
Q = 0.75  # one beat
BAR = 3.0
PAN = {'vln': 0.2, 'vla': -0.2, 'vc': -0.25, 'harp': 0.15}


def m(name):
    """'F#4' -> 66 (scientific pitch, C4 = 60)."""
    mm = re.fullmatch(r'([A-G])(#|b)?(-?\d)', name)
    return 12 * (int(mm.group(3)) + 1) + NOTE[mm.group(1)] + (1 if mm.group(2) == '#' else -1 if mm.group(2) == 'b' else 0)


def ms(s):
    return [m(x) for x in s.split()] if isinstance(s, str) else [m(x) if isinstance(x, str) else x for x in s]


DSCALE = ms('D4 E4 F#4 G4 A4 B4 C#5 D5 E5 F#5')
DIGITS = [int(c) for c in '299792458']
MELODY = [DSCALE[d] for d in DIGITS]


def render(sr, n, grid, cues, level=None):
    S = Sampler(sr, n)
    scenes = grid['scenes']
    AT = {s['name']: s['start'] for s in scenes}
    level = level or {}

    def scene_of(t):
        name = scenes[0]['name']
        for s in scenes:
            if t >= s['start'] - 1e-6:
                name = s['name']
        return name

    S.gain_at = lambda t: level.get(scene_of(t), 1.0)

    # ---------------------------------------------------------------- instruments
    def pno(t, notes, vel=0.4, dur=3.0, roll=0.0, pan=0.0, gain=1.0):
        for i, k in enumerate(ms(notes)):
            p = 0.0 if k < 48 else pan + (k - 62) / 240
            S.note('piano', t + i * roll, k, vel, dur, pan=p, gain=gain)

    def strg(t, dur, vln='', vla='', vc='', vel=0.42, attack=1.2, release=None, gain=1.0):
        for g, notes in (('vln', vln), ('vla', vla), ('vc', vc)):
            for k in ms(notes) if notes else []:
                S.note(g, t, k, vel, dur, pan=PAN[g], gain=gain, attack=attack, release=release)

    def harp(t, notes, vel=0.4, roll=0.07, pan=PAN['harp'], dur=5.0, gain=1.0):
        for i, k in enumerate(ms(notes)):
            S.note('harp', t + i * roll, k, vel, dur, pan=pan, gain=gain)

    def pz(t, note, vel=0.4, g='vlnpz', pan=0.15, dur=0.6, gain=1.0):
        S.note(g, t, m(note) if isinstance(note, str) else note, vel, dur, pan=pan, gain=gain)

    # ================================================================ 0 open (9 s): the number and the question
    a = AT['open']
    for i, k in enumerate(MELODY):  # the digits flash by while the number rolls in
        S.note('harp', a + 0.12 + i * 0.085, k + 12, 0.22, 1.4, pan=-0.3 + 0.075 * i)
    pno(a + 0.9, 'D3 A3 F#4 A4 D5', 0.36, 4.5, roll=0.02)
    strg(a + 0.9, 8.0, vc='D2 A2', vla='F#3', vel=0.3, attack=2.0, release=1.5)
    harp(a + 2.0, 'B4', 0.2, dur=3)  # the title
    pno(a + 4.8, 'B2 F#3 D4 A4', 0.3, 3.8, roll=0.03)  # caption 2: how people measured it
    for i in range(9):  # one note per year on the time line (dots at 5.0 + 0.25 i)
        S.note('harp', a + 5.0 + 0.25 * i, DSCALE[i % len(DSCALE)] + 12, 0.18 + 0.01 * i, 1.6, pan=-0.4 + 0.1 * i)
    pno(a + 7.5, 'G2 D3 B3 E4', 0.28, 2.0, roll=0.03)

    # ================================================================ 1 lanterns (15 s): call and answer
    a = AT['lanterns']
    strg(a + 0.3, 14.0, vc='B1 F#2', vla='D3', vel=0.26, attack=3.0, release=1.5)
    for t in (2.2, 4.4, 9.2, 11.4):  # A opens; B answers 0.3 s later
        pz(a + t, 'F#4', 0.3, pan=-0.35)
        pz(a + t + 0.3, 'A4', 0.28, pan=0.35)
    pno(a + 1.0, 'B2 F#3 D4', 0.24, 4.0, roll=0.04)
    pno(a + 7.0, 'G2 D3 B3', 0.24, 3.0, roll=0.04)  # caption 2: tried only at less than a mile
    pno(a + 9.8, 'B2 F#3 C#4 D4 F#4', 0.3, 4.5, roll=0.03)  # the verdict: Bm(add9)
    harp(a + 10.4, 'C#5 F#5', 0.2, roll=0.2, dur=3.5)

    # ================================================================ 2 roemer (18 s): Jupiter's clock
    a = AT['roemer']
    strg(a + 0.2, 17.5, vc='G2 D3', vla='B3', vel=0.27, attack=2.5, release=1.5)
    for i in range(12):  # the orbit: a slow arpeggio going round
        harp(a + 1.0 + i * 0.75, [ms('G3 B3 D4 F#4')[i % 4]], 0.18, dur=2.0, pan=-0.3 + 0.6 * ((i % 4) / 3))
    for i in range(6):  # Io's emergence: a tick that comes a little later each time
        pz(a + 1.5 + i * 1.0 + i * i * 0.025, 'D6', 0.22, pan=0.4, dur=0.3)
    pno(a + 7.0, 'E3 B3 D4 G4', 0.32, 4.0, roll=0.03)  # Huygens' value
    harp(a + 7.6, 'G4 B4 D5 F#5 A5', 0.24, roll=0.06, dur=3.0)
    strg(a + 12.5, 4.5, vc='E1', vel=0.34, attack=0.4, release=1.2)  # far slower: sound
    harp(a + 12.6, 'E6', 0.26, dur=3.5)  # far faster: light
    pno(a + 15.0, 'A2 E3 C#4 E4', 0.26, 3.0, roll=0.03)

    # ================================================================ 3 bradley (15 s): tilted starlight
    a = AT['bradley']
    strg(a + 0.2, 14.5, vc='D2 A2', vla='F#3', vel=0.26, attack=2.5, release=1.5)
    for i in range(14):  # starlight falling
        S.note('harp', a + 1.0 + i * 0.42, DSCALE[(9 - i) % 10] + 12, 0.15, 1.6, pan=0.3 - 0.04 * i)
    strg(a + 3.0, 3.6, vln='E5', vel=0.26, attack=1.0)  # the lean: E over D, a suspension...
    strg(a + 6.6, 3.0, vln='D5', vel=0.24, attack=0.6)  # ...that resolves
    pno(a + 7.5, 'D3 A3 F#4 A4', 0.32, 4.0, roll=0.03)  # 10 210 : 1
    harp(a + 9.5, 'A4 D5 F#5', 0.22, roll=0.08, dur=3.0)  # 8 min 12 s
    pno(a + 12.0, 'G2 D3 B3 E4', 0.24, 3.0, roll=0.03)

    # ================================================================ 4 wheel (18 s): the toothed wheel
    a = AT['wheel']
    strg(a + 0.2, 11.0, vc='B1 F#2', vla='D3', vel=0.27, attack=2.0, release=0.6)
    pno(a + 1.0, 'B2 F#3 D4', 0.26, 4.0, roll=0.04)  # two telescopes
    # the wheel spins up from 6.4 to 10 s (12.6 turns/s at the end): a pizzicato ostinato that speeds up with it
    t, step = 6.4, 0.5
    while t < 9.6:
        pz(a + t, 'B4' if int(t * 10) % 2 else 'D5', 0.22 + 0.02 * (t - 6.4), pan=0.25, dur=0.25)
        step = max(0.09, step * 0.86)
        t += step
    # 9.6 - 10.4: the returning light is blocked: silence, then one low note
    strg(a + 10.4, 1.6, vc='B1', vel=0.3, attack=0.05, release=1.0)
    pno(a + 12.2, 'D2 A2 F#3 A3 D4 F#4', 0.4, 5.0, roll=0.02)  # the result
    harp(a + 12.3, 'D4 F#4 A4 D5 F#5', 0.28, roll=0.05, dur=4.0)
    strg(a + 12.2, 5.6, vln='F#5', vla='A4', vc='D3', vel=0.32, attack=0.6, release=1.5)

    # ================================================================ 5 foucault (15 s): the rotating mirror
    a = AT['foucault']
    strg(a + 0.2, 14.5, vc='E2 B2', vla='G3', vel=0.27, attack=2.0, release=1.5)
    for i in range(32):  # the spinning mirror: a quick harp figure
        S.note('harp', a + 1.4 + i * 0.16, ms('E5 G5 B5 G5')[i % 4], 0.12 + 0.002 * i, 0.6, pan=0.35)
    pno(a + 1.0, 'E3 B3 G4', 0.26, 4.0, roll=0.04)
    pno(a + 7.0, 'C3 G3 E4 G4', 0.34, 4.0, roll=0.03)  # 298 000, a round number
    harp(a + 7.2, 'G4 C5 E5', 0.22, roll=0.07, dur=3.0)
    pno(a + 11.0, 'A2 E3 C#4 E4', 0.28, 3.5, roll=0.03)

    # ================================================================ 6 maxwell (18 s): electricity and magnetism
    a = AT['maxwell']
    strg(a + 0.2, 6.0, vc='B1 F#2', vla='D3', vel=0.3, attack=1.5, release=0.8)  # the bench, no light
    for i in range(4):  # a low cello figure
        S.note('vc', a + 1.0 + i * 1.2, ms('B2 D3 C#3 F#2')[i], 0.3, 1.2, pan=-0.25)
    pno(a + 6.5, 'G2 D3 B3 D4', 0.34, 4.0, roll=0.03)  # 310 740 km/s
    strg(a + 6.5, 6.0, vln='B4', vla='G3', vc='G2', vel=0.3, attack=1.0, release=0.8)
    harp(a + 9.5, 'D4 G4 B4', 0.22, roll=0.08, dur=2.5)  # beside 298 000
    for i, k in enumerate(MELODY[:4]):  # the inference: light comes back into the story
        S.note('harp', a + 12.5 + i * 0.5, k + 12, 0.24, 2.0, pan=0.2)
    pno(a + 12.5, 'D3 A3 F#4 A4', 0.32, 5.0, roll=0.03)
    strg(a + 12.5, 5.3, vln='A5', vla='F#4', vc='D3', vel=0.32, attack=1.5, release=1.5)

    # ================================================================ 7 michelson (15 s): two mountains
    a = AT['michelson']
    strg(a + 0.2, 14.5, vc='D2 A2', vla='E3', vel=0.28, attack=2.5, release=1.5)  # open fifths
    harp(a + 1.2, 'A3 D4 E4 A4 D5 E5 A5', 0.22, roll=0.09, dur=3.0)  # across...
    harp(a + 2.2, 'A5 E5 D5 A4 E4 D4 A3', 0.2, roll=0.09, dur=3.0)  # ...and back
    for i in range(16):  # the eight-sided mirror
        pz(a + 6.5 + i * 0.25, ms('D5 E5 F#5 A5 B5 A5 F#5 E5')[i % 8], 0.2, pan=-0.2, dur=0.3)
    pno(a + 10.5, 'D2 A2 E3 F#3 A3 D4', 0.36, 4.0, roll=0.03)  # 299 796
    harp(a + 10.6, 'D5 A5', 0.22, roll=0.15, dur=3.0)

    # ================================================================ 8 laser (18 s): frequency times wavelength
    a = AT['laser']
    strg(a + 0.2, 17.5, vc='G2 D3', vla='B3', vel=0.28, attack=2.0, release=1.5)
    for i in range(40):  # a perfectly steady pulse: a frequency
        pz(a + 1.0 + i * 0.25, 'B5' if i % 2 else 'D6', 0.16, pan=0.3, dur=0.2)
    pno(a + 1.0, 'G3 D4 B4', 0.26, 4.0, roll=0.04)
    pno(a + 6.5, 'E2 B2 G3 B3 E4', 0.36, 4.5, roll=0.03)  # 299 792 456.2
    harp(a + 6.6, 'E4 G4 B4 E5', 0.24, roll=0.06, dur=3.5)
    pno(a + 12.0, 'A2 E3 D4 E4', 0.3, 5.5, roll=0.04)  # the krypton metre: left on A sus4
    strg(a + 12.0, 5.8, vln='D5', vla='E4', vc='A2', vel=0.3, attack=1.2, release=1.2)

    # ================================================================ 9 definition (18 s): fixed
    a = AT['definition']
    strg(a + 0.2, 6.0, vc='A1 E2', vla='C#4', vel=0.3, attack=1.5, release=0.8)
    for i, k in enumerate(MELODY):  # the digits settle one by one
        pno(a + 1.0 + i * 0.5, [k], 0.32, 1.6, pan=-0.2 + 0.05 * i)
        S.note('harp', a + 1.0 + i * 0.5, k + 12, 0.2, 2.0, pan=0.3)
    pno(a + 6.5, 'G2 D3 B3 D4 G4', 0.42, 4.5, roll=0.02)  # 1983: the metre from light
    strg(a + 6.5, 6.5, vln='B4 D5', vla='G4', vc='G2', vel=0.4, attack=0.6, release=0.8)
    harp(a + 6.6, 'G3 D4 G4 B4 D5 G5', 0.3, roll=0.05, dur=4.0)
    t = a + 13.0  # exact: home on D, the film's loudest chord
    pno(t, 'D2 A2 D3 F#3 A3 D4 F#4 A4 D5', 0.5, 5.0, roll=0.015)
    strg(t, 5.0, vln='F#5 A5 D6', vla='A4 D5', vc='D3 A3', vel=0.48, attack=0.25, release=1.5)
    harp(t, 'D3 A3 D4 F#4 A4 D5 F#5 A5', 0.38, roll=0.035, dur=5.0)

    # ================================================================ 10 coda (12 s): rulers measured with light
    a = AT['coda']
    strg(a + 0.3, 11.5, vc='D2 A2', vla='F#3', vel=0.27, attack=2.5, release=2.0)
    for i, k in enumerate(MELODY):  # the melody once more, softly, piano and harp in unison
        pno(a + 1.0 + i * 0.6, [k], 0.26, 1.8, pan=-0.1)
        S.note('harp', a + 1.0 + i * 0.6, k + 12, 0.18, 2.0, pan=0.3)
    pno(a + 6.6, 'G2 D3 B3 D4', 0.28, 3.4, roll=0.04)
    pno(a + 9.0, 'D2 A2 F#3 A3 D4', 0.32, 4.5, roll=0.04)  # home
    strg(a + 6.0, 6.0, vln='D5 F#5', vel=0.26, attack=2.5, release=2.0)

    # ================================================================ 11 sources (16 s)
    a = AT['sources']
    strg(a, 14.0, vc='D2', vla='A3', vel=0.22, attack=2.0, release=2.5)
    pno(a + 0.4, 'D3 A3 F#4', 0.24, 4.0, roll=0.05)
    desc = ms('F#6 E6 D6 C#6 B5 A5 F#5 E5 D5 C#5 B4 A4 F#4')
    for i, k in enumerate(desc):
        if i % 2 == 0:
            S.note('harp', a + 1.0 + 0.5 * i, k, 0.15, 2.0, pan=0.25 * (1 if i % 4 else -1))
    pno(a + 8.0, 'D2 A2 F#3 E4', 0.22, 6.0, roll=0.06)
    harp(a + 10.0, 'D4 F#4 A4 D5', 0.15, roll=0.2, dur=5.0)

    render.log = S.log
    return S.buses
