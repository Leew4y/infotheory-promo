"""Pixel samples, round 2 (after the phone-size review, out/grow1/review_pixel_samples.md): one layout for every shot.

    ~/envs/research/bin/python tools/grow1/pixel/scenes2.py [out folder]

Layout (1080 x 1920 page): a HUD at the top (y 150-300: 第 N 天 and fixed slots 身高 / 头顶 / 体重 / 每平方厘米; on
day 0 the 「假设」 stamp and the three premise lines), the scene in the middle standing on a ground line at y 1320 (above
the panel), the narrator's panel at the bottom (y 1332-1548: 核算员's portrait, the caption). Shots differ in zoom: 6x
(an art pixel is 6 page px) for days 0-2, 4x for day 3's whole building, 18x for the window close-up. Numbers as
pilot_short_1_v2.md: a 1.7 m person 28 art px, a floor 49 px, day N's "你" 2^N times the person.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from px import PAL, Canvas, you, accountant, uncle, kid, auntie, chibi, cat, weight_spr, trim  # noqa: E402
from scenes import (FLOOR, PPM, REPO, font, text, sky, ground, cutaway, table, pot, bubble, bust, facade,  # noqa: E402
                    in_window)

OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(REPO, 'films', 'grow1', 'docs', 'pixel_samples', 'v2')
GROUND_PAGE = 1320
INK, AMBER, PAPER, REDC = (29, 26, 36), (244, 205, 110), (245, 242, 234), (200, 67, 47)


def grown(day, face='neutral'):
    """Day N's "你": the person at 2^N times (pixel blocks double too), the shirt sewn from (2^N)^2 shirts, the whorl."""
    k = 2 ** day
    g = you(face=face, k=k)
    if day >= 1:
        n = k
        ys, xs = np.where((g.g == 'W') | (g.g == 'w'))
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        for i in range(1, n):
            x = x0 + round((x1 - x0) * i / n); y = y0 + round((y1 - y0) * i / n)
            for yy in range(y0, y1 + 1):
                if g.g[yy, x] in ('W', 'w'):
                    g.g[yy, x] = 'c'
            for xx in range(x0, x1 + 1):
                if g.g[y, xx] in ('W', 'w'):
                    g.g[y, xx] = 'c'
    if day == 3:
        hy = np.where(g.g == 'H')[0].min()
        hx = int(np.mean(np.where(g.g[hy + 2] == 'H')[0]))
        for dx, dy in ((0, 0), (1, 0), (2, 1), (2, 2), (1, 3), (0, 3), (-1, 3), (-2, 2), (-2, 1), (-2, 0), (-1, -1), (0, -1), (1, -1), (2, -1), (3, 0)):
            g.px(hx + dx, hy + 5 + dy, 'A')
    return g


# ---------------------------------------------------------------- page layers: HUD and panel

def hud(d, day, height=None, top=None, weight=None, load=None, premise=False):
    """The top HUD, y 150-300. premise: day 0's 「假设」 stamp and premise lines instead of the readouts."""
    x0, y0, x1, y1 = 30, 150, 930, 318
    d.rounded_rectangle((x0, y0, x1, y1), 22, fill=INK, outline=PAPER, width=5)
    if premise:
        d.rounded_rectangle((x0 + 22, y0 + 26, x0 + 190, y0 + 124), 10, outline=REDC, width=8)
        d.text((x0 + 106, y0 + 76), '假设', font=font(62), fill=REDC, anchor='mm')
        text(d, (x0 + 220, y0 + 20), '每天长高一倍，形状不变', 44, sw=0)
        text(d, (x0 + 220, y0 + 88), '今天 1.7 米、70 公斤；一层楼按 3 米算', 33, sw=0, fill=(207, 202, 192), weight=700)
        return
    text(d, (x0 + 26, y0 + 14), f'第 {day} 天', 66, sw=0, fill=AMBER)
    cx = x0 + 270
    for label in ([f'身高 {height}'] if height else []) + ([f'头顶 {top}'] if top else []):
        w = d.textlength(label, font=font(46))
        d.rounded_rectangle((cx, y0 + 18, cx + w + 32, y0 + 78), 12, fill=(60, 58, 68))
        text(d, (cx + 16, y0 + 22), label, 46, sw=0)
        cx += w + 46
    cx = x0 + 26
    if weight:
        text(d, (cx, y0 + 102), f'体重 {weight}', 44, sw=0, fill=PAPER)
        cx += d.textlength(f'体重 {weight}', font=font(44)) + 40
    if load is not None:
        text(d, (cx, y0 + 106), '每平方厘米', 40, sw=0, fill=(207, 202, 192), weight=700)
        cx += d.textlength('每平方厘米', font=font(40)) + 18
        for i in range(8):
            d.rectangle((cx + i * 30, y0 + 114, cx + i * 30 + 24, y0 + 146), fill=REDC if i < load else (60, 58, 68))
        text(d, (cx + 8 * 30 + 12, y0 + 100), f'×{load}', 46, sw=0, fill=REDC)


