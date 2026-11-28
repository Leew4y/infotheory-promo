"""Pixel-art kit for the grow1 pixel samples (a study, not the film): a palette, a canvas of art pixels, Q-version
characters built from rectangles with an automatic 1-px outline, props, a five-floor building, and the scale-up to the
1080 x 1920 page (art pixel = 6 page pixels, nearest neighbour). Pure and deterministic: no randomness without a seed.
The same data (palette, character parameters) is meant to move into the TypeScript engine if a direction is chosen.
"""
import numpy as np
from PIL import Image

# ---------------------------------------------------------------- palette (art colours, RGB)
PAL = {
    'K': (29, 26, 36),      # outline ink
    'S': (243, 199, 161), 's': (217, 160, 126),   # skin, skin shade
    'H': (43, 36, 51), 'h': (75, 64, 88),          # dark hair, hair light
    'A': (196, 190, 184), 'a': (150, 144, 140),    # grey hair (uncle)
    'W': (245, 242, 234), 'w': (207, 202, 192),    # white, white shade
    'B': (61, 95, 150), 'b': (44, 70, 114),        # blue, blue dark
    'R': (200, 67, 47), 'r': (143, 42, 31),        # red (one accent), red dark
    'G': (79, 140, 92), 'g': (50, 98, 66),         # green (plants, kid's shirt)
    'Y': (244, 205, 110), 'y': (205, 160, 70),     # warm window light
    'P': (233, 163, 181), 'p': (196, 123, 144),    # pink (auntie's apron)
    'O': (232, 150, 70), 'o': (185, 105, 45),      # orange (noodles, bowl rim)
    'T': (122, 86, 60), 't': (86, 60, 42),         # wood
    'N': (150, 154, 166), 'n': (102, 106, 120),    # concrete
    'E': (184, 92, 70), 'e': (146, 68, 52),        # brick
    'L': (196, 222, 238), 'l': (150, 190, 216),    # glass, glass shade
    'C': (238, 229, 208), 'c': (210, 196, 166),    # cream wall inside
    'M': (122, 172, 214), 'm': (96, 146, 196),     # sky
    'D': (232, 238, 244), 'd': (196, 210, 224),    # cloud
    'V': (70, 78, 120), 'v': (50, 56, 92),         # 核算员's navy blazer
    'X': (60, 58, 68),                             # asphalt
    'Z': (250, 250, 250),                          # pure highlight
}


_KEYS = [None] + sorted(PAL)
_KI = {k: i for i, k in enumerate(_KEYS)}
_LUT = np.zeros((len(_KEYS), 4), np.uint8)
for _k, _i in _KI.items():
    if _k is not None:
        _LUT[_i, :3] = PAL[_k]
        _LUT[_i, 3] = 255
_IDX = np.vectorize(_KI.__getitem__, otypes=[np.uint8])


class Canvas:
    """W x H art pixels; each cell a palette key or None (empty)."""

    def __init__(self, w, h, fill=None):
        self.w, self.h = w, h
        self.g = np.full((h, w), fill, dtype=object)

    def px(self, x, y, k):
        if 0 <= x < self.w and 0 <= y < self.h and k is not None:
            self.g[y, x] = k

    def rect(self, x0, y0, x1, y1, k):
        """Fill x0..x1, y0..y1 inclusive (clipped to the canvas)."""
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(self.w - 1, x1), min(self.h - 1, y1)
        if x0 <= x1 and y0 <= y1:
            self.g[y0:y1 + 1, x0:x1 + 1] = k

    def hline(self, x0, x1, y, k):
        self.rect(x0, y, x1, y, k)

    def vline(self, x, y0, y1, k):
        self.rect(x, y0, x, y1, k)

    def blit(self, spr, x, y, flip=False):
        """Paste a sprite (Canvas) with its top-left at (x, y); empty cells are transparent."""
        g = spr.g[:, ::-1] if flip else spr.g
        x, y = int(x), int(y)
        sx0, sy0 = max(0, -x), max(0, -y)
        sx1, sy1 = min(spr.w, self.w - x), min(spr.h, self.h - y)
        if sx0 >= sx1 or sy0 >= sy1:
            return
        sub = g[sy0:sy1, sx0:sx1]
        dst = self.g[y + sy0:y + sy1, x + sx0:x + sx1]
        m = sub != None  # noqa: E711
        dst[m] = sub[m]

    def copy(self):
        out = Canvas(self.w, self.h)
        out.g = self.g.copy()
        return out

    def outline(self, k='K'):
        """Add a 1-px outline (4-neighbour) around everything filled; returns a new canvas one pixel larger each side."""
        out = Canvas(self.w + 2, self.h + 2)
        out.g[1:-1, 1:-1] = self.g
        filled = out.g != None  # noqa: E711
        edge = np.zeros_like(filled)
        edge[1:, :] |= filled[:-1, :]
        edge[:-1, :] |= filled[1:, :]
        edge[:, 1:] |= filled[:, :-1]
        edge[:, :-1] |= filled[:, 1:]
        out.g[edge & ~filled] = k
        return out

    def image(self, scale=6, bg=None):
        idx = _IDX(self.g)
        a = _LUT[idx]
        im = Image.fromarray(a, 'RGBA')
        if bg is not None:
            base = Image.new('RGBA', im.size, bg + (255,))
            base.alpha_composite(im)
            im = base
        return im.resize((self.w * scale, self.h * scale), Image.NEAREST)


