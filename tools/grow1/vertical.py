"""The vertical 9:16 video of the film "grow1" (长高一倍，体重变几倍？) on grid paper (styles/paper-dawn + the film's grid).

    python vertical.py <picture.mp4> <timeline.json> <audio.wav> <out.mp4> [--sample t[,t2,...]] [--words file]

<picture.mp4> is the film's 16:9 picture exported without captions (bun scripts/export.ts --film grow1 --no-captions);
<timeline.json> is films/grow1/timeline.json (scenes and captions); <audio.wav> is the final mix (out/grow1/master.wav).
With --sample, no video is made: for each film time t the frame the video would show (frame round(30 t)) is written
as a PNG, <out> with its extension replaced by -t<t>.png (or <out> itself when it ends in .png and one t is given),
with a 360x640 copy beside it (-phone.png) and a 3x crop of each joint (-joints.png), and the checks of that frame are
printed (paper level and grid lines across both joints, contrast of the text on the paper under it, safe zones).
--words adds words (one per line, UTF-8) that a Chinese caption line break should not cut to the list WORDS.

Layout (1080x1920), after the metre composer (D:/demo/.cache/metre-tools/vertical.py): one sheet of grid paper. The
band above the picture is the narrator band of the channel route (route.md section 6, pilot_short_1.md): the name
plate 「核算员」 at the top right (ink, a thin ink frame, right edge at x 926); below it, at the left, the red stamp
「假设」 (a rubber stamp: the film's red, a thick frame, turned 3 degrees, uneven ink) with the two premise lines
「每天长高一倍，形状不变」「今天 1.7 米、70 公斤」 beside it, and under the stamp the small note
「前提是假的，每个数都标了出处或算法。」. No film title, no rules at the joints: the picture (scaled to 1080x608 at
y = 610) sits on the same sheet. Captions from y = 1266, centred in the column x 70-930 (the right 150 px stay free for
the app's buttons), ending above y = 1560. Every band element is inside y 150-1560, x 40-930.

How the page is made one sheet of grid paper. The paper: as in the metre composer (the engine's picture vignette
divided out, one page vignette over 1080x1920, the band's paper continued from the picture's measured paper colour
with the style's fall-off, fibre and grain, matched column by column to the picture's edge colours over the 200 rows
next to it, the picture's first and last 28 rows feathered into the band, the band fading with the picture when the
engine fades through flat paper). The picture's edge colours are read on rows next to the edge that hold no grid line.
The grid is not drawn from a guess: it is measured on the picture. A per-pixel 75th percentile over 32 frames spread
across the film keeps the paper and the grid and drops what moves. On it:
  - vertical lines: the per-column, per-channel ratio of the picture to its own paper (paper = a running median over
    61 columns), median over the picture's top 28 rows and over its bottom 28 rows (the scene keeps its top and bottom
    60 px of the 16:9 frame clear), the lighter of the two (a drawing touching one edge only darkens that edge), kept
    only around the lines that sit on one evenly spaced lattice, with the scaler's light ringing beside each line; a
    lattice line that is hidden or has a drawing beside it is copied from a clean line of its class with the same
    sub-pixel phase; the band uses these column ratios, so every vertical line goes on straight across the joint;
  - horizontal lines: the per-row ratio (paper = a running median over 41 rows), median over the columns right of
    x 936 (the scene keeps x > 1653 of the 16:9 frame clear), kept and copied the same way; their period P and the
    repeat of their pattern (major lines every n) are fitted; a band row y takes the ratio of the picture row
    y + k * n * P for the k that lands closest to a whole row (spline interpolation for the remaining fraction), so the
    lines go on at the same spacing and weight above and below the picture;
  - where lines cross, the band takes the product of the two ratios, or their minimum when the picture's crossings
    show that the grid was stroked as one path (measured, printed).
A line found at the picture's edge that is not on the lattice (a ruler, a drawing touching the edge) is not continued.
If no grid is found, the band is plain paper and a warning says so. The grid must be drawn fixed on the 16:9 frame
(no camera zoom on it), or the band's grid cannot match it; the composer measures how far each frame's vertical lines
at the edges are off the reference and warns.

Frame by frame (as metre): the fade of the picture's edges towards flat paper is fitted and the band fades with it;
what is left of the edge change follows into the band over 40 rows (at most EDGE_CLIP levels). ffmpeg decodes the
picture (bt709, lanczos) and encodes the result: libx264 slow, crf 19, maxrate 12M, High@4.1, yuv420p bt709, 30 fps,
AAC 256k stereo, +faststart.

Captions: Chinese in Noto Serif SC 600 in ink (C.fg), English in Gelasio Italic with lining figures in C.fg2, sizes
and line breaking as in the metre composer (a number stays with its unit word, Chinese or Latin, a date never splits
across lines, no line starts with closing punctuation). Each caption fades in and out over 0.15 s (less for a caption
shorter than 0.6 s). Where consecutive captions carry the same English, the English is set once and stays.
"""
import json
import math
import os
import re
import subprocess
import sys
import time

import numpy as np
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter, map_coordinates, maximum_filter1d, median_filter

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# ---------------------------------------------------------------- the band's words (pilot_short_1.md, route.md 3.3)
PLATE_TEXT = '核算员'
STAMP_TEXT = '假设'
PREMISE = ('每天长高一倍，形状不变', '今天 1.7 米、70 公斤')
NOTE = '前提是假的，每个数都标了出处或算法。'

# ---------------------------------------------------------------- geometry
W, H = 1080, 1920
PIC_Y, PIC_H = 610, 608
CAP_X0, CAP_X1 = 70, 930      # caption column
CAP_CX = (CAP_X0 + CAP_X1) / 2
CAP_W = CAP_X1 - CAP_X0
CAP_Y = 1266                  # top of the first Chinese caption line's em box
CAP_LIMIT = 1556              # the last caption line's ink ends at or above this
SAFE_TOP, SAFE_RIGHT, SAFE_BOTTOM, SAFE_LEFT = 150, 930, 1560, 40
FEATHER = 28                  # picture rows feathered into the band, top and bottom
MATCH = 200                   # band rows over which the band goes over to the picture's edge colours
TRACK = 40                    # band rows over which the band follows what is left of a change of the picture's edge
EDGE_CLIP = 6.0               # largest per-frame shift of the band's colour towards the picture's edge (levels)
PAPER_BG = np.array([0xF3, 0xF1, 0xEA], np.float64)   # C.bg, also the flat colour the engine's fades go through
FADE_FLOOR = 0.02             # fitted fade amounts below this are noise (grain in the edge rows): taken as no fade
CAP_FADE = 0.15               # caption fade in after a and out before b (s); at most a quarter of a short caption
PAD = 4                       # margin of a text layer's crop

# the band (page px): name plate top right, stamp + premise lines, the note under the stamp
BAND_X0 = 70                  # left edge of the stamp and the note
PLATE_RIGHT = 926             # right edge of the plate's frame (Douyin's buttons are right of x 930)
PLATE_INK_TOP = 238           # top of the plate name's ink
PLATE_PX, PLATE_WT, PLATE_LS = 44, 600, 10
PLATE_PAD_X, PLATE_PAD_Y, PLATE_FRAME = 26, 16, 2
STAMP_TOP = 340               # top of the stamp's frame (before turning)
STAMP_PX, STAMP_WT, STAMP_LS = 80, 800, 12
STAMP_PAD_X, STAMP_PAD_Y, STAMP_FRAME, STAMP_RADIUS = 22, 14, 7, 7
STAMP_ANGLE = 3.0             # degrees, counter-clockwise
STAMP_INK = 0.93              # the stamp's opacity where the ink is full
PREM_PX, PREM_WT, PREM_LS = 46, 600, 2
PREM_GAP = 36                 # stamp frame's right edge to the premise lines
PREM_STEP = 68                # line step of the two premise lines
NOTE_PX, NOTE_WT, NOTE_LS = 32, 500, 1
NOTE_GAP = 26                 # stamp frame's bottom to the note's ink top
BAND_TEXT_LIMIT = PIC_Y - TRACK - 10   # band text ends above the rows that follow the picture's edge

# (Chinese line step, gap to the English, English size, English line step), tried in order until the caption fits
CAP_STEPS = [(72, 14, 30, 39), (70, 12, 30, 38), (68, 12, 29, 37), (68, 10, 28, 36), (66, 10, 27, 35),
             (66, 8, 26, 34), (64, 8, 26, 32), (62, 6, 26, 31)]
ZH_PX, ZH_WT, ZH_LS = 54, 600, 2
# Chinese caption lines keep every mark of timeline.json, as the metre and night composers do (LINE_END_DROP = '')
LINE_END_DROP = ''
EN_WT = 450

FONTS = r'D:\promo-films-light\.cache\fonts'
SERIF = os.path.join(FONTS, 'NotoSerifSC[wght].ttf')
GEL_I = os.path.join(FONTS, 'Gelasio-Italic[wght].ttf')
FEAT = ['lnum', 'kern']       # lining figures: Gelasio sets old-style figures by default

# paper-dawn palette and page grade (styles/paper-dawn/index.ts)
FG = (0x1A, 0x19, 0x17)
FG2 = (0x4A, 0x46, 0x40)
MUTED = (0x5F, 0x5C, 0x55)
# the film's one red: the stamp. Keep it the red films/grow1/kit.ts uses for the picture's stamps and labels.
RED = (0x9E, 0x42, 0x1C)
VIG = 0.12                    # grade.vig
SPLIT, TINT_H, SAT = 0.35, np.array([1.03, 1.0, 0.96]), 0.98
FALL_BROWN, FALL_A = np.array([60.0, 40.0, 20.0]), 0.05   # paper(): rgba(60,40,20,.05) at the gradient's outer radius
NGRAIN = 12

# the grid measurement
REF_N = 32                    # reference frames spread across the film
BG_PCT = 0.75                 # per-pixel order statistic over them: the paper and the grid, not what moves
EDGE_ZONE = 28                # picture rows next to each edge used for the vertical lines' profile (the scene keeps
                              # the top and bottom 60 px of its 16:9 frame clear: 33.8 rows here)
STRIP_X0 = 936                # columns right of this hold the horizontal lines' profile (x > 1653 of the 16:9 frame)
LINE_WIN = 2                  # columns / rows kept on each side of a detected line's dark run
LATTICE_TOL = 0.6             # px: a line further than this from the fitted lattice is not part of the grid