def panel(d, zh):
    """The narrator's panel, y 1332-1548: portrait, name tag, the caption (Chinese only, 60 px)."""
    x0, y0, x1, y1 = 30, 1332, 930, 1548
    d.rounded_rectangle((x0, y0, x1, y1), 18, fill=PAPER, outline=INK, width=8)
    d.rectangle((x0 + 8, y0 + 8, x0 + 196, y1 - 8), fill=PAL['v'])
    b = bust().image(6)
    d._image.paste(b, (x0 + 14, y1 - 8 - b.height), b)
    d.rounded_rectangle((x0 + 18, y0 - 44, x0 + 196, y0 + 6), 10, fill=PAL['V'], outline=INK, width=5)
    text(d, (x0 + 46, y0 - 38), '核算员', 36, sw=0)
    text(d, (x0 + 226, y0 + 74), zh, 60, fill=INK, sw=0)


def page(scene, zoom):
    im = scene.image(zoom).convert('RGB')
    return im, ImageDraw.Draw(im)


def floor_labels(d, zoom, gy_art, x_art, floors=5, hi=None):
    for i in range(floors):
        y = (gy_art - (i + 1) * FLOOR) * zoom + 14
        if 310 < y < 1250:
            col = REDC if hi == i + 1 else (255, 255, 255)
            text(d, (x_art * zoom + 10, y), f'{i + 1}楼', 52 if hi == i + 1 else 46, fill=col, sw=6)