# ---------------------------------------------------------------- Q-version people (about 2.6 heads)

def chibi(*args, **kw):
    """Cached: see _chibi."""
    return _chibi_cached(args, tuple(sorted(kw.items()))).copy()


_CACHE = {}


def _chibi_cached(args, kw):
    key = (args, kw)
    if key not in _CACHE:
        _CACHE[key] = _chibi(*args, **dict(kw))
    return _CACHE[key]


def _chibi(hair='short', hair_k='H', shirt='W', pants='B', glasses=False, face='neutral', prop=None, apron=False, k=1):
    """A front-facing Q-version person, 12 x 28 art px before the outline (k: a whole-number size factor for the
    giant, drawn at k times the size with the same 1-px outline). Returns an outlined, trimmed Canvas.
    face: 'neutral', 'deadpan' (flat eyes), 'surprised' (big eyes, o mouth), 'happy'.
    prop: None, 'stamp' (red stamp in the right hand), 'bowl', 'can' (watering can), 'clip' (clipboard), 'pencil'."""
    c = Canvas(22 * k, 32 * k)
    ox, oy = 5 * k, 3 * k   # room for props at the sides and a bun on top

    def R(x0, y0, x1, y1, col):  # rect in base units (inclusive), scaled by k
        c.rect(ox + x0 * k, oy + y0 * k, ox + (x1 + 1) * k - 1, oy + (y1 + 1) * k - 1, col)

    def P(x, y, col):
        R(x, y, x, y, col)
    hl = {'H': 'h', 'A': 'a'}.get(hair_k, hair_k)
    # head: skin 10 x 11 with rounded corners, a shade on the right cheek
    R(1, 3, 10, 11, 'S'); R(2, 2, 9, 2, 'S'); R(2, 12, 9, 12, 'S')
    R(10, 5, 10, 11, 's')
    # hair
    if hair == 'short':
        R(1, 1, 10, 4, hair_k); R(2, 0, 9, 0, hair_k); R(0, 3, 0, 6, hair_k); R(11, 3, 11, 6, hair_k)
        R(1, 5, 1, 6, hair_k); R(10, 5, 10, 6, hair_k); P(5, 5, hair_k); P(6, 5, hair_k)
        R(3, 1, 4, 1, hl)
    elif hair == 'bob':
        R(1, 1, 10, 4, hair_k); R(2, 0, 9, 0, hair_k); R(0, 2, 0, 11, hair_k); R(11, 2, 11, 11, hair_k)
        R(1, 5, 1, 11, hair_k); R(10, 5, 10, 11, hair_k)
        R(3, 1, 5, 1, hl); R(0, 10, 0, 11, hl)
    elif hair == 'bun':
        R(1, 1, 10, 4, hair_k); R(2, 0, 9, 0, hair_k); R(0, 3, 0, 6, hair_k); R(11, 3, 11, 6, hair_k)
        R(1, 5, 1, 5, hair_k); R(10, 5, 10, 5, hair_k)
        R(4, -3, 7, -1, hair_k); P(5, -3, hl)
        R(3, 1, 4, 1, hl)
    elif hair == 'kid':
        R(1, 1, 10, 4, hair_k); R(2, 0, 9, 0, hair_k); R(0, 3, 0, 5, hair_k); R(11, 3, 11, 5, hair_k)
        P(3, 5, hair_k); P(7, 5, hair_k); P(9, 5, hair_k); P(4, -1, hair_k); P(7, -1, hair_k)
        R(3, 1, 4, 1, hl)
    elif hair == 'thin':
        R(1, 2, 10, 3, hair_k); R(0, 3, 0, 6, hair_k); R(11, 3, 11, 6, hair_k); R(3, 1, 8, 1, hair_k)
    # face (or the back of the head)
    if face == 'back':
        R(1, 2, 10, 12, hair_k); R(2, 12, 9, 12, hair_k); R(3, 2, 5, 2, hl); R(5, 13, 6, 13, 's')
    elif face in ('deadpan', 'talk'):     # 'talk': deadpan with the mouth open (the narrator speaking)
        R(3, 7, 4, 7, 'K'); R(7, 7, 8, 7, 'K')
        if face == 'talk':
            R(5, 10, 6, 11, 'r')
        else:
            R(5, 10, 6, 10, 's')
    elif face == 'surprised':
        R(3, 6, 4, 8, 'K'); R(7, 6, 8, 8, 'K'); P(3, 6, 'Z'); P(7, 6, 'Z')
        R(5, 10, 6, 11, 'K')
    elif face == 'happy':
        P(3, 7, 'K'); P(4, 6, 'K'); P(5, 7, 'K'); P(6, 7, 'K'); P(7, 6, 'K'); P(8, 7, 'K')
        R(5, 10, 6, 10, 'r')
    else:
        R(3, 7, 3, 8, 'K'); R(8, 7, 8, 8, 'K')
        R(5, 10, 6, 10, 's')
    if face != 'back':
        P(2, 9, 's'); P(9, 9, 's')   # cheeks
    if glasses and k == 1:  # at full-body size: grey frames, the eyes (black) inside them, a grey bridge
        for gx in (2, 7):
            R(gx, 6, gx + 2, 6, 'n'); R(gx, 8, gx + 2, 8, 'n'); P(gx, 7, 'n'); P(gx + 2, 7, 'n'); P(gx + 1, 7, 'K')
        R(5, 7, 6, 7, 'n')
    elif glasses:  # two thin frames (1 art px at any size) below a row of skin, the eyes inside them
        for gx in (2, 6):
            fx0, fy0 = ox + gx * k, oy + 6 * k
            fx1, fy1 = ox + (gx + 4) * k - 1, oy + 9 * k - 1
            c.rect(fx0 + 1, fy0 + 1, fx1 - 1, fy1 - 1, 'L')
            c.hline(fx0, fx1, fy0, 'K'); c.hline(fx0, fx1, fy1, 'K'); c.vline(fx0, fy0, fy1, 'K'); c.vline(fx1, fy0, fy1, 'K')
        c.hline(ox + 5 * k + (k // 2 if k > 1 else 0), ox + 6 * k - 1 + (k // 2 if k > 1 else 0), oy + 7 * k, 'K')
        if face in ('deadpan', 'talk'):
            for ex in (3, 7):
                c.hline(ox + ex * k, ox + (ex + 2) * k - 1, oy + 7 * k + k // 2, 'K')
    # neck and body
    R(5, 13, 6, 13, 's')
    shade = {'W': 'w', 'B': 'b', 'G': 'g', 'P': 'p', 'V': 'v', 'R': 'r', 'O': 'o', 'T': 't'}.get(shirt, shirt)
    R(2, 14, 9, 21, shirt); R(9, 15, 9, 21, shade)
    if shirt == 'V':  # blazer over a white shirt and a red tie
        R(5, 14, 6, 18, 'W'); R(5, 15, 6, 17, 'R')
    if apron:
        R(3, 17, 8, 22, 'P'); R(3, 22, 8, 22, 'p')
    # arms (sleeves) and hands
    R(1, 14, 1, 19, shirt); R(10, 14, 10, 19, shade)
    P(1, 20, 'S'); P(10, 20, 'S')
    # hips, two legs with a gap, shoes
    pshade = {'B': 'b', 'H': 'h', 'N': 'n', 'T': 't'}.get(pants, pants)
    R(3, 22, 8, 22, pants)
    R(3, 23, 4, 26, pants); R(7, 23, 8, 26, pants); R(8, 23, 8, 26, pshade)
    R(2, 27, 4, 27, 'K'); R(7, 27, 9, 27, 'K')
    # props
    if prop == 'stamp':
        R(11, 17, 13, 18, 'T'); R(11, 19, 13, 20, 'R')
    elif prop == 'clip':
        R(-3, 15, 0, 20, 'T'); R(-2, 16, -1, 19, 'W')
    elif prop == 'bowl':
        R(-4, 18, 0, 19, 'W'); R(-3, 20, -1, 20, 'w'); R(-4, 17, 0, 17, 'O'); R(-2, 13, -2, 16, 'T'); R(-1, 12, -1, 15, 'T')
    elif prop == 'can':
        R(11, 18, 13, 21, 'G'); R(14, 17, 15, 17, 'G'); P(15, 16, 'G'); P(12, 17, 'g')
    elif prop == 'pencil':
        R(11, 16, 11, 20, 'Y'); P(11, 21, 'K')
    return trim(c).outline()


def trim(c):
    """Crop a canvas to its filled cells."""
    filled = np.argwhere(c.g != None)  # noqa: E711
    if not len(filled):
        return c
    (y0, x0), (y1, x1) = filled.min(0), filled.max(0)
    out = Canvas(x1 - x0 + 1, y1 - y0 + 1)
    out.g = c.g[y0:y1 + 1, x0:x1 + 1].copy()
    return out


# ---------------------------------------------------------------- the cast

def you(face='neutral', k=1):
    return chibi('short', 'H', 'W', 'B', face=face, k=k)


def accountant(face='deadpan', prop='stamp'):
    """核算员: bob hair, glasses, navy blazer, red tie, a red stamp or a clipboard; deadpan."""
    return chibi('bob', 'H', 'V', 'H', glasses=True, face=face, prop=prop)


def uncle(face='surprised'):
    """2 楼: grey thin hair, white vest, a bowl of noodles with chopsticks."""
    return chibi('thin', 'A', 'W', 'N', face=face, prop='bowl')


def kid(face='surprised'):
    """3 楼: a kid in green with a pencil."""
    return chibi('kid', 'H', 'G', 'B', face=face, prop='pencil')


def auntie(face='neutral'):
    """5 楼: hair in a bun, pink apron, a green watering can."""
    return chibi('bun', 'H', 'W', 'T', face=face, prop='can', apron=True)


def cat():
    """A ginger cat sitting, 10 x 9 (the 4 楼 neighbour)."""
    c = Canvas(10, 9)
    c.rect(1, 3, 7, 8, 'O'); c.rect(2, 0, 6, 4, 'O'); c.px(2, 0, None); c.px(6, 0, None); c.px(2, -1, 'O')
    c.px(2, 0, 'O'); c.px(6, 0, 'O'); c.px(3, 2, 'K'); c.px(5, 2, 'K'); c.px(4, 3, 'r')
    c.rect(8, 6, 9, 7, 'O'); c.px(9, 5, 'O'); c.rect(2, 5, 6, 5, 'o')
    return trim(c).outline()


def weight_spr():
    """A cast-iron weight (砝码), 9 x 8, with a ring."""
    c = Canvas(9, 8)
    c.rect(0, 4, 8, 7, 'H'); c.rect(1, 3, 7, 3, 'H'); c.rect(3, 0, 5, 0, 'n'); c.px(2, 1, 'n'); c.px(6, 1, 'n'); c.px(2, 2, 'n'); c.px(6, 2, 'n')
    c.hline(1, 7, 5, 'h')
    return trim(c).outline()