# ---------------------------------------------------------------- arguments
# words of this film's captions that a Chinese line break should not cut (films/grow1/timeline.json, 16 captions)
WORDS = ('每天', '长高', '一倍', '算过', '体重', '公斤', '各翻', '截面', '只算', '每平方厘米', '平方厘米', '厘米',
         '两倍', '再翻', '今天', '就是', '背着', '另一个', '七个', '正片', '接着', '往下算')
args = [a for a in sys.argv[1:]]
SAMPLE = None
if '--sample' in args:
    i = args.index('--sample')
    SAMPLE = [float(x) for x in args[i + 1].split(',')]
    del args[i:i + 2]
if '--words' in args:
    i = args.index('--words')
    WORDS = tuple(WORDS) + tuple(w.strip() for w in open(args[i + 1], encoding='utf-8-sig').read().splitlines()
                                 if w.strip())
    del args[i:i + 2]
if len(args) != 4:
    sys.exit(__doc__)
PIC, TL, AUDIO, OUT = args
for p_, what in ((PIC, 'the picture'), (TL, 'the timeline'), (SERIF, 'the Noto Serif SC font'),
                 (GEL_I, 'the Gelasio Italic font')):
    if not os.path.exists(p_):
        sys.exit(f'missing {what}: {p_}')
if SAMPLE is None and not os.path.exists(AUDIO):
    sys.exit(f'missing the audio: {AUDIO}')
tl = json.load(open(TL, encoding='utf-8'))
FPS = int(tl['fps'])
NFR = int(tl['frames'])
DUR = NFR / FPS


# ---------------------------------------------------------------- fonts and text
_fonts = {}
_cmaps = {}
NBSP = chr(160)


def font(path, size, weight):
    key = (path, size, weight)
    if key not in _fonts:
        f = ImageFont.truetype(path, size)
        try:
            f.set_variation_by_axes([weight])
        except Exception:
            pass
        f.path = path
        _fonts[key] = f
    return _fonts[key]


def check_glyphs(f, s):
    """Fail on any character the font file does not have (it would draw a missing-glyph box)."""
    if f.path not in _cmaps:
        _cmaps[f.path] = TTFont(f.path).getBestCmap()
    missing = [c for c in s if c not in ' ' + NBSP and ord(c) not in _cmaps[f.path]]
    if missing:
        raise SystemExit(f'{os.path.basename(f.path)} lacks {missing} for {s!r}')


def advance(s, f, ls=0):
    s = s.replace(NBSP, ' ')
    if not ls:
        return f.getlength(s, features=FEAT)
    return sum(f.getlength(ch, features=FEAT) for ch in s) + ls * max(0, len(s) - 1)


def draw_str(d, s, x, y, f, fill, ls=0):
    """s with the left of its first advance at x and the top of the em box (ascender) at y; letter spacing ls."""
    s = s.replace(NBSP, ' ')
    if not ls:
        d.text((x, y), s, font=f, fill=fill, features=FEAT)
        return
    for ch in s:
        d.text((x, y), ch, font=f, fill=fill, features=FEAT)
        x += f.getlength(ch, features=FEAT) + ls


_ink = {}


def ink_box(s, f, ls=0):
    """The ink box of s drawn at (0, 0) with draw_str: (x0, y0, x1, y1)."""
    key = (s, id(f), ls)
    if key not in _ink:
        m = f.size
        im = Image.new('L', (int(advance(s, f, ls) + 3 * m), 3 * m), 0)
        draw_str(ImageDraw.Draw(im), s, m, m, f, 255, ls)
        b = im.getbbox() or (m, m, m, m)
        _ink[key] = (b[0] - m, b[1] - m, b[2] - m, b[3] - m)
    return _ink[key]


# ---------------------------------------------------------------- line breaking (metre composer, with night's units)
LATIN = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,%/-')
NO_LINE_START = set('，。、；：？！）》」』”’…·%')
NO_LINE_END = set('（《「『“‘')
PUNCT_BREAK = set('，。、；：？！…—')
BIND_NEXT = set('被把将让给对向从自在于用以比为与和这那每各几两第其该此一')   # bound to the word after them
BIND_PREV = set('的了着过们地得吗呢吧啊么之')                               # bound to the word before them
CONJ = set('和与而但并或及且')                                           # a line may start with these
EN_ARTICLE = {'a', 'an', 'the'}
EN_WEAK = {'of', 'to', 'by', 'in', 'on', 'at', 'and', 'or', 'with', 'from', 'for', 'as', 'was', 'were', 'is', 'be',
           'that', 'this', 'its', 'their', 'nearly', 'about', 'than', 'more', 'few', 'all', 'one', 'two', 'three',
           'four', 'five', 'his', 'own', 'whole', 'every', 'each'}
EN_UNIT = {'K', 'km', 'm', 'cm', 'mm', 'kg', 'g', 't', 's', '%'}   # stay with their number
LINE_PEN = 10.0


def ends_num(s):
    return s[-1:].isdigit()


def starts_num(s):
    return s[:1].isdigit()


def best_lines(n, line_str, bcost, width, maxw, em, ks, orphan):
    """Choose breaks among n units: lines no wider than maxw; cost = break costs + 0.5 * ((width - mean) / em)^2 per
    line + orphan penalty on the last line + LINE_PEN per line beyond the first k tried. bcost(j) is the cost of a
    break before unit j, None when forbidden. Returns the list of (i, j) unit spans, or None."""
    cands = [j for j in range(1, n) if bcost(j) is not None]
    total = width(line_str(0, n))
    best = None
    for k in ks:
        target = total / k
        layers = [{0: (0.0, None)}]
        for m in range(1, k + 1):
            cur = {}
            ends = [n] if m == k else cands
            for j in ends:
                for i, (c0, _) in layers[-1].items():
                    if i >= j:
                        continue
                    s = line_str(i, j)
                    if not s:
                        continue
                    w = width(s)
                    if w > maxw:
                        continue
                    c = c0 + 0.5 * ((w - target) / em) ** 2
                    c += bcost(j) if j < n else (orphan(s, w, target) if k > 1 else 0)
                    if j not in cur or c < cur[j][0]:
                        cur[j] = (c, i)
            layers.append(cur)
        if n in layers[k]:
            c = layers[k][n][0] + LINE_PEN * (k - ks[0])
            spans, j = [], n
            for m in range(k, 0, -1):
                i = layers[m][j][1]
                spans.append((i, j))
                j = i
            if best is None or c < best[0]:
                best = (c, spans[::-1])
    return best[1] if best else None


def wrap_zh(text, f, maxw, ls=0, kmax=3):
    """Chinese caption lines: a run of Latin letters or digits never splits, a number in groups is one unit and
    stays with its unit word ("560 公斤", "35.84 吨"), no line starts with closing punctuation, breaks after
    punctuation are free, breaks before a conjunction or a number are cheap, breaks after 被/把/在 ... or before
    的/了 ... and inside the listed words are dear, a date never splits, and the last line is not an orphan."""
    toks, offs, cur, start = [], [], '', 0
    for i, ch in enumerate(text):
        if ch in LATIN and cur and cur[-1] in LATIN:
            cur += ch
        else:
            if cur:
                toks.append(cur)
                offs.append(start)
            cur, start = ch, i
    if cur:
        toks.append(cur)
        offs.append(start)
    T, O = [], []
    for tk, of in zip(toks, offs):
        if len(T) >= 2 and T[-1] == ' ' and ends_num(T[-2]) and starts_num(tk):
            T[-2:] = [T[-2] + NBSP + tk]
            O[-2:] = [O[-2]]
        else:
            T.append(tk)
            O.append(of)
    prot = set()
    for wd in WORDS:
        s = text.find(wd)
        while s >= 0:
            prot.update(range(s + 1, s + len(wd)))
            s = text.find(wd, s + 1)
    nob = set()
    for m in re.finditer(r'\d+ 年 \d+ 月(?: \d+ 日)?|\d+ 月 \d+ 日', text):
        nob.update(range(m.start() + 1, m.end()))
    n = len(T)

    def piece(a, b):
        return sum(0.5 if ch in LATIN else 1.0 for ch in text[a:b] if ch != ' ')

    def fragment(c):
        a = max([k + 1 for k in range(c) if text[k] in PUNCT_BREAK] + [0])
        b = min([k for k in range(c, len(text)) if text[k] in PUNCT_BREAK] + [len(text)])
        short = min(piece(a, c), piece(c, b))
        return 25.0 if short < 2.5 else 10.0 if short < 3.5 else 0.0

    def bcost(j):
        nxt = T[j]
        if nxt == ' ' or O[j] in nob:
            return None
        sp = T[j - 1] == ' '
        if sp and j < 2:
            return None
        prev = T[j - 2] if sp else T[j - 1]
        P, N = prev[-1:], nxt[:1]
        if N in NO_LINE_START or P in NO_LINE_END:
            return None
        if sp and ends_num(prev) and (N not in LATIN or N.isalpha()):
            return 60.0                                  # a number and its unit word, Chinese or Latin
        if P == '、' and j >= 2 and ends_num(T[j - 2]) and starts_num(nxt):
            return 60.0                                  # 18、19
        if P in PUNCT_BREAK:
            return 0.0
        c = 12.0
        if P in BIND_NEXT:
            c = 40.0
        elif N in BIND_PREV:
            c = 40.0
        elif N in CONJ:
            c = 3.0
        elif starts_num(nxt):
            c = 4.0
        elif P == '的':
            c = 5.0
        elif sp:
            c = 4.0
        if O[j] in prot:
            c = max(c, 50.0)
        return c + fragment(O[j])

    memo = {}

    def line_str(i, j):
        return ''.join(T[i:j]).strip(' ').replace(NBSP, ' ')

    def width(s):
        if s not in memo:
            memo[s] = advance(s, f, ls)
        return memo[s]

    def orphan(s, w, target):
        return 40.0 if (len(s.replace(' ', '')) < 3 or w < 0.35 * target) else 0.0

    kmin = next((k for k in range(1, kmax + 1) if best_lines(n, line_str, bcost, width, maxw, f.size, [k], orphan)), None)
    if kmin is None:
        raise SystemExit(f'caption does not fit in {kmax} lines: {text}')
    ks = [k for k in (kmin, kmin + 1) if k <= kmax]
    spans = best_lines(n, line_str, bcost, width, maxw, f.size, ks, orphan)
    return [line_str(i, j) for i, j in spans]