def head_line(c, x_from, x_to, y):
    """A red dashed line at the head top's height, from the head across into the building."""
    for x in range(min(x_from, x_to), max(x_from, x_to) + 1):
        if (x // 3) % 2 == 0:
            c.px(x, y, 'R')


# ---------------------------------------------------------------- the shots

def shot_e_day0():
    """0.0 s: day 0 on the street; "你" steps out of the door; the HUD shows the premise."""
    z = 6; c = Canvas(1080 // z, 1920 // z); gy = GROUND_PAGE // z
    sky(c, gy); ground(c, gy)
    c.rect(150, gy - 30, 152, gy - 1, 't'); c.rect(142, gy - 48, 162, gy - 28, 'G'); c.rect(146, gy - 54, 158, gy - 47, 'G')
    boxes = facade(c, 4, 100, gy)
    in_window(c, cat(), boxes[3][1], 9, 4)
    in_window(c, chibi('thin', 'A', 'W', 'N', face='neutral'), boxes[1][1], 17, 2)
    y = you('neutral'); c.blit(y, 104, gy - y.h + 1)
    im, d = page(c, z)
    hud(d, 0, premise=True)
    panel(d, '你每天长高一倍')
    floor_labels(d, z, gy, 4)
    return im


def shot_d_day1():
    """15.5 s: day 1, 压在 4 倍的截面上: at 12x, the bone's cross-section (2 x 2 cells) on 核算员's desk, 8 weights
    falling, 2 a cell; 核算员 beside it with her clipboard."""
    z = 12; c = Canvas(1080 // z, 1920 // z); gy = GROUND_PAGE // z
    c.rect(0, 0, c.w - 1, gy - 1, 'C'); c.rect(0, gy - 3, c.w - 1, gy - 1, 'c')
    c.rect(0, gy, c.w - 1, c.h - 1, 'T'); c.hline(0, c.w - 1, gy, 't')
    for x in range(0, c.w, 8):
        c.vline(x, gy + 1, c.h - 1, 't')
    # the desk
    c.rect(2, gy - 22, 62, gy - 20, 'T'); c.hline(2, 62, gy - 20, 't'); c.rect(5, gy - 19, 6, gy - 1, 't'); c.rect(58, gy - 19, 59, gy - 1, 't')
    # the cross-section: 2 x 2 cells of bone (white, a grey rim, a speck), oblique; the front face of the slab
    cx0, cy0, cw, ch = 8, gy - 30, 20, 6
    for j in (1, 0):
        for i in (0, 1):
            x = cx0 + i * cw + j * 6; y = cy0 - j * ch
            c.rect(x, y, x + cw - 2, y + ch - 1, 'd'); c.rect(x + 1, y + 1, x + cw - 3, y + ch - 2, 'W'); c.px(x + cw // 2, y + ch // 2, 'w')
    c.rect(cx0, cy0 + ch, cx0 + 2 * cw - 2, cy0 + ch + 2, 'w'); c.hline(cx0, cx0 + 2 * cw - 2, cy0 + ch + 2, 'd')
    # one cell outlined red: 每平方厘米
    c.hline(cx0, cx0 + cw - 2, cy0 - 1, 'R'); c.hline(cx0, cx0 + cw - 2, cy0 + ch, 'R'); c.vline(cx0 - 1, cy0, cy0 + ch - 1, 'R'); c.vline(cx0 + cw - 1, cy0, cy0 + ch - 1, 'R')
    # 8 weights, 2 a cell: six down, two still falling
    w = weight_spr()
    spots = [(0, 1), (1, 1), (0, 0), (1, 0)]
    for n, (i, j) in enumerate(spots):
        x = cx0 + i * cw + j * 6 + cw // 2 - w.w // 2; y = cy0 - j * ch + ch // 2
        c.blit(w, x, y - w.h + 1)
        c.blit(w, x, y - 2 * w.h + 2 - (14 if n == 3 else 0))
    a = accountant('deadpan', 'clip'); c.blit(a, 62, gy - a.h + 1)
    im, d = page(c, z)
    hud(d, 1, '3.4 米', '2 楼', '×8', 2)
    text(d, (cx0 * z, (cy0 + ch + 5) * z), '骨头截面 ×4', 56, sw=6)
    text(d, (cx0 * z, 380), '8 倍的体重', 56, sw=6)
    panel(d, '压在 4 倍的截面上')
    return im


def shot_c_day2():
    """19.7 s: day 2 from the street: 6.8 m, the head at 3 楼, the kid at the window 「！」."""
    z = 6; c = Canvas(1080 // z, 1920 // z); gy = GROUND_PAGE // z
    sky(c, gy); ground(c, gy)
    boxes = facade(c, 4, 100, gy)
    in_window(c, uncle('neutral'), boxes[1][1], 17, 2)
    in_window(c, kid('surprised'), boxes[2][1], 17, 2); bubble(c, boxes[2][1][0] + 10, boxes[2][1][3] - 17, '!')
    in_window(c, cat(), boxes[3][1], 9, 4)
    g = grown(2); c.blit(g, 108, gy - g.h + 1)
    head_line(c, 108, 100, gy - 4 * 28)
    im, d = page(c, z)
    floor_labels(d, z, gy, 4, hi=3)
    hud(d, 2, '6.8 米', '3 楼', '×64', 4)
    panel(d, '再翻一倍')
    return im


def shot_a_day3():
    """26.0 s: day 3, the whole building at 4x: 13.6 m beside 5 floors, head line into 5 楼."""
    z = 4; c = Canvas(1080 // z, 1920 // z); gy = GROUND_PAGE // z
    sky(c, gy); ground(c, gy)
    x0, x1 = 14, 114
    floors = cutaway(c, x0, x1, gy)
    f1, f2, f3, f4, f5 = floors
    c.blit(you(), 94, f1 - you().h)
    table(c, 22, f2, 18); u = uncle('neutral'); c.blit(u, 46, f2 - u.h)
    table(c, 22, f3, 20, round(0.7 * PPM)); kd = kid('neutral'); c.blit(kd, 48, f3 - kd.h)
    c.rect(24, f4 - 8, 56, f4 - 3, 'B'); c.rect(24, f4 - 11, 27, f4 - 3, 'b'); c.rect(53, f4 - 11, 56, f4 - 3, 'b')
    ct = cat(); c.blit(ct, 36, f4 - 8 - ct.h + 2)
    # 5 楼 lit (the head's floor), auntie watering by the window
    c.rect(x0, f5 - FLOOR + 1, x1, f5 - 6, 'Y')
    pot(c, 110, f5 - round(0.9 * PPM)); a = auntie('neutral'); c.blit(a, 86, f5 - a.h)
    g = grown(3); gx = 126
    c.blit(g, gx, gy - g.h + 1)
    head_line(c, gx + 20, x0, gy - 8 * 28)
    im, d = page(c, z)
    floor_labels(d, z, gy, x0, hi=5)
    hud(d, 3, '13.6 米', '5 楼', '×512', 8)
    panel(d, '头顶到了 5 楼')
    return im


def shot_b_close():
    """30.0 s: inside 5 楼 at 18x, facing the window: the scalp and its whorl above the sill (0.7 m), the auntie from
    behind with the can, 「……」, the red stamp 「已道歉」 on the glass."""
    z = 18; c = Canvas(1080 // z, 1920 // z + 1); gy = round(GROUND_PAGE / z)
    ceil = gy - round(3 * PPM)
    c.rect(0, 0, c.w - 1, ceil - 1, 'n'); c.hline(0, c.w - 1, ceil - 1, 'K')
    c.rect(0, ceil, c.w - 1, gy - 1, 'C'); c.rect(0, gy - 2, c.w - 1, gy - 1, 'c')
    c.rect(0, gy, c.w - 1, c.h - 1, 'T'); c.hline(0, c.w - 1, gy, 't')
    sill, wtop = gy - round(0.9 * PPM), gy - round(2.4 * PPM)
    wx0, wx1 = 22, 50
    c.rect(wx0, wtop, wx1, sill, 'M'); c.rect(wx0, wtop, wx1, wtop + 4, 'm')
    # the scalp outside: a cap of a circle (drawn rounder than the real 0.8 m radius, so it reads as a head)
    cx, top, R = (wx0 + wx1) // 2 + 2, sill - round(0.7 * PPM), 20
    for x in range(wx0, wx1 + 1):
        yy = top + round((x - cx) ** 2 / (2 * R))
        if yy <= sill:
            c.vline(x, yy, sill, 'H')
            c.px(x, yy, 'K')
    for hx, hy in ((cx - 7, top + 3), (cx + 6, top + 4), (cx - 1, top + 1)):
        c.px(hx, hy, 'h'); c.px(hx + 1, hy, 'h')
    for dx, dy in ((0, 0), (1, 0), (1, 1), (0, 2), (-1, 2), (-2, 1), (-2, 0), (-2, -1), (-1, -2), (0, -2), (1, -2), (2, -2), (3, -1), (3, 0), (3, 1)):
        c.px(cx + dx, top + 6 + dy, 'A')
    c.px(cx - 6, top - 1, 'H'); c.px(cx - 5, top - 2, 'H'); c.px(cx + 4, top - 1, 'H')
    # frame, transom, sill board, pot
    c.rect(wx0 - 1, wtop - 1, wx0 - 1, sill, 'T'); c.rect(wx1 + 1, wtop - 1, wx1 + 1, sill, 'T'); c.hline(wx0 - 1, wx1 + 1, wtop - 1, 'T')
    c.rect(wx0 - 2, sill + 1, wx1 + 2, sill + 2, 'T')
    pot(c, wx0 + 1, sill + 1)
    # the auntie from behind, facing the window, can raised; 「……」
    a = chibi('bun', 'H', 'W', 'T', face='back', prop='can')
    c.blit(a, 3, gy - a.h + 1)
    bubble(c, 12, gy - a.h - 1, '...')
    im, d = page(c, z)
    text(d, (40, 330), '5楼', 56, sw=6)
    st = Image.new('RGBA', (440, 190), (0, 0, 0, 0)); sd = ImageDraw.Draw(st)
    sd.rounded_rectangle((8, 8, 432, 182), 14, outline=REDC, width=14)
    sd.text((220, 98), '已道歉', font=font(108), fill=REDC, anchor='mm')
    st = st.rotate(8, resample=Image.BICUBIC, expand=True)
    im.paste(st, (wx0 * z + 40, wtop * z + 20), st)
    hud(d, 3, '13.6 米', '5 楼', '×512', 8)
    panel(d, '我替你道过歉了')
    return im


SHOTS = [('E_day0_open', shot_e_day0, '0.0 秒 开场（第 0 天）'), ('D_day1_bone', shot_d_day1, '15.5 秒 第 1 天 截面和砝码'),
         ('C_day2_street', shot_c_day2, '19.7 秒 第 2 天 街上'), ('A_day3_building', shot_a_day3, '26.0 秒 第 3 天 整栋楼'),
         ('B_day3_window', shot_b_close, '30.0 秒 5 楼窗口近景')]

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    phones = []
    for name, fn, label in SHOTS:
        im = fn()
        im.save(os.path.join(OUT, name + '.png'))
        ph = im.resize((360, 640), Image.LANCZOS); ph.save(os.path.join(OUT, name + '-phone.png'))
        phones.append((ph, label))
    S = Image.new('RGB', (len(phones) * 380 + 20, 700), 'white'); d = ImageDraw.Draw(S)
    for i, (ph, label) in enumerate(phones):
        S.paste(ph, (20 + i * 380, 50)); text(d, (20 + i * 380 + 180, 12), label, 24, fill=INK, sw=0, anchor='ma')
    S.save(os.path.join(OUT, 'storyboard_phone.png'))
    print(OUT)
