"""Sample frames of grow1 in pixel style (a study for the user to choose a direction; not the film).

    ~/envs/research/bin/python tools/grow1/pixel/scenes.py [out folder]

Each direction is one moment of the film (day 3, the head at the 5th floor, the neighbour reacting), drawn on a
180 x 320 art-pixel canvas and scaled 6x (nearest neighbour) to 1080 x 1920; text is set on the page at full size.
Numbers follow pilot_short_1_v2.md: 1.7 m = 28 art px for a person (16.5 px per metre), floors 3 m = 49 px,
the grown "你" 13.6 m = 8 x the person (224 px), head top in floor 5 (12-15 m).
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from px import PAL, Canvas, you, accountant, uncle, kid, auntie, chibi  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
FONT = os.path.join(REPO, '.cache', 'fonts', 'NotoSansSC[wght].ttf')
OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(REPO, 'films', 'grow1', 'docs', 'pixel_samples')
S = 6                       # page px per art px
AW, AH = 180, 320
PPM = 28 / 1.7              # art px per metre (a 1.7 m person is 28 px before the outline)
FLOOR = round(3 * PPM)      # 49


def font(size, weight=900):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_axes([weight])
    return f


def text(d, xy, s, size, fill=(255, 255, 255), stroke=(29, 26, 36), sw=6, weight=900, anchor='la'):
    d.text(xy, s, font=font(size, weight), fill=fill, stroke_width=sw, stroke_fill=stroke, anchor=anchor)


# ---------------------------------------------------------------- scenery pieces (art px)

def sky(c, y1, bands=('m', 'M', 'L')):
    """A banded sky from the top to y1 (three flat bands, the pixel way), two clouds."""
    n = len(bands)
    for i, k in enumerate(bands):
        c.rect(0, int(y1 * i / n), c.w - 1, int(y1 * (i + 1) / n), k)
    for cx, cy, w in ((20, 30, 26), (130, 18, 22)):
        c.rect(cx, cy, cx + w, cy + 4, 'D'); c.rect(cx + 4, cy - 3, cx + w - 6, cy, 'D'); c.rect(cx + 2, cy + 4, cx + w - 2, cy + 5, 'd')


def ground(c, y):
    """Sidewalk from y, a kerb, the road below."""
    c.rect(0, y, c.w - 1, y + 9, 'N'); c.hline(0, c.w - 1, y, 'n')
    for x in range(0, c.w, 12):
        c.vline(x, y + 1, y + 9, 'n')
    c.rect(0, y + 10, c.w - 1, y + 11, 'w')
    c.rect(0, y + 12, c.w - 1, c.h - 1, 'X')
    for x in range(4, c.w, 24):
        c.rect(x, y + 20, x + 10, y + 21, 'Y')


def cutaway(c, x0, x1, gy, floors=5):
    """The building in section (a dollhouse): brick walls 2 px, slabs 3 px, cream rooms, a window in the right wall of
    floors 2..5 (sill 0.9 m, top 2.4 m), a door on 1 楼, a roof with a parapet. Returns the floors' bottom y."""
    top = gy - floors * FLOOR
    c.rect(x0, top - 6, x1, gy - 1, 'C')                      # rooms
    for f in range(floors):
        fy = gy - f * FLOOR                                   # floor f+1 bottom
        c.rect(x0, fy - 5, x1, fy - 1, 'c')                   # skirting / lower wall band
        c.hline(x0, x1, fy - 1, 'c')
        if f:                                                 # slab under floor f+1
            c.rect(x0 - 2, fy - 1, x1 + 2, fy + 2, 'N'); c.hline(x0 - 2, x1 + 2, fy + 2, 'n')
        # a ceiling lamp
        c.rect((x0 + x1) // 2 - 1, fy - FLOOR + 3, (x0 + x1) // 2 + 1, fy - FLOOR + 4, 'Y')
    # roof
    c.rect(x0 - 3, top - 6, x1 + 3, top - 1, 'N'); c.hline(x0 - 3, x1 + 3, top - 6, 'n'); c.rect(x0 - 3, top - 9, x0 - 1, top - 6, 'N'); c.rect(x1 + 1, top - 9, x1 + 3, top - 6, 'N')
    # walls (brick, with mortar lines)
    for wx in (x0 - 2, x1 + 1):
        c.rect(wx, top - 1, wx + 1, gy - 1, 'E')
        for y in range(top, gy, 4):
            c.px(wx, y, 'e'); c.px(wx + 1, y + 2, 'e')
    # windows in the right wall, door on 1 楼
    for f in range(1, floors):
        fy = gy - f * FLOOR
        sill, wtop = fy - round(0.9 * PPM), fy - round(2.4 * PPM)
        c.rect(x1 + 1, wtop, x1 + 2, sill, 'L'); c.vline(x1 + 2, wtop, sill, 'l')
        c.rect(x1 - 1, sill, x1 + 4, sill + 1, 'T')           # sill board, sticking out
    c.rect(x1 + 1, gy - round(2.1 * PPM), x1 + 2, gy - 1, 'T'); c.px(x1 + 1, gy - 18, 'Y')
    return [gy - f * FLOOR for f in range(floors)]


def table(c, x, fy, w=12, h=None, k='T'):
    h = h or round(0.75 * PPM)
    c.rect(x, fy - h, x + w, fy - h + 1, k); c.vline(x + 1, fy - h + 2, fy - 1, 't'); c.vline(x + w - 1, fy - h + 2, fy - 1, 't')


def pot(c, x, y):
    """A flower pot standing on y (bottom), x its left."""
    c.rect(x, y - 4, x + 4, y - 1, 'o'); c.rect(x - 1, y - 5, x + 5, y - 5, 'O')
    c.px(x + 2, y - 6, 'G'); c.px(x + 1, y - 7, 'G'); c.px(x + 3, y - 8, 'G'); c.px(x + 2, y - 8, 'g'); c.px(x + 4, y - 7, 'G')


def bubble(c, x, y, kind):
    """A pixel speech bubble (13 x 9) with its tail at (x, y): '?', '!', '...'."""
    bx, by = x - 4, y - 11
    c.rect(bx, by, bx + 12, by + 8, 'W'); c.rect(bx + 1, by - 1, bx + 11, by - 1, 'K'); c.rect(bx + 1, by + 9, bx + 11, by + 9, 'K')
    c.vline(bx - 1, by, by + 8, 'K'); c.vline(bx + 13, by, by + 8, 'K')
    c.px(bx + 3, by + 10, 'W'); c.px(bx + 2, by + 10, 'K'); c.px(bx + 4, by + 10, 'K'); c.px(bx + 3, by + 11, 'K')
    if kind == '?':
        for dx, dy in ((5, 2), (6, 1), (7, 1), (8, 2), (8, 3), (7, 4), (6, 5), (6, 7)):
            c.px(bx + dx, by + dy, 'K')
    elif kind == '!':
        c.vline(bx + 6, by + 1, by + 5, 'K'); c.px(bx + 6, by + 7, 'K'); c.vline(bx + 7, by + 1, by + 5, 'K'); c.px(bx + 7, by + 7, 'K')
    else:
        for dx in (3, 6, 9):
            c.px(bx + dx, by + 5, 'K')


def giant(face='neutral', seams=8):
    """The grown "你" on day 3: the person at 8 times the size (13.6 m), with the whorl on the crown and the shirt sewn
    from seams x seams shirts (64 件拼 1 件 on day 3)."""
    g = you(face=face, k=8)
    # seams over the shirt: the shirt is the 'W'/'w' area of the torso; lines in 'w' every 1/seams of it
    import numpy as np
    ys, xs = np.where((g.g == 'W') | (g.g == 'w'))
    if len(xs):
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        for i in range(1, seams):
            x = x0 + round((x1 - x0) * i / seams)
            y = y0 + round((y1 - y0) * i / seams)
            for yy in range(y0, y1 + 1):
                if g.g[yy, x] in ('W', 'w'):
                    g.g[yy, x] = 'c'
            for xx in range(x0, x1 + 1):
                if g.g[y, xx] in ('W', 'w'):
                    g.g[y, xx] = 'c'
    # the whorl: a small spiral in hair-light on the crown
    hy = np.where(g.g == 'H')[0].min()
    hx = int(np.mean(np.where(g.g[hy + 2] == 'H')[0]))
    for dx, dy in ((0, 0), (1, 0), (2, 1), (2, 2), (1, 3), (0, 3), (-1, 3), (-2, 2), (-2, 1), (-2, 0), (-1, -1), (0, -1), (1, -1), (2, -1), (3, 0)):
        g.px(hx + dx, hy + 5 + dy, 'A')
    return g


# ---------------------------------------------------------------- the narrator's panel (all directions)

def bust(face='deadpan'):
    """核算员 from the chest up, drawn at twice the size (same 1-px outline): the portrait in the panel."""
    a = chibi('bob', 'H', 'V', 'H', glasses=True, face=face, k=2)
    out = Canvas(a.w, 36)
    out.g = a.g[:36].copy()
    return out


def panel(c, d_im, status, zh, en, y0=222, y1=258):
    """The bottom panel, a game's dialogue box: 核算员's portrait at the left, a status row, the caption (Chinese, then
    English). Art px y0..y1 (page 1332..1548, inside Douyin's safe area); drawn on the art canvas c (frame, portrait)
    and on the page (text). Returns nothing; the page text is drawn by panel_text()."""
    c.rect(5, y0, 154, y1, 'W'); c.hline(5, 154, y0, 'K'); c.hline(5, 154, y1, 'K'); c.vline(4, y0 + 1, y1 - 1, 'K'); c.vline(155, y0 + 1, y1 - 1, 'K')
    c.rect(6, y0 + 1, 37, y1 - 1, 'v')
    b = bust()
    c.blit(b, 8, y1 - b.h)
    # the name tag over the panel's top left
    c.rect(8, y0 - 7, 36, y0 - 1, 'V'); c.hline(8, 36, y0 - 7, 'K'); c.vline(7, y0 - 6, y0 - 1, 'K'); c.vline(37, y0 - 6, y0 - 1, 'K')


def panel_text(d, status, zh, en, y0=222):
    text(d, (8 * S + 20, (y0 - 7) * S + 4), '核算员', 34, sw=0)
    text(d, (41 * S, y0 * S + 18), status, 36, fill=(200, 67, 47), sw=0, weight=800)
    text(d, (41 * S, y0 * S + 72), zh, 54, fill=(29, 26, 36), sw=0)
    text(d, (41 * S, y0 * S + 150), en, 28, fill=(95, 92, 85), sw=0, weight=500)


# ---------------------------------------------------------------- direction A: the building in section

def direction_a():
    c = Canvas(AW, AH)
    gy = 280
    sky(c, gy)
    ground(c, gy)
    floors = cutaway(c, 6, 74, gy)
    f1, f2, f3, f4, f5 = floors
    # 1 楼: today's 1.7 m "你" by the door
    c.blit(you(), 54, f1 - you().h)
    # 2 楼: uncle and his noodles (his 「？」 was day 1)
    table(c, 12, f2); u = uncle('neutral'); c.blit(u, 30, f2 - u.h)
    # 3 楼: the kid at a desk (his 「！」 was day 2)
    table(c, 14, f3, 14, round(0.7 * PPM)); kd = kid('neutral'); c.blit(kd, 34, f3 - kd.h)
    # 4 楼: a sofa and a sleeping cat (nobody home)
    c.rect(12, f4 - 8, 34, f4 - 3, 'B'); c.rect(12, f4 - 11, 15, f4 - 3, 'b'); c.rect(31, f4 - 11, 34, f4 - 3, 'b')
    c.rect(22, f4 - 11, 27, f4 - 9, 'O'); c.px(27, f4 - 12, 'O'); c.px(22, f4 - 12, 'O')
    # 5 楼: auntie at the window with the watering can, a pot on the sill, 「……」
    pot(c, 70, f5 - round(0.9 * PPM)); a = auntie('surprised'); c.blit(a, 44, f5 - a.h); bubble(c, 52, f5 - a.h - 1, '...')
    # the grown "你" outside, head top at 13.6 m (in floor 5)
    g = giant()
    c.blit(g, 79, gy - g.h + 1)
    panel(c, None, None, None, None)
    return c, floors


def page_a():
    c, floors = direction_a()
    im = c.image(S).convert('RGB')
    d = ImageDraw.Draw(im)
    for i, fy in enumerate(floors):
        y = (fy - FLOOR) * S + 30
        if 150 < y < 1300:
            text(d, (6 * S + 12, y), f'{i + 1}楼', 40, sw=5)
    panel_text(d, '第 3 天 · 身高 13.6 米 · 头顶：5 楼', '头顶到了 5 楼', 'Your head reaches the fifth floor.')
    return im


# ---------------------------------------------------------------- direction B: inside the 5th floor, facing the window

def ui_canvas():
    """The UI layer at the page's art scale (6x), drawn over a scene of any zoom."""
    return Canvas(AW, AH)


def compose(scene, zoom, ui):
    """The scene canvas scaled by `zoom` page px per art px, the UI canvas (6x) over it."""
    im = scene.image(zoom).convert('RGBA')
    im.alpha_composite(ui.image(S))
    return im.convert('RGB')


def direction_b():
    z = 12                                      # the camera twice as close: an art pixel is 12 page px
    c = Canvas(1080 // z, 1920 // z)            # 90 x 160
    floor = 112
    ppm = PPM
    sill, wtop = floor - round(0.9 * ppm), floor - round(2.4 * ppm)
    c.rect(0, 0, c.w - 1, c.h - 1, 'C')                          # the room's wall
    c.rect(0, floor, c.w - 1, c.h - 1, 'T'); c.hline(0, c.w - 1, floor, 't')   # wooden floor
    for x in range(0, c.w, 9):
        c.vline(x, floor + 1, c.h - 1, 't')
    c.rect(0, floor - 4, c.w - 1, floor - 1, 'c')               # skirting
    # the window: frame, sky, the scalp outside filling its bottom, the sill and the pot
    wx0, wx1 = 34, 86
    c.rect(wx0, wtop - 30, wx1, sill, 'M'); c.rect(wx0, wtop - 30, wx1, wtop - 14, 'm')
    # outside: the top of the grown head (chibi hair, 0.7 m above the sill), a few hairs, the whorl
    head_top = sill - round(0.7 * ppm)
    c.rect(wx0, head_top + 3, wx1, sill, 'H')
    c.rect(wx0 + 4, head_top + 1, wx1 - 4, head_top + 2, 'H'); c.rect(wx0 + 10, head_top, wx1 - 10, head_top, 'H')
    for hx in (wx0 + 14, wx0 + 30, wx0 + 41):
        c.px(hx, head_top - 1, 'H'); c.px(hx + 1, head_top - 2, 'H')
    cx = (wx0 + wx1) // 2
    for dx, dy in ((0, 0), (1, 0), (2, 1), (2, 2), (1, 3), (0, 3), (-1, 3), (-2, 2), (-2, 1), (-2, 0), (-1, -1), (0, -1), (1, -1), (2, -1), (3, 0)):
        c.px(cx + dx, head_top + 5 + dy, 'A')
    c.rect(cx + 10, head_top + 3, cx + 13, head_top + 4, 'h')       # a hair highlight
    # frame and mullion
    c.rect(wx0 - 2, wtop - 32, wx0 - 1, sill, 'T'); c.rect(wx1 + 1, wtop - 32, wx1 + 2, sill, 'T')
    c.rect(wx0 - 2, wtop - 33, wx1 + 2, wtop - 32, 'T'); c.vline((wx0 + wx1) // 2, wtop - 31, head_top - 1, 't')
    c.rect(wx0 - 4, sill + 1, wx1 + 4, sill + 3, 'T'); c.hline(wx0 - 4, wx1 + 4, sill + 3, 't')
    pot(c, wx0 + 2, sill + 1)
    # the neighbour with the can, looking at the window; 「……」
    a = auntie('surprised')
    c.blit(a, 8, floor - a.h)
    bubble(c, 16, floor - a.h - 1, '...')
    ui = ui_canvas()
    panel(ui, None, None, None, None)
    return c, ui, (wx0 * z, (wtop - 30) * z, wx1 * z, sill * z)


def page_b():
    c, ui, win = direction_b()
    im = compose(c, 12, ui)
    d = ImageDraw.Draw(im)
    text(d, (40, 190), '5楼', 56, sw=6)
    # the red stamp 「已道歉」 on the glass, turned
    st = Image.new('RGBA', (460, 200), (0, 0, 0, 0))
    sd = ImageDraw.Draw(st)
    sd.rounded_rectangle((8, 8, 452, 192), 14, outline=(200, 67, 47), width=14)
    sd.text((230, 104), '已道歉', font=font(112), fill=(200, 67, 47), anchor='mm')
    st = st.rotate(8, resample=Image.BICUBIC, expand=True)
    im.paste(st, (win[0] + 130, win[1] + 90), st)
    panel_text(d, '第 3 天 · 体重 ×512 · 每平方厘米 ×8', '我替你道过歉了', 'I have apologised to them for you.')
    return im


# ---------------------------------------------------------------- direction C: the building's front, from the street

def facade(c, x0, x1, gy, floors=5):
    """The front of the building: brick, two windows a floor (lit), a door, a roof line. Returns window boxes per
    floor [(left box, right box)] in art px."""
    top = gy - floors * FLOOR
    c.rect(x0, top, x1, gy - 1, 'E')
    for y in range(top, gy, 3):
        c.hline(x0, x1, y, 'e')
        for x in range(x0 + (0 if (y // 3) % 2 else 3), x1, 6):
            c.px(x, y + 1, 'e'); c.px(x, y + 2, 'e')
    c.rect(x0 - 2, top - 4, x1 + 2, top - 1, 'N'); c.hline(x0 - 2, x1 + 2, top - 4, 'n')
    boxes = []
    for f in range(floors):
        fy = gy - f * FLOOR
        sill, wtop = fy - round(0.9 * PPM), fy - round(2.4 * PPM)
        row = []
        for wx in (x0 + 6, x1 - 24):
            if f == 0 and wx != x0 + 6:
                c.rect(wx, fy - round(2.1 * PPM), wx + 18, fy - 1, 'T'); c.px(wx + 15, fy - 18, 'Y')   # the door
                row.append(None)
                continue
            c.rect(wx - 1, wtop - 1, wx + 19, sill + 1, 'w')
            c.rect(wx, wtop, wx + 18, sill, 'Y'); c.rect(wx, wtop, wx + 18, wtop + 3, 'y')
            c.rect(wx - 2, sill + 1, wx + 20, sill + 2, 'N')
            row.append((wx, wtop, wx + 18, sill))
        boxes.append(row)
        if f:
            c.hline(x0, x1, fy, 'n')
    return boxes


def in_window(c, spr, box, rows=18, dx=3):
    """A neighbour leaning in a window: the sprite's top `rows` rows, standing on the sill."""
    x0, y0, x1, y1 = box
    part = Canvas(spr.w, rows)
    part.g = spr.g[:rows].copy()
    c.blit(part, x0 + dx, y1 - rows + 1)


def direction_c():
    c = Canvas(AW, AH)
    gy = 280
    sky(c, gy)
    ground(c, gy)
    # a tree and a parked car for the street
    c.rect(160, gy - 30, 162, gy - 1, 't'); c.rect(152, gy - 48, 172, gy - 28, 'G'); c.rect(156, gy - 54, 168, gy - 47, 'G'); c.rect(166, gy - 40, 172, gy - 30, 'g')
    boxes = facade(c, 4, 70, gy)
    # neighbours in their windows, all looking at the giant
    in_window(c, uncle('surprised'), boxes[1][1], 17, 2); bubble(c, boxes[1][1][0] + 10, boxes[1][1][3] - 17, '?')
    in_window(c, kid('surprised'), boxes[2][1], 17, 2); bubble(c, boxes[2][1][0] + 10, boxes[2][1][3] - 17, '!')
    in_window(c, auntie('surprised'), boxes[4][1], 17, 0); bubble(c, boxes[4][1][0] + 8, boxes[4][1][3] - 20, '...')
    in_window(c, chibi('short', 'A', 'B', 'N', face='happy'), boxes[3][0], 17, 2)   # 4 楼: someone waving at the camera
    g = giant()
    c.blit(g, 76, gy - g.h + 1)
    panel(c, None, None, None, None)
    return c, boxes


def page_c():
    c, boxes = direction_c()
    im = c.image(S).convert('RGB')
    d = ImageDraw.Draw(im)
    for i in range(5):
        fy = 280 - i * FLOOR
        y = (fy - FLOOR) * S + 22
        if 150 < y < 1300:
            text(d, (2 * S, y), f'{i + 1}楼', 36, sw=5)
    panel_text(d, '第 3 天 · 身高 13.6 米 · 头顶：5 楼', '5 楼的邻居', 'The neighbour on the fifth floor:')
    return im


def save(im, name):
    os.makedirs(OUT, exist_ok=True)
    im.save(os.path.join(OUT, name + '.png'))
    im.resize((360, 640), Image.LANCZOS).save(os.path.join(OUT, name + '-phone.png'))
    print(os.path.join(OUT, name + '.png'))


if __name__ == '__main__':
    save(page_a(), 'A_section')
    save(page_b(), 'B_window')
    save(page_c(), 'C_street')