def wrap_en(text, f, maxw):
    """English caption lines: as few lines as fit, balanced, a number in groups never splits, a number keeps its unit
    symbol (560 kg), no line ends in an article (or, if it can be helped, another short function word, or a number
    before its noun), no stub last line. Returns (lines, the summed cost of its breaks)."""
    words = []
    for wd in text.split(' '):
        if words and ends_num(words[-1]) and starts_num(wd):
            words[-1] += NBSP + wd
        else:
            words.append(wd)
    n = len(words)

    def bcost(j):
        prev, nxt = words[j - 1], words[j]
        w = prev.lower().strip(',.;:')
        if w in EN_ARTICLE:
            return 30.0
        if w in EN_WEAK:
            return 4.0
        if starts_num(prev) and prev[-1:] not in ',.;:' and nxt.rstrip(',.;:') in EN_UNIT:
            return 60.0
        if starts_num(prev) and prev[-1:] not in ',.;:' and not starts_num(nxt):
            return 8.0
        return 0.0

    memo = {}

    def line_str(i, j):
        return ' '.join(words[i:j]).replace(NBSP, ' ')

    def width(s):
        if s not in memo:
            memo[s] = advance(s, f)
        return memo[s]

    def orphan(s, w, target):
        return 30.0 if (' ' not in s or w < 0.4 * target) else 0.0

    for k in range(1, 6):
        spans = best_lines(n, line_str, bcost, width, maxw, f.size, [k], orphan)
        if spans:
            return [line_str(i, j) for i, j in spans], sum(bcost(j) for _, j in spans[:-1])
    raise SystemExit(f'English caption does not fit: {text}')


def same_text(lines, original, dropped=''):
    """True if the lines are the original in order, with only spaces (and the marks in dropped) left out at the
    breaks."""
    pos = 0
    for ln in lines:
        k = original.find(ln, pos)
        if k < 0 or original[pos:k].strip(' ' + dropped):
            return False
        pos = k + len(ln)
    return not original[pos:].strip(' ')


# ---------------------------------------------------------------- the page: vignettes, paper
def smoothstep(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def page_vignette():
    """The paper still's page vignette over 1080x1920 (the long axis is vertical)."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dx, dy = (xx + 0.5) / W - 0.5, (yy + 0.5) / H - 0.5
    v = np.hypot(dx * 0.7, dy) * 1.5
    return (1 - VIG * smoothstep((v - 0.45) / 0.7)).astype(np.float32)


def picture_vignette():
    """The engine's vignette as baked into the 16:9 picture (gl.ts FS_FINAL), on the 1080x608 scaled picture."""
    yy, xx = np.mgrid[0:PIC_H, 0:W].astype(np.float32)
    dx, dy = (xx + 0.5) / W - 0.5, (yy + 0.5) / PIC_H - 0.5
    v = np.hypot(dx, dy * 0.7) * 1.5
    return (1 - VIG * smoothstep((v - 0.45) / 0.7)).astype(np.float32)


def falloff_field():
    """The style's paper fall-off continued over the page around the picture's centre, at the picture's scale."""
    k = PIC_H / 1080
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.hypot(xx + 0.5 - W / 2, yy + 0.5 - (PIC_Y + PIC_H / 2))
    return (np.clip((r - 0.35 * 1080 * k) / (0.70 * 1080 * k), 0, 1) * FALL_A).astype(np.float32)


def grade_linear(c):
    """The page grade on a paper-bright colour: split tone, then saturation (gl.ts FS_FINAL), linear on 0..255."""
    c = c * (1 - SPLIT) + c * TINT_H * SPLIT
    lum_ = c @ np.array([0.2126, 0.7152, 0.0722])
    return lum_ + (c - lum_) * SAT


def fibre_field(rng):
    """The style's paper fibre at the picture's scale, minus its mean (the mean is in the measured paper colour)."""
    k = PIC_H / 1080
    hh, ww = int(round(H / k)), int(round(W / k))
    a = np.where(rng.random((hh, ww)) < 0.55, 0.0, 14 / 255).astype(np.float32)
    grey = (118 + rng.integers(0, 20, (hh, ww))).astype(np.float32)
    d = a * (grey - 240.0)
    d = np.asarray(Image.fromarray(d, 'F').resize((W, H), Image.LANCZOS), np.float32)
    return d - d.mean()


def grain_planes(rng, sigma):
    """NGRAIN planes of luminance grain, std sigma levels, slightly soft like the picture's grain after scaling."""
    out = []
    for _ in range(NGRAIN):
        g = gaussian_filter(rng.normal(0, 1, (H, W)).astype(np.float32), 0.55)
        out.append(g * (sigma / g.std()))
    return out


def lum(img):
    return img[..., 0] * 0.2126 + img[..., 1] * 0.7152 + img[..., 2] * 0.0722


def rel_lum(c):
    c = np.asarray(c, np.float64) / 255
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


def contrast(a, b):
    la, lb = rel_lum(a), rel_lum(b)
    return (np.maximum(la, lb) + 0.05) / (np.minimum(la, lb) + 0.05)


def sstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- ffmpeg
DEC_VF = (f'scale={W}:{PIC_H}:flags=lanczos+accurate_rnd+full_chroma_int:in_color_matrix=bt709:in_range=tv'
          ':out_range=pc,format=rgb24')
FRAME_BYTES = W * PIC_H * 3
WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build')   # ffmpeg's messages (decode*.log, encode.log)
os.makedirs(WORK, exist_ok=True)
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)


def read_frame(proc, buf):
    mv, got = memoryview(buf), 0
    while got < FRAME_BYTES:
        k = proc.stdout.readinto(mv[got:])
        if not k:
            return False
        got += k
    return True


def decode(extra_in, vf, name, frames=None):
    log = open(os.path.join(WORK, name), 'w')
    limit = ['-frames:v', str(frames)] if frames else []
    p = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error'] + extra_in + ['-i', PIC, '-vf', vf] + limit +
                         ['-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
                         stdout=subprocess.PIPE, stderr=log, stdin=subprocess.DEVNULL)
    p.log = log
    return p


def finish(p):
    p.stdout.close()
    rc = p.wait()
    p.log.close()
    return rc


def frame_at(f):
    p = decode(['-ss', f'{max(0.0, (f - 0.5) / FPS):.6f}'], DEC_VF, 'decode-sample.log', frames=1)
    buf = bytearray(FRAME_BYTES)
    ok = read_frame(p, buf)
    finish(p)
    if not ok:
        raise SystemExit(f'could not decode frame {f} of {PIC}')
    return np.frombuffer(buf, np.uint8).reshape(PIC_H, W, 3).copy()


V_PAGE = page_vignette()
GAIN = (V_PAGE[PIC_Y:PIC_Y + PIC_H] / picture_vignette())[..., None]    # the picture's vignette out, the page's in
FALL = falloff_field()


def corrected(pic_u8):
    p = pic_u8.astype(np.float32)
    p *= GAIN
    return p


def reference_frames(n=REF_N):
    """n frames spread across the film (uint8, n x 608 x 1080 x 3)."""
    step = max(1, NFR // n)
    p = decode([], f"select='not(mod(n,{step}))'," + DEC_VF, 'decode-ref.log')
    buf, fr = bytearray(FRAME_BYTES), []
    while read_frame(p, buf):
        fr.append(np.frombuffer(buf, np.uint8).reshape(PIC_H, W, 3).copy())
    finish(p)
    if not fr:
        raise SystemExit(f'could not decode {PIC}')
    return np.stack(fr)


def picture_grain():
    """The std (levels) of the picture's grain, from two consecutive frames in the middle of the film."""
    f0 = NFR // 2
    p = decode(['-ss', f'{max(0.0, (f0 - 0.5) / FPS):.6f}'], DEC_VF, 'decode-grain.log', frames=2)
    buf, fr = bytearray(FRAME_BYTES), []
    for _ in range(2):
        if read_frame(p, buf):
            fr.append(np.frombuffer(buf, np.uint8).reshape(PIC_H, W, 3).astype(np.float32).mean(axis=2))
    finish(p)
    if len(fr) < 2:
        return 1.3
    d = np.concatenate([(fr[1] - fr[0])[:20], (fr[1] - fr[0])[-20:]])
    mad = np.median(np.abs(d - np.median(d))) * 1.4826
    return float(np.clip(mad / np.sqrt(2), 0.4, 3.0))


# ---------------------------------------------------------------- the grid, measured on the picture
def find_lines(ratio):
    """Dark runs in a 1-D ratio profile (N x 3): [(centre, depth, first, last)], centre the darkness-weighted
    centroid, depth the largest darkness (1 - luminance ratio) above the profile's median."""
    d = 1 - lum(ratio)
    d = d - np.median(d)
    noise = 1.4826 * np.median(np.abs(d - np.median(d)))
    thr = max(5 * noise, 0.006)
    m = d > thr
    out, i, N = [], 0, len(d)
    while i < N:
        if not m[i]:
            i += 1
            continue
        j = i
        while j + 1 < N and m[j + 1]:
            j += 1
        a, b = max(0, i - 1), min(N, j + 2)
        w = np.clip(d[a:b], 0, None)
        out.append((float((np.arange(a, b) * w).sum() / max(w.sum(), 1e-9)), float(d[i:j + 1].max()), i, j))
        i = j + 1
    return out, thr


def fit_lattice(lines):
    """Fit centres c_i = a + P * k_i (k_i whole numbers) to the lines; lines off the lattice by more than LATTICE_TOL
    or much weaker / stronger than the others of their class are dropped. Returns dict(a, P, keep, k, rms, n) with n
    the repeat of the line pattern (a major line every n), or None when fewer than 4 lines fit."""
    if len(lines) < 4:
        return None
    c = np.array([l[0] for l in lines])
    dep = np.array([l[1] for l in lines])
    dd = np.diff(c)
    P = float(np.median(dd))
    if P < 4:
        return None
    # the origin: the line that puts the most lines on the lattice (a drawing at the edge is not taken as origin)
    a = max(c, key=lambda o: int((np.abs(c - (o + P * np.round((c - o) / P))) < LATTICE_TOL).sum()))
    keep = np.abs(c - (a + P * np.round((c - a) / P))) < LATTICE_TOL
    for _ in range(4):
        k = np.round((c - a) / P)
        A = np.vstack([np.ones_like(k), k]).T
        if keep.sum() < 4:
            return None
        sol = np.linalg.lstsq(A[keep], c[keep], rcond=None)[0]
        a, P = float(sol[0]), float(sol[1])
        res = c - (a + P * np.round((c - a) / P))
        keep = np.abs(res) < LATTICE_TOL
    k = np.round((c - a) / P).astype(int)
    res = c - (a + P * k)
    # the repeat n of the line pattern: the smallest n for which the depths within each class k mod n agree
    n_best = 1
    sd_all = dep[keep].std()
    if sd_all > 0.12 * dep[keep].mean():
        for n in range(2, 11):
            cls = [dep[keep & (k % n == r)] for r in range(n)]
            within = np.sqrt(np.mean([((x - x.mean()) ** 2).mean() for x in cls if len(x)]))
            if within < 0.25 * sd_all:
                n_best = n
                break
    # a line much weaker or stronger than its class (a drawing that sits on the lattice) is dropped
    for r in range(n_best):
        sel = keep & (k % n_best == r)
        if sel.sum() >= 2:
            med = np.median(dep[sel])
            keep &= ~((k % n_best == r) & ((dep > 1.8 * med) | (dep < 0.45 * med)))
    return dict(a=a, P=P, keep=keep, k=k, rms=float(np.sqrt(np.mean(res[keep] ** 2))), n=n_best)


def clean_profile(ratio, lines, fit):
    """The ratio profile with 1 everywhere except around the lattice lines. A lattice line is copied from the
    measurement where its window (its dark run and LINE_WIN on each side) touches no other dark run; a lattice line
    that is missing (hidden by a drawing in every reference frame) or whose window touches another run (a ruler
    beside it) is copied from the nearest clean line of its class (k mod n) whose sub-pixel phase is closest, shifted
    by whole pixels. Returns (profile, number measured, number copied)."""
    N = len(ratio)
    out = np.ones_like(ratio)
    if fit is None:
        return out, 0, 0
    a, P, n = fit['a'], fit['P'], fit['n']
    busy = np.zeros(N, bool)                 # pixels of runs that are not clean lattice lines
    for (c, dep, i, j), ok in zip(lines, fit['keep']):
        if not ok:
            busy[max(0, i - 1):min(N, j + 2)] = True
    clean = {}                               # lattice index -> (centre, window start, window end)
    for (c, dep, i, j), ok, k in zip(lines, fit['keep'], fit['k']):
        if ok:
            w0, w1 = max(0, i - LINE_WIN), min(N, j + LINE_WIN + 1)
            if not busy[w0:w1].any() and w0 > 0 and w1 < N:
                clean[int(k)] = (c, w0, w1)
    k_lo, k_hi = math.ceil((-2 - a) / P), math.floor((N + 1 - a) / P)
    copied = 0
    for k in range(k_lo, k_hi + 1):
        if k in clean:
            c, w0, w1 = clean[k]
            out[w0:w1] = ratio[w0:w1]          # with the scaler's light ringing beside the line (ratio above 1)
            continue
        ck = a + P * k
        same = [m for m in clean if (m - k) % n == 0]
        if not same:
            continue
        def score(m):
            d = clean[m][0] - ck
            ph = abs(d - round(d))
            return (round(ph / 0.1), abs(m - k))
        m = min(same, key=score)
        cm, w0, w1 = clean[m]
        sh = int(round(ck - cm))
        for x in range(w0, w1):
            if 0 <= x + sh < N:
                out[x + sh] = ratio[x]
        copied += 1
    return out, len(clean), copied


def measure_grid(stack):
    """The grid of the picture from the reference frames: the band's column ratios GV (W x 3), the picture's row
    ratios RH (PIC_H x 3), the fits, the crossing model, and notes for the report."""
    k = int(round(BG_PCT * (len(stack) - 1)))
    B = np.partition(stack, k, axis=0)[k].astype(np.float32) * GAIN
    notes = []
    # vertical lines: the top and bottom edge zones
    prof = []
    for r0, r1 in ((2, 2 + EDGE_ZONE), (PIC_H - 2 - EDGE_ZONE, PIC_H - 2)):
        Z = B[r0:r1]
        S = median_filter(Z, size=(1, 61, 1), mode='nearest')
        prof.append(np.median(Z / S, axis=0))
    rv = np.maximum(prof[0], prof[1])        # a drawing touching one edge only darkens that edge's profile
    lv, thr_v = find_lines(rv)
    fv = fit_lattice(lv)
    # agreement of the two edge zones on the lattice lines (a grid that stops short of one edge)
    if fv is not None:
        dv = [1 - lum(p) for p in prof]
        cols = [int(round(l[0])) for l, ok in zip(lv, fv['keep']) if ok]
        if cols:
            r = np.median(dv[0][cols]) / max(np.median(dv[1][cols]), 1e-6)
            notes.append(f'vertical lines: depth at the top edge / bottom edge {r:.2f}')
            if not 0.7 < r < 1.4:
                notes.append('WARNING: the vertical lines are not equally strong at the top and bottom edges')
    GV, nv_meas, nv_copy = clean_profile(rv, lv, fv)
    # horizontal lines: the right strip
    Z = B[:, STRIP_X0:W - 2]
    S = median_filter(Z, size=(41, 1, 1), mode='nearest')
    rh = np.median(Z / S, axis=1)
    lh, thr_h = find_lines(rh)
    fh = fit_lattice(lh)
    RH, nh_meas, nh_copy = clean_profile(rh, lh, fh)
    # the crossing model: at crossings inside the strip, product or minimum of the two ratios
    model = 'product'
    if fv is not None and fh is not None:
        xs = [int(round(l[0])) for l, ok in zip(lv, fv['keep']) if ok and STRIP_X0 + 3 <= l[0] < W - 5]
        ys = [int(round(l[0])) for l, ok in zip(lh, fh['keep']) if ok and 25 <= l[0] < PIC_H - 25]
        if xs and ys:
            L = lum(B)
            loc = median_filter(L[:, STRIP_X0 - 20:], size=(31, 31), mode='nearest')
            meas, prod, mn = [], [], []
            for y in ys:
                for x in xs:
                    meas.append(L[y, x] / loc[y, x - STRIP_X0 + 20])
                    gv, gh = lum(GV[x]), lum(RH[y])
                    prod.append(gv * gh)
                    mn.append(min(gv, gh))
            meas, prod, mn = map(np.array, (meas, prod, mn))
            e_p, e_m = np.abs(meas - prod).mean(), np.abs(meas - mn).mean()
            model = 'product' if e_p <= e_m else 'minimum'
            notes.append(f'crossings ({len(meas)}): ratio {meas.mean():.3f}, product {prod.mean():.3f}, minimum'
                         f' {mn.mean():.3f}: {model}')
    for name, lines, fit, thr, nm, ncp in (('vertical', lv, fv, thr_v, nv_meas, nv_copy),
                                           ('horizontal', lh, fh, thr_h, nh_meas, nh_copy)):
        if fit is None:
            notes.append(f'WARNING: no {name} grid lines found ({len(lines)} dark runs above {thr:.4f}):'
                         f' the band has no {name} lines')
            continue
        dep = np.array([l[1] for l in lines])[fit['keep']]
        off = [f'{l[0]:.1f}' for l, ok in zip(lines, fit['keep']) if not ok]
        notes.append(f'{name} lines: {int(fit["keep"].sum())} on a lattice of period {fit["P"]:.3f} px'
                     f' ({fit["P"] / (W / 1920 if name == "vertical" else PIC_H / 1080):.2f} px of the 16:9 frame),'
                     f' origin {fit["a"] % fit["P"]:.2f}, rms off it {fit["rms"]:.3f} px, pattern repeats every'
                     f' {fit["n"]} line(s); depth {dep.min():.3f}..{dep.max():.3f}'
                     + f'; {nm} lines measured clean, {ncp} copied from a clean line of their class'
                     + (f'; not continued (off the lattice or unlike its class): {", ".join(off)}' if off else ''))
    return dict(B=B, GV=GV, RH=RH, rv=rv, rh=rh, fv=fv, fh=fh, lv=lv, lh=lh, model=model, notes=notes)


def extend_rows(RH, fit):
    """The band's row ratios GH (H x 3) on page rows: for a page row y, the measured ratio of the picture row
    y - PIC_Y + k * n * P (rows 3 .. PIC_H - 4) that lies closest to a whole row (cubic spline for the fraction).
    Inside the picture that is the row itself; its first and last 3 rows (where the scaler meets the frame's edge
    and a line just outside the frame shows half) and every band row take a line of the same phase inside."""
    GH = np.ones((H, 3), np.float32)
    if fit is None:
        return GH, 0.0
    Pm = fit['n'] * fit['P']
    lo, hi = 3.0, PIC_H - 4.0
    worst = 0.0
    for y in range(H):
        yp = y - PIC_Y
        k0, k1 = math.ceil((lo - yp) / Pm), math.floor((hi - yp) / Pm)
        cands = [yp + k * Pm for k in range(k0, k1 + 1)]
        if not cands:
            continue
        yq = min(cands, key=lambda q: abs(q - round(q)))
        worst = max(worst, abs(yq - round(yq)))
        for ch in range(3):
            GH[y, ch] = map_coordinates(RH[:, ch], [[yq]], order=3, mode='nearest')[0]
    return GH, worst


# ---------------------------------------------------------------- the picture's edges and the band's ramps
def smooth_cols(a, k=40):
    pad = np.pad(a, ((k, k), (0, 0)), mode='edge')
    c = np.cumsum(pad, axis=0)
    return (c[2 * k:] - c[:-2 * k]) / (2 * k)


ET, EB = [0, 1, 2], [PIC_H - 3, PIC_H - 2, PIC_H - 1]    # edge rows: replaced by grid-free rows once measured


def edges(pic):
    """The picture's top and bottom paper colours, column by column: the mean of its 3 grid-free rows next to each
    edge, a running median over 61 columns (vertical grid lines and ink narrower than about 30 px do not count), then
    box-smoothed over 80 columns."""
    return tuple(smooth_cols(median_filter(pic[rows].mean(axis=0), size=(61, 1), mode='nearest'))
                 for rows in (ET, EB))


def free_rows(fit, rows):
    """The first 3 of the given picture rows that hold no grid line: more than 3 px from every line of the fitted
    lattice (also a line just outside the picture, whose half shows on its edge row)."""
    if fit is None:
        return rows[:3]
    a, P = fit['a'], fit['P']
    free = [r for r in rows if abs(r - (a + P * round((r - a) / P))) > 3.0]
    return (free + [r for r in rows if r not in free])[:3]


ys_all = np.arange(H, dtype=np.float32)
_kt = np.clip((ys_all - (PIC_Y - MATCH)) / MATCH, 0, 1)
K_TOP = (_kt * _kt * (3 - 2 * _kt)) * (ys_all < PIC_Y + FEATHER)
_kb = np.clip(((PIC_Y + PIC_H + MATCH) - ys_all) / MATCH, 0, 1)
K_BOT = (_kb * _kb * (3 - 2 * _kb)) * (ys_all >= PIC_Y + PIC_H - FEATHER)
_kt = np.clip((ys_all - (PIC_Y - TRACK)) / TRACK, 0, 1)
K_TOP_DYN = (_kt * _kt * (3 - 2 * _kt)) * (ys_all < PIC_Y + FEATHER)
_kb = np.clip(((PIC_Y + PIC_H + TRACK) - ys_all) / TRACK, 0, 1)
K_BOT_DYN = (_kb * _kb * (3 - 2 * _kb)) * (ys_all >= PIC_Y + PIC_H - FEATHER)
TOP_DYN = (PIC_Y - TRACK, PIC_Y + FEATHER)
BOT_DYN = (PIC_Y + PIC_H - FEATHER, PIC_Y + PIC_H + TRACK)
_r = np.linspace(0, 1, FEATHER, dtype=np.float32)
_r = _r * _r * (3 - 2 * _r)
PIC_ALPHA = np.ones(PIC_H, np.float32)
PIC_ALPHA[:FEATHER] = _r
PIC_ALPHA[-FEATHER:] = _r[::-1]
PAPER_TOL = 3.0


def ground(top, bot, rng, grid):
    """The band (H x W x 3 float, before grain and text), the paper colour P0 and the paper model at the picture's
    top and bottom edge rows. As in the metre composer (P0 from the picture's edge colours with the page vignette and
    the fall-off taken out, their 80th percentile; fall-off, fibre, page vignette; near the picture the picture's own
    edge colours, at most PAPER_TOL from the model), then the grid on top of that paper (after the blend, so the
    lines go on up to the joint)."""
    bg = grade_linear(FALL_BROWN)
    yt, yb = PIC_Y + float(np.mean(ET)), PIC_Y + float(np.mean(EB))
    it, ib = int(round(yt)), int(round(yb))
    est = []
    for e, y in ((top, it), (bot, ib)):
        f = FALL[y][:, None]
        est.append((e / V_PAGE[y][:, None] - f * bg) / (1 - f))
    p0 = np.percentile(np.concatenate(est), 80, axis=0).astype(np.float32)
    f = FALL[..., None]
    g = p0 * (1 - f) + bg.astype(np.float32) * f
    model = [g[it] * V_PAGE[it][:, None], g[ib] * V_PAGE[ib][:, None]]
    g = g + fibre_field(rng)[..., None]
    g = g * V_PAGE[..., None]
    tt = model[0] + np.clip(top - model[0], -PAPER_TOL, PAPER_TOL)
    tb = model[1] + np.clip(bot - model[1], -PAPER_TOL, PAPER_TOL)
    kt, kb = K_TOP[:, None, None], K_BOT[:, None, None]
    g = g * (1 - kt) + tt[None, :, :] * kt
    g = g * (1 - kb) + tb[None, :, :] * kb
    g = g * grid
    return g.astype(np.float32), p0, model


def flat_paper():
    flat = (grade_linear(PAPER_BG)[None, None, :] * V_PAGE[..., None]).astype(np.float32)
    return flat, edges(flat[PIC_Y:PIC_Y + PIC_H])


# ---------------------------------------------------------------- text layers
class Layer:
    """Premultiplied RGBA cropped to rows y0:y1, columns x0:x1 (ink on paper: no shadow). paint(canvas) draws onto a
    transparent W x H RGBA image and returns the text boxes."""

    def __init__(self, paint, name):
        canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        self.boxes = paint(canvas)
        self.name = name
        a = np.asarray(canvas)
        ys, xs = np.nonzero(a[..., 3])
        y0, y1 = max(0, ys.min() - PAD), min(H, ys.max() + 1 + PAD)
        x0, x1 = max(0, xs.min() - PAD), min(W, xs.max() + 1 + PAD)
        ta = a[y0:y1, x0:x1, 3].astype(np.float32) / 255
        tc = a[y0:y1, x0:x1, :3].astype(np.float32)
        self.A = ta[..., None]
        self.C = tc * self.A
        self.y0, self.y1, self.x0, self.x1 = y0, y1, x0, x1


def put(d, boxes, label, s, x, y, f, fill, ls=0, small=False):
    check_glyphs(f, s)
    draw_str(d, s, x, y, f, fill + (255,), ls)
    b = ink_box(s, f, ls)
    boxes.append((label, s, x + b[0], y + b[1], x + b[2], y + b[3], f.size, small))


def put_centred(d, boxes, label, s, cx, y, f, fill, ls=0):
    b = ink_box(s, f, ls)
    put(d, boxes, label, s, cx - (b[0] + b[2]) / 2, y, f, fill, ls)


def stamp_geometry():
    """The stamp's frame (x0, y0, x1, y1) before turning, and the ink box of its text."""
    fs = font(SERIF, STAMP_PX, STAMP_WT)
    b = ink_box(STAMP_TEXT, fs, STAMP_LS)
    w = (b[2] - b[0]) + 2 * (STAMP_PAD_X + STAMP_FRAME)
    h = (b[3] - b[1]) + 2 * (STAMP_PAD_Y + STAMP_FRAME)
    return (BAND_X0, STAMP_TOP, BAND_X0 + w, STAMP_TOP + h), b


def paint_stamp(canvas):
    """「假设」 as a rubber stamp in the film's red: a thick frame with rounded corners and the two characters,
    drawn at 4x, turned STAMP_ANGLE degrees about its centre, scaled down, its ink made uneven (low-frequency density
    from 0.82 to 1, a few small gaps), at STAMP_INK opacity."""
    S = 4
    (x0, y0, x1, y1), b = stamp_geometry()
    w, h = x1 - x0, y1 - y0
    m = 24
    big = Image.new('L', ((w + 2 * m) * S, (h + 2 * m) * S), 0)
    d = ImageDraw.Draw(big)
    d.rounded_rectangle([m * S, m * S, (m + w) * S - 1, (m + h) * S - 1], radius=STAMP_RADIUS * S, outline=255,
                        width=STAMP_FRAME * S)
    fs4 = font(SERIF, STAMP_PX * S, STAMP_WT)
    check_glyphs(fs4, STAMP_TEXT)
    b4 = ink_box(STAMP_TEXT, fs4, STAMP_LS * S)
    cx, cy = (m + w / 2) * S, (m + h / 2) * S
    draw_str(d, STAMP_TEXT, cx - (b4[0] + b4[2]) / 2, cy - (b4[1] + b4[3]) / 2, fs4, 255, STAMP_LS * S)
    big = big.rotate(STAMP_ANGLE, resample=Image.BICUBIC, center=(cx, cy))
    small = np.asarray(big.resize((w + 2 * m, h + 2 * m), Image.LANCZOS), np.float32) / 255
    rng = np.random.default_rng(1702)
    dens = gaussian_filter(rng.normal(0, 1, small.shape), 9)
    dens = 0.82 + 0.18 * smoothstep((dens / dens.std() + 1.2) / 2.4)
    gaps = gaussian_filter(rng.normal(0, 1, small.shape), 1.1)
    gaps = 1 - 0.75 * smoothstep((gaps / gaps.std() - 1.7) / 0.6)
    a = np.clip(small * dens * gaps * STAMP_INK, 0, 1)
    rgba = np.zeros(a.shape + (4,), np.uint8)
    rgba[..., :3] = RED
    rgba[..., 3] = np.round(a * 255).astype(np.uint8)
    canvas.alpha_composite(Image.fromarray(rgba, 'RGBA'), (x0 - m, y0 - m))
    ys, xs = np.nonzero(a > 0.02)
    return [('stamp', STAMP_TEXT, x0 - m + xs.min(), y0 - m + ys.min(), x0 - m + xs.max() + 1, y0 - m + ys.max() + 1,
             STAMP_PX, False)]


def paint_premise(canvas):
    """The two premise lines beside the stamp, PREM_STEP apart (em box to em box), the pair centred on the stamp's
    frame; left edge PREM_GAP right of the frame."""
    d, boxes = ImageDraw.Draw(canvas), []
    (x0, y0, x1, y1), b = stamp_geometry()
    fp = font(SERIF, PREM_PX, PREM_WT)
    b0, b1 = ink_box(PREMISE[0], fp, PREM_LS), ink_box(PREMISE[1], fp, PREM_LS)
    ink_top, ink_bot = b0[1], PREM_STEP + b1[3]          # the pair's ink, em top of line 1 at 0
    ytop = (y0 + y1) / 2 - (ink_top + ink_bot) / 2
    x = x1 + PREM_GAP
    put(d, boxes, 'premise', PREMISE[0], x - b0[0], ytop, fp, FG, PREM_LS)
    put(d, boxes, 'premise', PREMISE[1], x - b1[0], ytop + PREM_STEP, fp, FG, PREM_LS)
    return boxes


def paint_note(canvas):
    d, boxes = ImageDraw.Draw(canvas), []
    (x0, y0, x1, y1), b = stamp_geometry()
    fn = font(SERIF, NOTE_PX, NOTE_WT)
    bn = ink_box(NOTE, fn, NOTE_LS)
    put(d, boxes, 'note', NOTE, x0 - bn[0], y1 + NOTE_GAP - bn[1], fn, FG2, NOTE_LS, small=True)
    return boxes


def paint_plate(canvas):
    """「核算员」 in ink in a thin ink frame, the frame's right edge at PLATE_RIGHT."""
    d, boxes = ImageDraw.Draw(canvas), []
    fp = font(SERIF, PLATE_PX, PLATE_WT)
    b = ink_box(PLATE_TEXT, fp, PLATE_LS)
    w = (b[2] - b[0]) + 2 * PLATE_PAD_X
    h = (b[3] - b[1]) + 2 * PLATE_PAD_Y
    fx1, fy0 = PLATE_RIGHT, PLATE_INK_TOP - PLATE_PAD_Y
    fx0, fy1 = fx1 - w, fy0 + h
    d.rectangle([fx0, fy0, fx1 - 1, fy1 - 1], outline=FG2 + (255,), width=PLATE_FRAME)
    put(d, boxes, 'plate', PLATE_TEXT, fx0 + PLATE_PAD_X - b[0], PLATE_INK_TOP - b[1], fp, FG, PLATE_LS)
    boxes.append(('plate frame', '', fx0, fy0, fx1, fy1, PLATE_PX, False))
    return boxes


def caption_layout(cap, force=None):
    fz = font(SERIF, ZH_PX, ZH_WT)
    zl = wrap_zh(cap['zh'], fz, CAP_W, ZH_LS)
    zl = [ln.rstrip(LINE_END_DROP) if k < len(zl) - 1 else ln for k, ln in enumerate(zl)]
    fits = []
    for si, (step, gap, epx, estep) in enumerate(CAP_STEPS):
        if force is not None and si != force:
            continue
        fe = font(GEL_I, epx, EN_WT)
        el, ecost = wrap_en(cap['en'], fe, CAP_W) if cap.get('en') else ([], 0.0)
        zrows = [(ln, fz, CAP_Y + i * step, ZH_LS) for i, ln in enumerate(zl)]
        y = CAP_Y + len(zl) * step + gap
        erows = [(ln, fe, y + j * estep, 0) for j, ln in enumerate(el)]
        bottom = max(y0 + ink_box(ln, f, ls)[3] for ln, f, y0, ls in zrows + erows)
        if bottom <= CAP_LIMIT:
            fits.append(dict(zl=zl, el=el, zrows=zrows, erows=erows, si=si, step=(step, gap, epx, estep),
                             bottom=bottom, ecost=ecost))
            if ecost < 5 or force is not None:
                return fits[-1]
    if not fits:
        raise SystemExit(f'caption does not fit above {CAP_LIMIT}' + (f' at step {force}' if force is not None else
                                                                       ' even at 26 px English') + f': {cap["zh"]}')
    return min(fits, key=lambda L: L['ecost'])


def paint_rows(rows, colour, label):
    def fn(canvas):
        d, boxes = ImageDraw.Draw(canvas), []
        for ln, f, y, ls in rows:
            put_centred(d, boxes, label, ln, CAP_CX, y, f, colour, ls)
        return boxes
    return fn


def zone_problems(boxes, band=False):
    bad = []
    for label, s, x0, y0, x1, y1, px, small in boxes:
        if y0 < SAFE_TOP or y1 > SAFE_BOTTOM or x1 > SAFE_RIGHT or x0 < SAFE_LEFT:
            bad.append(f'{label} "{s}" box x {x0:.0f}..{x1:.0f} y {y0:.0f}..{y1:.0f} outside the safe zone')
        if band and y1 > BAND_TEXT_LIMIT:
            bad.append(f'{label} "{s}" ends at y {y1:.0f}, below {BAND_TEXT_LIMIT} (the rows that follow the picture)')
        if px < 26 and not small:
            bad.append(f'{label} "{s}" {px} px')
    return bad


def overlaps(boxes):
    bad = []
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            a, b = boxes[i], boxes[j]
            if a[0] == 'plate frame' and b[0] == 'plate' or b[0] == 'plate frame' and a[0] == 'plate':
                continue
            if a[2] < b[4] and b[2] < a[4] and a[3] < b[5] and b[3] < a[5]:
                bad.append(f'{a[0]} "{a[1]}" overlaps {b[0]} "{b[1]}"')
    return bad


# ---------------------------------------------------------------- build everything static
t_start = time.perf_counter()
rng = np.random.default_rng(1702)
stack = reference_frames()
grid = measure_grid(stack)
ET = free_rows(grid['fh'], list(range(0, 14)))
EB = free_rows(grid['fh'], list(range(PIC_H - 1, PIC_H - 15, -1)))
GH, gh_frac = extend_rows(grid['RH'], grid['fh'])
GV = grid['GV']
GRID = (GV[None, :, :] * GH[:, None, :] if grid['model'] == 'product'
        else np.minimum(GV[None, :, :], GH[:, None, :])).astype(np.float32)
tops, bots = [], []
for fr in stack:
    t_, b_ = edges(corrected(fr))
    tops.append(t_)
    bots.append(b_)
top_ref, bot_ref = np.median(tops, axis=0).astype(np.float32), np.median(bots, axis=0).astype(np.float32)
# the vertical lines' reference profile at the edges, to see whether any frame moves its grid (a camera on the grid)
REF_V = 1 - lum(grid['rv'])
del stack, tops, bots
sigma = picture_grain()
g, P0, MODEL = ground(top_ref, bot_ref, rng, GRID)
flatp, (E_FLAT_TOP, E_FLAT_BOT) = flat_paper()
DELTA = flatp - g
del flatp
E_T, E_B = E_FLAT_TOP - top_ref, E_FLAT_BOT - bot_ref
M_T = (np.abs(lum(top_ref - MODEL[0])) < PAPER_TOL)[:, None]
M_B = (np.abs(lum(bot_ref - MODEL[1])) < PAPER_TOL)[:, None]
EE = float((E_T * E_T * M_T).sum() + (E_B * E_B * M_B).sum())
W_T, W_B = smooth_cols(M_T.astype(np.float32))[:, :1], smooth_cols(M_B.astype(np.float32))[:, :1]
PAPER = g.copy()              # the band without text or grain (for the contrast checks)

band_layers = [Layer(paint_plate, 'plate'), Layer(paint_stamp, 'stamp'), Layer(paint_premise, 'premise'),
               Layer(paint_note, 'note')]
for Lt in band_layers:
    reg = g[Lt.y0:Lt.y1, Lt.x0:Lt.x1]
    reg *= 1 - Lt.A
    reg += Lt.C
    DELTA[Lt.y0:Lt.y1, Lt.x0:Lt.x1] *= 1 - Lt.A        # the fade changes the paper, not the ink

caps = tl['captions']
groups, i = [], 0
while i < len(caps):
    j = i
    while (j + 1 < len(caps) and caps[j + 1].get('en') and caps[j + 1].get('en') == caps[i].get('en')
           and abs(caps[j + 1]['a'] - caps[j]['b']) < 1e-3):
        j += 1
    groups.append(list(range(i, j + 1)))
    i = j + 1
lays = [caption_layout(c) for c in caps]
for grp in groups:
    if len(grp) > 1:
        si = max(lays[k]['si'] for k in grp)
        trial = [caption_layout(caps[k], force=si) for k in grp]
        if len({len(L['zl']) for L in trial}) == 1:
            for k, L in zip(grp, trial):
                lays[k] = L
        else:
            print(f'  captions {grp}: same English but different Chinese line counts: English set per caption')
            groups[groups.index(grp)] = None
            groups += [[k] for k in grp]
groups = sorted([gp for gp in groups if gp], key=lambda gp: gp[0])

zh_layers = [Layer(paint_rows(L['zrows'], FG, 'zh'), f'caption {k} zh') for k, L in enumerate(lays)]
en_items = []
for grp in groups:
    L = lays[grp[0]]
    if L['erows']:
        en_items.append((Layer(paint_rows(L['erows'], FG2, 'en'), f'caption {grp[0]}' +
                               (f'-{grp[-1]}' if len(grp) > 1 else '') + ' en'),
                         caps[grp[0]]['a'], caps[grp[-1]]['b'], grp))

problems = []
print(f'{len(caps)} captions (zh step, gap, en px, en step; ink bottom):')
for k, (c, L) in enumerate(zip(caps, lays)):
    exact = same_text(L['zl'], c['zh'], LINE_END_DROP) and same_text(L['el'], c.get('en', ''))
    print(f'  [{k:2d}] {c["a"]:7.3f}-{c["b"]:7.3f}  {L["step"]}  bottom {L["bottom"]:.0f}'
          f'  English break cost {L["ecost"]:.0f}  exact {exact}')
    for ln in L['zl'] + L['el']:
        print('        ' + ln)
    if not exact:
        problems.append(f'caption {k}: lines do not reproduce the timeline text')
    for ln in L['zl'][1:]:
        if ln[:1] in NO_LINE_START:
            problems.append(f'caption {k}: line starts with punctuation: {ln}')
for Lr in zh_layers + [it[0] for it in en_items]:
    problems += [f'{Lr.name}: {p}' for p in zone_problems(Lr.boxes)]
band_boxes = [b for Lr in band_layers for b in Lr.boxes]
problems += [f'band: {p}' for p in zone_problems(band_boxes, band=True) + overlaps(band_boxes)]
for it in en_items:
    if len(it[3]) > 1:
        print(f'  English of captions {it[3]} set once, {it[1]:.3f}-{it[2]:.3f} s')
print('band:')
for b in band_boxes:
    print(f'  {b[0]:<12} {b[1]:<20} ink x {b[2]:.0f}..{b[4]:.0f}, y {b[3]:.0f}..{b[5]:.0f} ({b[6]} px)')
print('grid (measured on the picture):')
for nt in grid['notes']:
    print('  ' + nt)
print(f'  band rows take picture rows at most {gh_frac:.3f} px off a whole row; edge rows used for the paper colour:'
      f' top {ET}, bottom {EB}')
print(f'  paper {np.round(P0, 1).tolist()} ({int(M_T.sum())} / {int(M_B.sum())} columns of the top / bottom edge are'
      f' paper); picture grain {sigma:.2f} levels')
if problems:
    print('layout problems:')
    for p in problems:
        print('  ' + p)
    sys.exit(1)

STRIPS = [(TOP_DYN[0], TOP_DYN[1]),
          (BOT_DYN[0], max([BOT_DYN[1]] + [Lr.y1 for Lr in zh_layers] + [it[0].y1 for it in en_items]))]
assert all(STRIPS[1][0] <= Lr.y0 for Lr in zh_layers + [it[0] for it in en_items])
assert all(Lr.y1 <= STRIPS[0][0] for Lr in band_layers)
k_top = K_TOP_DYN[:, None, None].astype(np.float32)
k_bot = K_BOT_DYN[:, None, None].astype(np.float32)
OUTSIDE = [(0, STRIPS[0][0]), (STRIPS[1][1], H)]
grains = grain_planes(rng, sigma)
BAND_U8, STRIP_F = [], []
for gp in grains:
    b = g + gp[..., None]
    BAND_U8.append(np.clip(b + 0.5, 0, 255).astype(np.uint8))
    STRIP_F.append([b[r0:r1].copy() for r0, r1 in STRIPS])
del grains, g
print(f'static layers ready in {time.perf_counter() - t_start:.1f} s; strips {STRIPS}')


def cap_alpha(a, b, T):
    fd = min(CAP_FADE, (b - a) / 4)
    return sstep(a, a + fd, T) * (1 - sstep(b - fd, b, T))


def active(f):
    T = f / FPS
    out = []
    for Lz, c in zip(zh_layers, caps):
        if c['a'] <= T <= c['b']:
            a = cap_alpha(c['a'], c['b'], T)
            if a > 0:
                out.append((Lz, a))
            break
    for Le, a0, b0, _ in en_items:
        if a0 <= T <= b0:
            a = cap_alpha(a0, b0, T)
            if a > 0:
                out.append((Le, a))
            break
    return out


stats = dict(clipped=0, max_delta=0.0, faded=0, fade_max=0.0, grid_moved=0, grid_worst=0.0)


def fade_amount(top, bot):
    if EE < 1.0:
        return 0.0
    a = float(((top - top_ref) * E_T * M_T).sum() + ((bot - bot_ref) * E_B * M_B).sum()) / EE
    return min(1.0, max(0.0, (a - FADE_FLOOR) / (1 - FADE_FLOOR)))


def grid_shift(pic):
    """How far (px) this frame's vertical lines at the picture's edges are off the reference: the shift of the
    cross-correlation peak of the edge zones' darkness profile with the reference profile (parabolic fit), over
    shifts of -4..4 px; 0 when the picture has no grid."""
    if grid['fv'] is None:
        return 0.0
    Z = np.concatenate([pic[2:2 + EDGE_ZONE], pic[PIC_H - 2 - EDGE_ZONE:PIC_H - 2]])
    L = lum(Z)
    d = 1 - np.median(L / median_filter(L, size=(1, 61), mode='nearest'), axis=0)
    a, b = d - d.mean(), REF_V - REF_V.mean()
    cc = [float((np.roll(a, s) * b).sum()) for s in range(-4, 5)]
    i = int(np.argmax(cc))
    if 0 < i < 8:
        den = cc[i - 1] - 2 * cc[i] + cc[i + 1]
        off = 0.5 * (cc[i - 1] - cc[i + 1]) / den if den else 0.0
    else:
        off = 0.0
    return abs(i - 4 + off)


def compose(pic_u8, f, out):
    """Frame f into out (H x W x 3 uint8). Returns the text layers shown, the corrected picture, the fade amount and
    the largest residual edge shift."""
    kg = f % NGRAIN
    np.copyto(out, BAND_U8[kg])
    pic = corrected(pic_u8)
    out[PIC_Y + FEATHER:PIC_Y + PIC_H - FEATHER] = np.clip(pic[FEATHER:PIC_H - FEATHER] + 0.5, 0, 255)
    top, bot = edges(pic)
    fa = fade_amount(top, bot)
    stats['fade_max'] = max(stats['fade_max'], fa)
    if fa > 1 / 512:
        stats['faded'] += 1
        for r0, r1 in OUTSIDE:
            s = BAND_U8[kg][r0:r1] + fa * DELTA[r0:r1] + 0.5
            np.clip(s, 0, 255, out=s)
            out[r0:r1] = s.astype(np.uint8)
    dt, db = (top - top_ref - fa * E_T) * W_T, (bot - bot_ref - fa * E_B) * W_B
    m = float(max(np.abs(dt).max(), np.abs(db).max()))
    stats['max_delta'] = max(stats['max_delta'], m)
    if m > EDGE_CLIP:
        stats['clipped'] += 1
    dt = np.clip(dt, -EDGE_CLIP, EDGE_CLIP)[None]
    db = np.clip(db, -EDGE_CLIP, EDGE_CLIP)[None]
    layers = active(f)
    for si, (r0, r1) in enumerate(STRIPS):
        s = STRIP_F[kg][si].copy()
        if fa > 1 / 512:
            s += fa * DELTA[r0:r1]
        for (z0, z1), kz, dz in ((TOP_DYN, k_top, dt), (BOT_DYN, k_bot, db)):
            a0, a1 = max(z0, r0), min(z1, r1)
            if a0 < a1:
                s[a0 - r0:a1 - r0] += kz[a0:a1] * dz
        p0, p1 = max(PIC_Y, r0), min(PIC_Y + PIC_H, r1)
        if p0 < p1:
            al = PIC_ALPHA[p0 - PIC_Y:p1 - PIC_Y][:, None, None]
            reg = s[p0 - r0:p1 - r0]
            reg *= 1 - al
            reg += pic[p0 - PIC_Y:p1 - PIC_Y] * al
        for L, a in layers:
            y0, y1 = max(L.y0, r0), min(L.y1, r1)
            if y0 >= y1:
                continue
            reg = s[y0 - r0:y1 - r0, L.x0:L.x1]
            A, C = L.A[y0 - L.y0:y1 - L.y0], L.C[y0 - L.y0:y1 - L.y0]
            reg *= 1 - a * A
            reg += a * C
        s += 0.5
        np.clip(s, 0, 255, out=s)
        out[r0:r1] = s.astype(np.uint8)
    return layers, pic, fa, m


# ---------------------------------------------------------------- --sample: single frames and their checks
LINE_ROWS = np.any(np.abs(GH - 1) > 5e-4, axis=1)       # page rows on a horizontal line of the band's / picture's grid
LINE_COLS = np.any(np.abs(GV - 1) > 5e-4, axis=1)       # columns on a vertical line


def paper_report(Lm, name, band_rows, pic_rows):
    """The paper level just outside the joint against the picture just inside its feather, per 60-px column bin
    (medians over rows and columns that hold no grid line, so the lines do not count), and the largest step between
    adjacent paper rows across the joint (rows on grid lines left out)."""
    def level(r0, r1, x0, x1):
        rows = [y for y in range(r0, r1) if not LINE_ROWS[y]]
        cols = [x for x in range(x0, x1) if not LINE_COLS[x]]
        return float(np.median(Lm[np.ix_(rows, cols)])) if rows and cols else float('nan')
    bins = np.array([level(*pic_rows, x0, x0 + 60) - level(*band_rows, x0, x0 + 60) for x0 in range(0, W, 60)])
    content = np.abs(bins) > 12                     # something drawn there in this frame: not a paper step
    bins[content] = np.nan
    lo, hi = min(band_rows[0], pic_rows[0]), max(band_rows[1], pic_rows[1])
    rows = [y for y in range(lo - 20, hi + 20) if not LINE_ROWS[y]]
    cols = [x for x in range(W) if not LINE_COLS[x]]
    prof = np.median(Lm[np.ix_(rows, cols)], axis=1)
    steps = [abs(prof[i + 1] - prof[i]) for i in range(len(rows) - 1) if rows[i + 1] - rows[i] <= 4]
    k = int(np.nanargmax(np.abs(bins)))
    print(f'  {name} paper: picture minus band per 60-px bin mean {np.nanmean(bins):+.2f}, largest {bins[k]:+.2f}'
          f' at x {k * 60}-{k * 60 + 59} ({int(content.sum())} of 18 bins left out: drawing); largest step between'
          f' neighbouring paper rows {max(steps):.2f} levels')


def dips(prof):
    """Centres (darkness-weighted, sub-pixel) and depths of the dark dips of a 1-D luminance profile, relative to its
    running median over 15 samples (the paper; the scaler's light and dark ringing beside a strong line stays under
    the threshold)."""
    env = median_filter(prof, size=15, mode='nearest')
    d = 1 - prof / env
    out = []
    for i in range(1, len(d) - 1):
        if d[i] >= d[i - 1] and d[i] > d[i + 1] and d[i] > 0.012:
            w = np.clip(d[i - 1:i + 2], 0, None)
            out.append((i - 1 + float((np.arange(3) * w).sum() / w.sum()), float(d[i])))
    return out


def grid_report(Lm, name, y_join, side):
    """Grid lines across a joint, on the frame as composed. Vertical lines: for each lattice line, its centre
    (darkness-weighted) and its darkness (paper minus the line's darkest column, paper = the median of the columns
    4-7 px either side) in the band 24-36 rows outside the joint against the picture 40-52 rows inside it; a line
    with something else drawn within 7 px in the picture (a dip deeper than twice the grid's) is left out.
    Horizontal lines: the dips of the row profile of the clear columns right of x 936 from 3 pattern periods outside
    the joint to 3 inside; their spacings against the fitted period, and the largest off it for the spacings that
    cross the joint or the feather's inner edge; their darkness on each side."""
    if grid['fv'] is not None:
        rb = (y_join - 36, y_join - 24) if side == 'top' else (y_join + 24, y_join + 36)
        rp = (y_join + 40, y_join + 52) if side == 'top' else (y_join - 52, y_join - 40)
        pb, pp = np.median(Lm[rb[0]:rb[1]], axis=0), np.median(Lm[rp[0]:rp[1]], axis=0)
        offs, ratio, skipped = [], [], 0
        gl = lum(GV)
        for (c, dep, i0, i1), ok in zip(grid['lv'], grid['fv']['keep']):
            if not ok or c < 8 or c > W - 9:
                continue
            ci = int(round(c))
            xs = np.arange(ci - 7, ci + 8)
            side_ = np.r_[0:4, 11:15]
            expect = 1 - gl[xs].min()
            db_, dp_ = np.median(pb[xs][side_]) - pb[xs], np.median(pp[xs][side_]) - pp[xs]
            if dp_.max() > 2.5 * expect * np.median(pp[xs][side_]) + 3 or db_.max() > 2.5 * expect * np.median(pb[xs][side_]) + 3:
                skipped += 1
                continue
            wb, wp = np.clip(db_[4:11], 0, None), np.clip(dp_[4:11], 0, None)
            if wp.sum() < 1:
                continue
            offs.append(float((xs[4:11] * wb).sum() / max(wb.sum(), 1e-9) - (xs[4:11] * wp).sum() / wp.sum()))
            ratio.append(float(db_.max() / max(dp_.max(), 1e-9)))
        if offs:
            offs, ratio = np.array(offs), np.array(ratio)
            print(f'  {name} vertical lines ({len(offs)}, {skipped} left out: drawing beside them): band centre minus'
                  f' picture centre median {np.median(offs):+.3f} px, largest {offs[np.argmax(np.abs(offs))]:+.3f} px;'
                  f' band darkness / picture darkness median {np.median(ratio):.2f}, range {ratio.min():.2f}..{ratio.max():.2f}')
    if grid['fh'] is not None:
        P = grid['fh']['P']
        span = int(3 * grid['fh']['n'] * P + 8)
        r0, r1 = y_join - span, y_join + span
        prof = np.median(Lm[r0:r1, STRIP_X0:W - 2], axis=1)
        ds = dips(prof)
        cs = np.array([r0 + c for c, _ in ds])
        dev = [((b - a) - P * round((b - a) / P), a, b) for a, b in zip(cs[:-1], cs[1:])]
        inner = y_join + FEATHER if side == 'top' else y_join - FEATHER
        devc = [d for d, a, b in dev if a < y_join <= b or a < inner <= b]
        worst = max(dev, key=lambda t: abs(t[0])) if dev else (float('nan'), 0, 0)
        depb = [dp for c, dp in ds if (r0 + c < y_join) == (side == 'top')]
        depp = [dp for c, dp in ds if (r0 + c < y_join) != (side == 'top')]
        print(f'  {name} horizontal lines: {len(cs)} in rows {r0}-{r1} (period {P:.3f}); spacing off the period by up to'
              f' {worst[0]:+.3f} px (rows {worst[1]:.1f}-{worst[2]:.1f}), across the joint and the feather up to'
              f' {max(np.abs(devc)) if devc else float("nan"):.3f} px; darkness band {np.median(depb) if depb else float("nan"):.3f}'
              f' / picture {np.median(depp) if depp else float("nan"):.3f}')


def joints_crop(img, path):
    """3x crops (nearest neighbour) of both joints, 360 px wide x 120 px tall each, at the left, middle and right."""
    tiles = []
    for yj in (PIC_Y, PIC_Y + PIC_H):
        row = [img.crop((x0, yj - 60, x0 + 360, yj + 60)).resize((1080, 360), Image.NEAREST) for x0 in (0, 360, 720)]
        strip = Image.new('RGB', (3240, 360))
        for k, t in enumerate(row):
            strip.paste(t, (k * 1080, 0))
        tiles.append(strip)
    out = Image.new('RGB', (3240, 740), (255, 255, 255))
    out.paste(tiles[0], (0, 0))
    out.paste(tiles[1], (0, 380))
    out.save(path)


if SAMPLE is not None:
    out = np.empty((H, W, 3), np.uint8)
    for t in SAMPLE:
        f = min(max(int(round(t * FPS)), 0), NFR - 1)
        pic_u8 = frame_at(f)
        layers, pic, fa, resid = compose(pic_u8, f, out)
        if len(SAMPLE) == 1 and OUT.lower().endswith('.png'):
            path = OUT
        else:
            stem = OUT[:-4] if OUT.lower().endswith(('.png', '.mp4')) else OUT
            path = f'{stem}-t{t:07.3f}.png'
        im = Image.fromarray(out)
        im.save(path)
        im.resize((360, 640), Image.LANCZOS).save(path[:-4] + '-phone.png')
        joints_crop(im, path[:-4] + '-joints.png')
        sc = next((s['name'] for s in tl['scenes'] if s['f0'] <= f < s['f1']), '?')
        print(f'== t {t:.3f} -> frame {f} ({f / FPS:.3f} s), scene {sc}: {path}')
        top, bot = edges(pic)
        print(f'  text: {", ".join(f"{L.name} at {a:.2f}" for L, a in layers) or "none"};'
              f' picture edges off their median by up to {np.abs(top - top_ref).max():.1f} / {np.abs(bot - bot_ref).max():.1f}'
              f' levels: fade towards flat paper {fa:.2f}, residual {resid:.1f} levels (band follows up to {EDGE_CLIP:.0f});'
              f' grid off the reference by {grid_shift(pic):.2f} px')
        T = f / FPS
        for c in caps:
            if c['a'] <= T <= c['b']:
                print(f'    zh: {c["zh"]}\n    en: {c.get("en", "")}')
                break
        Lm = lum(out.astype(np.float32))
        paper_report(Lm, 'top joint', (PIC_Y - 14, PIC_Y - 4), (PIC_Y + FEATHER + 2, PIC_Y + FEATHER + 12))
        grid_report(Lm, 'top joint', PIC_Y, 'top')
        paper_report(Lm, 'bottom joint', (PIC_Y + PIC_H + 4, PIC_Y + PIC_H + 14),
                     (PIC_Y + PIC_H - FEATHER - 12, PIC_Y + PIC_H - FEATHER - 2))
        grid_report(Lm, 'bottom joint', PIC_Y + PIC_H, 'bottom')
        for L, a in [(Lb, 1.0) for Lb in band_layers] + layers:
            m = L.A[..., 0] > 0.5
            paper = PAPER[L.y0:L.y1, L.x0:L.x1][m]
            ink = (L.C[m] / L.A[m]).mean(axis=0)
            cr = contrast(ink, paper)
            core = L.A[..., 0] > 0.85
            seen = out[L.y0:L.y1, L.x0:L.x1][core].astype(np.float64)
            cr_seen = (contrast(np.median(seen, axis=0), np.median(paper, axis=0)) if len(seen) and a > 0.99
                       else float('nan'))
            print(f'  contrast {L.name}: ink {tuple(int(v) for v in ink)} on paper {np.round(np.median(paper, axis=0)).astype(int).tolist()}'
                  f' (darkest {np.round(paper[lum(paper).argmin()]).astype(int).tolist()}): WCAG {cr.min():.1f}:1 at the darkest paper,'
                  f' {np.median(cr):.1f}:1 median; ink cores as rendered {cr_seen:.1f}:1 ({core.sum()} px)')
        bad, note = [], []
        band = np.ones((H, W), bool)
        band[PIC_Y:PIC_Y + PIC_H] = False
        dark = (Lm < 110) & band
        for what, sl in (('above y 150', np.s_[:SAFE_TOP, :]), (f'right of x {SAFE_RIGHT}', np.s_[:, SAFE_RIGHT:]),
                         (f'below y {SAFE_BOTTOM}', np.s_[SAFE_BOTTOM:, :])):
            nd = int(dark[sl].sum())
            if nd:
                bad.append(f'{nd} dark pixels in the band {what}')
        rp = Lm[PIC_Y:PIC_Y + PIC_H, SAFE_RIGHT:]
        if (rp < 110).any():
            note.append(f'{int((rp < 110).sum())} dark pixels in the picture right of x = {SAFE_RIGHT} (x > 1653 of the 16:9 frame)')
        lo = Lm[SAFE_BOTTOM:]
        print(f'  zone check: {"ok" if not bad else bad}; band below y {SAFE_BOTTOM}: darkest {lo.min():.0f},'
              f' median {np.median(lo):.0f}' + (f'; note: {note}' if note else ''))
    sys.exit(0)

# ---------------------------------------------------------------- the video
pr = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', AUDIO],
                    capture_output=True, text=True)
if pr.returncode:
    raise SystemExit(f'cannot read {AUDIO}: {pr.stderr.strip()}')
adur = float(pr.stdout.strip())
if adur < DUR - 1e-3:
    print(f'warning: audio is {adur:.3f} s, the film {DUR:.3f} s: padded with silence')
dec = decode([], DEC_VF, 'decode.log')
enc_log = os.path.join(WORK, 'encode.log')
enc = subprocess.Popen(
    ['ffmpeg', '-nostdin', '-v', 'error', '-y',
     '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', 'pipe:0', '-i', AUDIO,
     '-map', '0:v', '-map', '1:a',
     '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+full_chroma_inp,'
            'format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv',
     '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-maxrate', '12M', '-bufsize', '24M',
     '-profile:v', 'high', '-level:v', '4.1', '-r', str(FPS),
     '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
     '-af', 'apad', '-c:a', 'aac', '-b:a', '256k', '-ac', '2', '-t', f'{DUR:.6f}', '-movflags', '+faststart', OUT],
    stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=(enc_fh := open(enc_log, 'w')))
buf = bytearray(FRAME_BYTES)
out = np.empty((H, W, 3), np.uint8)
t0, t_comp, failed = time.perf_counter(), 0.0, None
try:
    for f in range(NFR):
        if not read_frame(dec, buf):
            failed = f'the picture ended at frame {f}; the timeline has {NFR} frames'
            break
        pic_u8 = np.frombuffer(buf, np.uint8).reshape(PIC_H, W, 3)
        tc = time.perf_counter()
        _, pic, _, _ = compose(pic_u8, f, out)
        if f % 15 == 0:
            sh = grid_shift(pic)
            stats['grid_worst'] = max(stats['grid_worst'], sh)
            if sh > 0.5:
                stats['grid_moved'] += 1
        t_comp += time.perf_counter() - tc
        enc.stdin.write(out)
        if f % 300 == 0 or f == NFR - 1:
            el = time.perf_counter() - t0
            print(f'frame {f + 1}/{NFR}  {(f + 1) / max(el, 1e-6):.1f} fps', flush=True)
except BrokenPipeError:
    failed = 'the encoder stopped'
finish(dec)
try:
    enc.stdin.close()
except BrokenPipeError:
    pass
rc = enc.wait()
enc_fh.close()
total = time.perf_counter() - t_start
if rc or failed:
    print(open(enc_log, encoding='utf-8', errors='replace').read()[-2000:])
    raise SystemExit(f'{failed or "encoder failed"} (encoder exit {rc}); {OUT} is not complete')
print(f'done: {OUT}  {NFR} frames, {total:.1f} s in all ({time.perf_counter() - t0:.1f} s encoding,'
      f' {t_comp:.1f} s composing); page faded with the picture on {stats["faded"]} frames (by up to'
      f' {stats["fade_max"]:.2f}); residual edge shift'
      f' up to {stats["max_delta"]:.1f} levels, clipped at {EDGE_CLIP:.0f} on {stats["clipped"]} frames; grid at the'
      f' edges off the reference by up to {stats["grid_worst"]:.2f} px (more than 0.5 px on {stats["grid_moved"]}'
      f' of {(NFR + 14) // 15} frames checked)')
if stats['grid_moved']:
    print('WARNING: the picture\'s grid moves (a camera on the grid?): the band\'s grid cannot follow it')
