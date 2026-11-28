"""The pixel cut of grow1 (《长高一倍》), rendered frame by frame from the storyboard (films/grow1/docs/storyboard_pixel.md).

    ~/envs/research/bin/python tools/grow1/pixel/film.py [--hook] [--shots t1,t2,...] [--out file.mp4]

Without --shots: every frame (30 fps, the locked timeline's 1199 frames) piped to ffmpeg with v2's final mix
(films/grow1/audio/master.wav: the voice and the effects, whose times this picture follows) into out/grow1_pixel.mp4
(out/grow1_pixel_hook.mp4 with --hook). With --shots: PNG frames into out/grow1/pixel_shots/.
Layout and numbers as tools/grow1/pixel/scenes2.py: a top readout bar (y 150-318), the scene standing on y 1320, the
narrator's panel (y 1332-1548). frame(t) is a pure function of t.
"""
import json
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from px import PAL, Canvas, you, accountant, uncle, kid, auntie, chibi, cat, weight_spr  # noqa: E402
from scenes import FLOOR, PPM, REPO, font, text, sky, ground, cutaway, table, pot, bubble, bust, facade  # noqa: E402
from scenes2 import grown, floor_labels, head_line, INK, AMBER, PAPER, REDC  # noqa: E402

FPS = 30
TL = json.load(open(os.path.join(REPO, 'films', 'grow1', 'timeline.json'), encoding='utf-8'))
NFR = TL['frames']
LOCK = json.load(open(os.path.join(REPO, 'films', 'grow1', 'narration.lock.json'), encoding='utf-8'))['lines']
NAR = json.load(open(os.path.join(REPO, 'films', 'grow1', 'narration.json'), encoding='utf-8'))['lines']
GY6 = 220          # the ground line in art px at 6x (page y 1320)
HOOK = '--hook' in sys.argv

# ---------------------------------------------------------------- the beats (film seconds)
# line starts: the locked timeline (gap 0.2 s, s1-1 pause 0.3 s), as v2
_t, START = 0.0, {}
for i, ln in enumerate(NAR):
    START[ln['id']] = round(_t, 3)
    _t += LOCK[ln['id']]['duration'] + (ln.get('pause', 0.2) if i < len(NAR) - 1 else 0)


def sp(i, k, end=False):
    """Speech span k of line i: its start (or end), film seconds."""
    return START[i] + LOCK[i]['spans'][k][1 if end else 0]


fr = lambda t: round(t * 30) / 30  # noqa: E731
ST = [fr(sp('s1-1', 1, True) + 0.12), fr(sp('s1-4', 3, True) + 0.03), fr(sp('s1-7', 0, True) + 0.03)]   # day stamps
B = dict(
    q=sp('s1-1', 1), h34=START['g1'] + 0.66, top2=START['g1'] + 1.62, pop2=5.4,
    x8=sp('s1-2', 0), kg=sp('s1-2', 1), L=sp('s1-2', 2), Wd=sp('s1-2', 3), D=sp('s1-2', 4), all=sp('s1-2', 5),
    sec=sp('s1-3', 0), wd2=sp('s1-3', 1), x4=sp('s1-3', 2),
    wts=sp('s1-4', 0), fall=sp('s1-4', 1), cm=sp('s1-4', 2), r2=sp('s1-4', 2, True) + 0.03, carry2=sp('s1-4', 3),
    again2=START['s1-5'], kid=ST[1] + 0.6, again3=START['s1-7'],
    x512=sp('s1-8b', 0), t3584=sp('s1-8b', 1), cm3=sp('s1-8b', 2), x8s=sp('s1-8b', 3),
    top5=sp('g5b', 0), close=sp('g5b', 0, True) - 0.12, pop5=821 / FPS, nb5=sp('g5b', 1), sorry=sp('g5b', 2),
    apol=fr(sp('g5b', 2, True) + 0.03), col=START['s1-10'] + 0.58,
    two=sp('s1-10', 0), you=sp('s1-10', 1), one=sp('s1-10', 2), eight=sp('s1-10', 3), seven=sp('s1-10', 4),
    q9=sp('g9', 0), bone=sp('g9', 1), cant=sp('g9', 2), card=sp('g9', 3), tail=START['g9'] + LOCK['g9']['duration'],
)
X8CUT = 5.87            # the cut from the section to the 8 little "你" (the uncle's 「？」 up from 5.40)
PUSH0, PUSH1 = B['close'] - 0.06, B['close'] + 0.39   # the push-in to the 5th-floor window
HOOK_END, REW0 = 1.7, 1.0                            # hook cut: day 3 to 1.0 s, the rewind 1.0-1.7 s
SPEECH = [(START[i] + a, START[i] + b) for i in START for a, b in LOCK[i]['spans']]
# the captions, phrase by phrase from the speech spans (each shown from where it is spoken, to the next)
CAPS = [
    (0.0, '你每天长高一倍'), (sp('s1-1', 1), '我算过了'),
    (START['g1'], '第 1 天，3.4 米'), (START['g1'] + 1.45, '头顶到了 2 楼'),
    (sp('s1-2', 0), '体重 8 倍，560 公斤'), (sp('s1-2', 2), '长、宽、厚，各翻一倍'),
    (sp('s1-3', 0), '截面只算宽和厚：4 倍'),
    (sp('s1-4', 0), '8 倍的体重'), (sp('s1-4', 1), '压在 4 倍的截面上'), (sp('s1-4', 2), '每平方厘米，扛两倍'),
    (START['s1-5'], '再翻一倍'), (START['s1-7'], '再翻一倍'),
    (sp('s1-8b', 0), '512 倍，35.84 吨'), (sp('s1-8b', 2), '每平方厘米，8 倍'),
    (sp('g5b', 0), '头顶到了 5 楼'), (sp('g5b', 1), '5 楼的邻居'), (sp('g5b', 2), '我替你道过歉了'),
    (sp('s1-10', 0), '两倍，就是今天的你'), (sp('s1-10', 2), '背着另一个你'), (sp('s1-10', 3), '8 倍，背着七个'),
    (sp('g9', 0), '第几天，骨头扛不住？'), (sp('g9', 3), '正片里算'),
]
_full = ''.join(ln['text'] for ln in NAR)
_strip = lambda x: ''.join(ch for ch in x if ch not in '，、；：。？！ ')  # noqa: E731
assert _strip(''.join(c for _, c in CAPS)) == _strip(_full), 'captions do not spell the narration'


def caption(t):
    if t >= B['tail']:
        return None
    cur = None
    for a, s in CAPS:
        if t >= a:
            cur = s
    return cur


# ---------------------------------------------------------------- helpers

def ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def blank(z):
    return Canvas(1080 // z, -(-1920 // z))


def pop_scale(t, t0):
    """A stamp's growth: squash for two frames, a small overshoot, settled by 0.2 s."""
    u = t - t0
    if u < 0 or u > 0.25:
        return 1.0, 1.0
    if u < 0.067:
        return 1.12, 0.86
    if u < 0.134:
        return 0.94, 1.08
    return 1.0, 1.0


def squash(spr, sx, sy):
    """A sprite stretched by (sx, sy) (nearest neighbour), keeping its feet: returns a Canvas."""
    if sx == 1.0 and sy == 1.0:
        return spr
    w, h = max(1, round(spr.w * sx)), max(1, round(spr.h * sy))
    yi = (np.arange(h) * spr.h / h).astype(int)
    xi = (np.arange(w) * spr.w / w).astype(int)
    out = Canvas(w, h)
    out.g = spr.g[yi][:, xi]
    return out


def walk(spr, phase):
    """Two-frame walk: shift one leg's column down a pixel."""
    if phase % 2 == 0:
        return spr
    s2 = spr.copy()
    h = s2.h
    s2.g[h - 6:h - 1, :s2.w // 2] = spr.g[h - 7:h - 2, :s2.w // 2]
    return s2


# ---------------------------------------------------------------- shots (each returns canvas, zoom, page painter)

def street(t, z=6, kid_bang=None, uncle_bang=None, cat_turn=False, tree=True, lit=None):
    """The building's front from the street; neighbours in the right-hand windows (uncle 2 楼, kid 3 楼, cat 4 楼).
    lit: that floor lights up (a yellow frame round its band, white windows)."""
    c = blank(z)
    gy = 1320 // z
    sky(c, gy); ground(c, gy)
    if tree:
        c.rect(150, gy - 30, 152, gy - 1, 't'); c.rect(142, gy - 48, 162, gy - 28, 'G'); c.rect(146, gy - 54, 158, gy - 47, 'G')
    boxes = facade(c, 4, 100, gy)
    if lit:
        y0, y1 = gy - lit * FLOOR + 1, gy - (lit - 1) * FLOOR - 1
        for box in boxes[lit - 1]:
            if box:
                c.rect(box[0], box[1] + 4, box[2], box[3], 'Z')
        for k in range(2):
            c.hline(3 - k, 101 + k, y0 - k, 'Y'); c.hline(3 - k, 101 + k, y1 + k, 'Y')
            c.vline(3 - k, y0, y1, 'Y'); c.vline(101 + k, y0, y1, 'Y')
    from scenes import in_window
    ct = cat()
    in_window(c, _flip(ct) if cat_turn else ct, boxes[3][1], 9, 4)
    u_face = 'surprised' if uncle_bang is not None and t >= uncle_bang else 'neutral'
    in_window(c, uncle(u_face), boxes[1][1], 17, 2)
    if uncle_bang is not None and t >= uncle_bang:
        bubble(c, boxes[1][1][0] + 10, boxes[1][1][3] - 17, '!')
    k_face = 'surprised' if kid_bang is not None and t >= kid_bang else 'neutral'
    in_window(c, kid(k_face), boxes[2][1], 17, 2)
    if kid_bang is not None and t >= kid_bang:
        bubble(c, boxes[2][1][0] + 10, boxes[2][1][3] - 17, '!')
    return c, z, boxes, gy


def _flip(spr):
    out = spr.copy(); out.g = spr.g[:, ::-1].copy(); return out


def section6(t, gy=GY6, lit=None, uncle_face='neutral', uncle_bubble=None):
    """The building in section at 6x (days 1-2): floors 1-3 in view; the neighbours."""
    z = 6
    c = blank(z)
    sky(c, gy); ground(c, gy)
    x0, x1 = 6, 74
    floors = cutaway(c, x0, x1, gy)
    f1, f2, f3, f4, f5 = floors
    if lit:
        fy = floors[lit - 1]
        c.rect(x0, fy - FLOOR + 1, x1, fy - 6, 'Y')
    c.blit(you(), 54, f1 - you().h)
    table(c, 12, f2); u = uncle(uncle_face); c.blit(u, 30, f2 - u.h)
    if uncle_bubble:
        bubble(c, 38, f2 - u.h - 1, uncle_bubble)
    table(c, 14, f3, 14, round(0.7 * PPM)); kd = kid('neutral'); c.blit(kd, 34, f3 - kd.h)
    return c, z, floors, (x0, x1)


def building4(t, lit=None, auntie_face='neutral'):
    """Day 3's whole building at 4x."""
    z = 4
    c = blank(z)
    gy = 1320 // z
    sky(c, gy); ground(c, gy)
    x0, x1 = 14, 114
    floors = cutaway(c, x0, x1, gy)
    f1, f2, f3, f4, f5 = floors
    if lit:
        fy = floors[lit - 1]
        c.rect(x0, fy - FLOOR + 1, x1, fy - 6, 'Y')
    c.blit(you(), 94, f1 - you().h)
    table(c, 22, f2, 18); u = uncle('neutral'); c.blit(u, 46, f2 - u.h)
    table(c, 22, f3, 20, round(0.7 * PPM)); kd = kid('neutral'); c.blit(kd, 48, f3 - kd.h)
    c.rect(24, f4 - 8, 56, f4 - 3, 'B'); c.rect(24, f4 - 11, 27, f4 - 3, 'b'); c.rect(53, f4 - 11, 56, f4 - 3, 'b')
    ct = cat(); c.blit(ct, 36, f4 - 8 - ct.h + 2)
    pot(c, 110, f5 - round(0.9 * PPM)); a = auntie(auntie_face); c.blit(a, 86, f5 - a.h)
    return c, z, floors, (x0, x1), gy


def desk_room(z=12):
    c = blank(z)
    gy = 1320 // z
    c.rect(0, 0, c.w - 1, gy - 1, 'C'); c.rect(0, gy - 3, c.w - 1, gy - 1, 'c')
    c.rect(0, gy, c.w - 1, c.h - 1, 'T'); c.hline(0, c.w - 1, gy, 't')
    for x in range(0, c.w, 8):
        c.vline(x, gy + 1, c.h - 1, 't')
    return c, gy


def cube(c, x, y, s, k='W', kd='w', edge='K'):
    """An oblique unit block of side s art px, front-bottom-left at (x, y)."""
    d = s // 2
    c.rect(x, y - s + 1, x + s - 1, y, k)                     # front
    for i in range(d):                                         # top and side faces
        c.hline(x + i + 1, x + s - 1 + i + 1, y - s - i, 'D')
        c.vline(x + s + i, y - s + 1 - i, y - i, kd)
    c.hline(x, x + s - 1, y - s + 1, edge); c.hline(x, x + s - 1, y, edge); c.vline(x, y - s + 1, y, edge); c.vline(x + s - 1, y - s + 1, y, edge)


# ---------------------------------------------------------------- page layers

def hud_at(d, t):
    """The readout bar for time t."""
    x0, y0, x1, y1 = 30, 150, 930, 318
    if t >= B['tail']:
        return
    d.rounded_rectangle((x0, y0, x1, y1), 22, fill=INK, outline=PAPER, width=5)
    if t < ST[0] and not (HOOK and t < HOOK_END):
        # day 0: the 「假设」 stamp lands (0-0.3 s), the premise
        t_in = t - HOOK_END if HOOK else t
        k = 1 + 0.5 * (1 - ease(t_in / 0.25))
        cx, cy = x0 + 106, y0 + 76
        w, h = 168 * k, 98 * k
        d.rounded_rectangle((cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), 10, outline=REDC, width=8)
        d.text((cx, cy), '假设', font=font(int(62 * k)), fill=REDC, anchor='mm')
        text(d, (x0 + 220, y0 + 20), '每天长高一倍，形状不变', 44, sw=0)
        text(d, (x0 + 220, y0 + 88), '今天 1.7 米、70 公斤；一层楼按 3 米算', 33, sw=0, fill=(207, 202, 192), weight=700)
        return
    if HOOK and t < HOOK_END:
        day = 3 if t < REW0 else REWIND_DAY(t)
        state = dict(day=day, height={3: '13.6 米', 2: '6.8 米', 1: '3.4 米', 0: '1.7 米'}[day],
                     top={3: '5 楼', 2: '3 楼', 1: '2 楼', 0: None}[day])
        text(d, (x0 + 26, y0 + 102), '假设：每天长高一倍，形状不变', 40, sw=0, fill=(207, 202, 192))
    else:
        state = hud_state(t)
    day = state['day']
    dtxt = '今天' if day == 'today' else f'第 {day} 天'
    if day == '?':
        dtxt = '第 ? 天' if int(t * 4) % 2 == 0 else '第   天'
    since = min((t - s for s in ST if t >= s), default=9)
    col = AMBER if since > 0.5 else REDC
    text(d, (x0 + 26, y0 + 14), dtxt, 66, sw=0, fill=col)
    cx = x0 + 270
    for label in [state.get('height'), state.get('top')]:
        if not label:
            continue
        lab = ('身高 ' if '米' in label else '头顶 ') + label
        w = d.textlength(lab, font=font(46))
        d.rounded_rectangle((cx, y0 + 18, cx + w + 32, y0 + 78), 12, fill=(60, 58, 68))
        text(d, (cx + 16, y0 + 22), lab, 46, sw=0)
        cx += w + 46
    # row 2: the weight, then 每平方厘米 and its 8-cell bar; the weight's size shrinks until the row fits
    cx = x0 + 26
    load = state.get('load')
    pitch = 24
    fixed = (d.textlength('每平方厘米', font=font(34, 700)) + 12 + 8 * pitch + 8 + d.textlength('×8', font=font(44))) if load is not None else 0
    if state.get('weight'):
        lab = '体重 ' + state['weight']
        ws = 40
        while ws > 32 and d.textlength(lab, font=font(ws)) + 24 + fixed > x1 - 18 - cx:
            ws -= 2
        text(d, (cx, y0 + 144 - ws), lab, ws, sw=0, fill=PAPER)
        cx += d.textlength(lab, font=font(ws)) + 24
    if load is not None:
        text(d, (cx, y0 + 108), '每平方厘米', 34, sw=0, fill=(207, 202, 192), weight=700)
        cx += d.textlength('每平方厘米', font=font(34, 700)) + 12
        full = int(load); part = load - full
        on = (120, 114, 108) if state.get('load_label') == '×?' else REDC     # the last day's load, greyed
        for i in range(8):
            fill = on if i < full else (60, 58, 68)
            d.rectangle((cx + i * pitch, y0 + 114, cx + i * pitch + 18, y0 + 146), fill=fill)
            if i == full and part > 0:
                d.rectangle((cx + i * pitch, y0 + 146 - 32 * part, cx + i * pitch + 18, y0 + 146), fill=on)
        if state.get('load_label'):
            text(d, (cx + 8 * pitch + 6, y0 + 100), state['load_label'], 44, sw=0, fill=on if on != REDC else REDC)


def lerp_load(t, moves, v0=1.0):
    v = v0
    for a, b, f, to in moves:
        if t >= a:
            v = f + (to - f) * ease((t - a) / max(1e-6, b - a))
    return v


def hud_state(t):
    """What the readout bar says at t (the storyboard's 读数栏 column)."""
    if t >= B['col']:
        day = '?' if t >= B['q9'] else 'today'
        load = lerp_load(t, [(B['one'] + 0.05, B['one'] + 0.4, 1, 2), (B['eight'], 33.875, 2, 8)])
        lab = {2: '×2', 8: '×8'}.get(round(load)) if abs(load - round(load)) < 0.05 and round(load) > 1 else None
        return dict(day=day, height='1.7 米', load=load, load_label=lab)
    if t >= ST[2]:
        st = dict(day=3)
        if t >= ST[2] + 0.6:
            st['height'] = '13.6 米'
        if t >= B['top5']:
            st['top'] = '5 楼'
        if t >= B['x512']:
            st['weight'] = '×512' + (' · 35.84 吨' if t >= B['t3584'] else '')
        st['load'] = lerp_load(t, [(B['x8s'], 25.633, 4, 8)], 4)          # full at the tick (25.633)
        st['load_label'] = '×8' if t >= 25.633 else ('×?' if t < B['x8s'] else None)
        return st
    if t >= ST[1]:
        st = dict(day=2)
        if t >= ST[1] + 0.6:
            st['height'] = '6.8 米'
        if t >= B['kid']:
            st['top'] = '3 楼'
        if t >= ST[1] + 0.8:
            st['weight'] = '×64 · 4.48 吨'
        st['load'] = lerp_load(t, [(B['again2'] + 0.89, B['again3'], 2, 4)], 2)   # 20.12-20.35, after 「再翻一倍」
        st['load_label'] = '×4' if t >= B['again3'] else ('×?' if t < B['again2'] + 0.89 else None)
        return st
    st = dict(day=1)
    if t >= B['h34']:
        st['height'] = '3.4 米'
    if t >= B['top2']:
        st['top'] = '2 楼'
    if t >= B['x8']:
        st['weight'] = '×8' + (' · 560 公斤' if t >= B['kg'] else '')
    if t >= B['cm']:
        st['load'] = lerp_load(t, [(B['r2'], B['r2'] + 0.26, 1, 2)], 1)
        st['load_label'] = '×2' if t >= B['r2'] + 0.26 else None
    return st


def panel_at(im, d, t, card=False):
    """The narrator's panel: portrait (blinks, pushes her glasses, bows, holds up the stamp), name tag, caption."""
    if t >= B['tail']:
        return
    x0, y0, x1, y1 = 30, 1332, 930, 1548
    d.rounded_rectangle((x0, y0, x1, y1), 18, fill=PAPER, outline=INK, width=8)
    d.rectangle((x0 + 8, y0 + 8, x0 + 196, y1 - 8), fill=PAL['v'])
    dy = 0
    if B['q'] <= t < B['q'] + 0.2:
        dy = -6
    if B['sorry'] + 0.1 <= t < B['sorry'] + 0.8:
        dy = 18
    talking = any(a <= t < b_ for a, b_ in SPEECH) and int(t * 10) % 2 == 0
    b = bust('talk' if talking else 'deadpan').image(6)
    im.paste(b, (x0 + 14, y1 - 8 - b.height + dy), b)
    for s0 in ST + [B['apol']]:
        if s0 - 0.15 <= t < s0 + 0.35:
            d.rectangle((x0 + 150, y0 + 30, x0 + 186, y0 + 54), fill=PAL['T'])
            d.rectangle((x0 + 146, y0 + 54, x0 + 190, y0 + 78), fill=REDC)
    d.rounded_rectangle((x0 + 18, y0 - 44, x0 + 196, y0 + 6), 10, fill=PAL['V'], outline=INK, width=5)
    text(d, (x0 + 46, y0 - 38), '核算员', 36, sw=0)
    cap = caption(t)
    if card and t >= B['card']:
        d.rounded_rectangle((x0 + 214, y0 + 40, x1 - 22, y1 - 40), 10, fill=PAPER, outline=INK, width=4)
        d.rectangle((x0 + 214, y0 + 40, x0 + 226, y1 - 40), fill=REDC)
        text(d, (x0 + 246, y0 + 76), '正片：《假如你每天长高一倍》', 44, fill=INK, sw=0)
        return
    if cap:
        size = 58
        while d.textlength(cap, font=font(size)) > x1 - x0 - 250 and size > 40:
            size -= 2
        text(d, (x0 + 226, y0 + 108 - size // 2), cap, size, fill=INK, sw=0)


# ---------------------------------------------------------------- the frame

def scene_at(t):
    """(canvas, zoom, painter(d, im)) for time t."""
    if HOOK and t < REW0:
        return hook_day3(t)
    if HOOK and t < HOOK_END:
        return rewind(t)
    if t < ST[0]:
        return day0(t)
    if t < X8CUT:
        return day1_section(t)
    if t < B['kg']:
        return eight_you(t)
    if t < B['L']:
        return scale_560(t)
    if t < B['sec']:
        return cube_double(t)
    if t < B['wd2']:
        return xray(t)
    if t < B['carry2']:
        return desk_tiles(t)
    if t < ST[1]:
        return day1_section(t)
    if t < ST[2]:
        return day2_street(t)
    if t < B['t3584']:
        return day3_building(t)
    if t < B['cm3']:
        return crowd512(t)
    if t < PUSH0:
        return day3_building(t)
    if t < PUSH1:
        return push_in(t)
    if t < B['col']:
        return window_close(t)
    return today(t)


def day0(t):
    c, z, boxes, gy = street(t, z=5, cat_turn=t >= 0.8)
    # "你" steps out of the door (0.3-1.2 s) and stops under the building
    door_x = 4 + (100 - 4) - 24
    u = ease((t - 0.3) / 0.9)
    x = round(door_x + 4 + (104 - door_x - 4) * u)
    spr = walk(you('neutral'), int(t * 8)) if 0.3 <= t < 1.2 else you('neutral')
    c.blit(spr, x, gy - spr.h + 1)

    def paint(d, im):
        floor_labels(d, z, gy, 4)
    return c, z, paint


def day1_section(t):
    gy = GY6
    lit = 2 if t >= B['top2'] else None
    ub = None
    uf = 'surprised' if t >= B['top2'] + 0.1 else 'neutral'      # the uncle looks up as the head line comes in (4.4 s)
    if t >= B['pop2']:
        ub = '??' if t >= B['carry2'] else '?'
    c, z, floors, (x0, x1) = section6(t, lit=lit, uncle_face=uf, uncle_bubble=None)
    if ub:
        f2 = floors[1]; u = uncle(uf)
        bubble(c, 38, f2 - u.h - 1, '?')
        if ub == '??':
            bubble(c, 54, f2 - u.h - 5, '?')
    sx, sy = pop_scale(t, ST[0])
    g = squash(grown(1), sx, sy)
    gx = x1 + 6
    c.blit(g, gx + (grown(1).w - g.w) // 2, gy - g.h + 1)
    if t >= B['top2']:
        n = ease((t - B['top2']) / 0.3)
        head_line(c, gx + 6, round(gx + 6 - (gx + 6 - x0) * n), gy - 2 * 28)

    def paint(d, im):
        floor_labels(d, z, gy, x0, hi=2 if lit else None)
    return c, z, paint


def eight_you(t):
    """体重 8 倍: eight little "你" drop in, standing on each other's heads, into a 2 x 2 x 2 block (12x)."""
    z = 12
    c, gy = desk_room(z)
    y1 = you('neutral')
    # (column, depth row, layer); the back row first so the front row covers it
    spots = [(0, 1, 0), (1, 1, 0), (0, 0, 0), (1, 0, 0), (0, 1, 1), (1, 1, 1), (0, 0, 1), (1, 0, 1)]
    placed = []
    for n, (i, j, l) in enumerate(spots):
        t0 = X8CUT + 0.06 * n
        p = min(1, max(0, (t - t0) / 0.16))
        if p > 0:
            placed.append((j, l, i, p))
    for j, l, i, p in sorted(placed, key=lambda q: (-q[0], q[1], q[2])):
        x = 27 + i * 16 + j * 7
        foot = gy - 6 - j * 6 - l * 29
        c.blit(y1, x, round(foot - y1.h + 1 - (1 - p * p) * 50))

    def paint(d, im):
        if t >= X8CUT + 0.55:
            text(d, (540, 360), '= 8 个你', 66, sw=7, anchor='ma')
    return c, z, paint


def bathroom(z):
    """A tiled wall and floor (the scale and the X-ray shots)."""
    c = blank(z)
    gy = 1320 // z
    c.rect(0, 0, c.w - 1, gy - 1, 'L')
    for y in range(0, gy, 16):
        c.hline(0, c.w - 1, y, 'l')
    for x in range(0, c.w, 16):
        c.vline(x, 0, gy - 1, 'l')
    c.rect(0, gy, c.w - 1, c.h - 1, 'w'); c.hline(0, c.w - 1, gy, 'a')
    return c, gy


def giant_leg(c, x, y_top, foot_y, z_k=2):
    """The day-1 giant's trouser leg (2x blocks: a seam every 8 px) and shoe, the sole on foot_y."""
    c.rect(x, y_top, x + 40, foot_y - 12, 'B')
    for yy in range(y_top + 4, foot_y - 12, 16):
        c.hline(x + 1, x + 39, yy, 'b')
    c.vline(x + 20, y_top, foot_y - 12, 'b'); c.vline(x - 1, y_top, foot_y - 12, 'K'); c.vline(x + 41, y_top, foot_y - 12, 'K')
    c.rect(x - 8, foot_y - 11, x + 46, foot_y, 'K'); c.rect(x - 6, foot_y - 9, x + 30, foot_y - 7, 'h')


def scale_560(t):
    """560 公斤: the giant's shoe stamps on a bathroom scale; the scale's screen counts up to 560."""
    z = 6
    c, gy = bathroom(z)
    top = gy - 26                                     # the scale's top face
    c.rect(14, top, 166, gy - 1, 'W'); c.hline(14, 166, top, 'K'); c.vline(14, top, gy - 1, 'K'); c.vline(166, top, gy - 1, 'K')
    c.hline(14, 166, gy - 1, 'a'); c.hline(15, 165, top + 1, 'Z')
    c.rect(82, top + 4, 152, top + 22, 'K'); c.rect(84, top + 6, 150, top + 20, 'g')     # the screen
    drop = round(40 * (1 - ease((t - B['kg'] + 0.2) / 0.2)))
    giant_leg(c, 34, 0, top - 1 - drop)
    n = round(560 * ease((t - B['kg']) / 0.55))

    def paint(d, im):
        text(d, (118 * z - 8, (top + 13) * z), f'{n}', 76, fill=(214, 248, 210), sw=0, anchor='rm')
        text(d, (118 * z, (top + 13) * z), '公斤', 46, fill=(214, 248, 210), sw=0, anchor='lm')
        text(d, (540, 380), '3.4 米的你，踩上体重秤', 58, sw=7, anchor='ma')
    return c, z, paint


def cube(c, x, y, s):
    """An oblique block of side s art px, front face's bottom-left at (x, y): front W, top Z, side w, outlined."""
    d = s // 2
    c.rect(x, y - s + 1, x + s - 1, y, 'W')
    for r in range(1, d + 1):
        c.hline(x + r, x + s - 1 + r, y - s + 1 - r, 'Z')
        c.vline(x + s - 1 + r, y - s + 1 - r, y - r, 'w')
    for r in range(0, d + 1):
        c.px(x + r, y - s + 1 - r, 'K'); c.px(x + s - 1 + r, y - s + 1 - r, 'K'); c.px(x + s - 1 + r, y - r, 'K')
    c.hline(x + d, x + s - 1 + d, y - s + 1 - d, 'K'); c.vline(x + s - 1 + d, y - s + 1 - d, y - d, 'K')
    c.hline(x, x + s - 1, y - s + 1, 'K'); c.hline(x, x + s - 1, y, 'K'); c.vline(x, y - s + 1, y, 'K'); c.vline(x + s - 1, y - s + 1, y, 'K')


def cube_double(t):
    """长、宽、厚，各翻一倍: one block, then doubled up (长), right (宽), back (厚): 2 x 2 x 2 = 8 (12x).
    Each new half slides out of the old one in 0.2 s."""
    z = 12
    c, gy = desk_room(z)
    s = 20
    x0, y0 = 18, gy - 14
    gL = ease((t - B['L']) / 0.2); gW = ease((t - B['Wd']) / 0.2); gD = ease((t - B['D']) / 0.2)
    cubes = []
    for k in (1, 0):
        for j in (0, 1):
            for i in (0, 1):
                if (i and gW <= 0) or (j and gL <= 0) or (k and gD <= 0):
                    continue
                cubes.append((k, j, i))
    for k, j, i in sorted(cubes, key=lambda q: (-q[0], q[1], q[2])):
        ox = i * s * gW + k * (s // 2) * gD
        oy = -j * s * gL - k * (s // 2) * gD
        cube(c, round(x0 + ox), round(y0 + oy), s)

    def paint(d, im):
        if t >= B['L']:
            text(d, ((x0 - 3) * z, (y0 - s) * z), '长', 64, sw=7, anchor='rm')
        if t >= B['Wd']:
            text(d, ((x0 + s) * z, (y0 + 2) * z), '宽', 64, sw=7, anchor='ma')
        if t >= B['D']:
            text(d, ((x0 + 2 * s + s // 2 + 2) * z, (y0 - s // 4 - 2) * z), '厚', 64, sw=7, anchor='lm')
        if t >= B['all']:
            text(d, (540, 336), '2×2×2 = 8', 84, sw=8, anchor='ma')
    return c, z, paint


def xray(t):
    """截面只算: a magnifier on the giant's leg shows the bone's cross-section."""
    z = 6
    c, gy = bathroom(z)
    giant_leg(c, 70, 0, gy - 1)
    # the magnifier: a circle with the cross-section (white bone ring, marrow) inside
    cx, cy, r = 90, 110, 30
    yy, xx = np.ogrid[:c.h, :c.w]
    disk = (xx - cx) ** 2 + (yy - cy) ** 2
    m = disk <= r * r
    c.g[m] = 'L'
    c.g[(disk <= (r - 1) ** 2) & (disk >= (r - 3) ** 2)] = 'K'
    c.g[disk <= 14 ** 2] = 'W'
    c.g[(disk <= 13 ** 2) & (disk >= 11 ** 2)] = 'w'
    c.g[disk <= 5 ** 2] = 'O'
    c.rect(cx + 20, cy + 20, cx + 26, cy + 40, 'T')

    def paint(d, im):
        text(d, (540, (cy + r + 4) * 6), '骨头的截面', 60, sw=7, anchor='ma')
    return c, 6, paint


def bone_tile(c, x0, y0, x1, y1):
    """One cell of bone cross-section seen from above (an ellipse: the magnifier's bone, flattened)."""
    c.rect(x0 - 1, y0 - 1, x1 + 1, y1 + 1, 'a'); c.rect(x0, y0, x1, y1, 'C')
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = (x1 - x0) / 2 - 1, (y1 - y0) / 2 - 1
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            if e <= 1:
                c.px(x, y, 'O' if e <= 0.16 else ('w' if e >= 0.72 else 'W'))


def desk_tiles(t):
    """宽和厚 -> 4 倍; 8 倍的体重 hangs over the 4 cells, then falls, 2 a cell; 每平方厘米: one cell outlined red (12x).
    The cells are the bone's cross-section lying on 核算员's desk, seen from above."""
    z = 12
    c, gy = desk_room(z)
    dy = gy - 22                                          # the desk top
    c.rect(2, dy, 60, dy + 2, 'T'); c.hline(2, 60, dy + 2, 't'); c.rect(5, dy + 3, 6, gy - 1, 't'); c.rect(56, dy + 3, 57, gy - 1, 't')
    cx0, cw, ch = 6, 24, 12
    yf = dy - 3                                           # the slab's front edge
    kw = t >= B['wd2'] + 0.25
    kd = t >= B['wd2'] + 0.55
    cells = [(0, 0)] + ([(1, 0)] if kw else []) + ([(0, 1)] if kd else []) + ([(1, 1)] if kw and kd else [])

    def cell_box(i, j):
        return cx0 + i * cw, yf - (j + 1) * ch + 1, cx0 + i * cw + cw - 2, yf - j * ch - 1

    for (i, j) in cells:
        bone_tile(c, *cell_box(i, j))
    c.rect(cx0 - 1, yf, cx0 + (2 if kw else 1) * cw - 1, yf + 2, 'w'); c.hline(cx0 - 1, cx0 + (2 if kw else 1) * cw - 1, yf + 2, 'a')
    if t >= B['cm']:
        x0, y0, x1, y1 = cell_box(0, 0)
        for k in (1, 2):
            c.hline(x0 - k, x1 + k, y0 - k, 'R'); c.hline(x0 - k, x1 + k, y1 + k, 'R'); c.vline(x0 - k, y0 - k, y1 + k, 'R'); c.vline(x1 + k, y0 - k, y1 + k, 'R')
    if t >= B['wts']:
        w = weight_spr()
        slots = [(1, 0), (1, 1), (0, 0), (0, 1)]          # back row first
        drawn = []
        for n in range(8):
            j, i = slots[n // 2][0], slots[n // 2][1]
            side = n % 2
            x0, y0, x1, y1 = cell_box(i, j)
            x = x0 + 1 + side * 12
            y = (y0 + y1) // 2 + 3 - w.h + 1
            t0 = B['fall'] + 0.06 * n
            if t < t0:
                yy = y - 28 + (1 if int(t * 6 + n) % 2 else 0)
            else:
                p = min(1, (t - t0) / 0.22)
                yy = y - 28 * (1 - p * p)
            drawn.append((j, x, round(yy)))
        for j, x, yy in sorted(drawn, key=lambda q: -q[0]):
            c.blit(w, x, yy)
    a = accountant('deadpan', 'clip'); c.blit(a, 64, gy - a.h + 1)

    def paint(d, im):
        lab = '骨头截面 ×4' if (kw and kd and t >= B['x4']) else '骨头截面'
        text(d, (cx0 * z, (dy + 4) * z), lab, 56, sw=6)
        if kw and t < B['wts']:                       # 宽 doubles to the right, 厚 doubles to the back
            text(d, ((cx0 + 2 * cw + 1) * z, (yf - ch // 2) * z), '宽 ×2', 50, sw=6, anchor='lm')
        if kd and t < B['wts']:
            text(d, ((cx0 + 2 * cw + 1) * z, (yf - 3 * ch // 2) * z), '厚 ×2', 50, sw=6, anchor='lm')
        if t >= B['wts'] and not (LOAD_POPS[0][0] <= t < LOAD_POPS[0][1]):   # the big bar covers it
            text(d, (cx0 * z, 334), '8 倍的体重', 60, sw=7)
    return c, z, paint


def day2_street(t):
    c, z, boxes, gy = street(t, z=5, tree=False, kid_bang=B['kid'], uncle_bang=B['again3'] + 0.1, cat_turn=t >= B['again3'],
                             lit=3 if t >= B['kid'] else None)
    sx, sy = pop_scale(t, ST[1])
    g0 = grown(2); g = squash(g0, sx, sy)
    gx = 108
    c.blit(g, gx + (g0.w - g.w) // 2, gy - g.h + 1)
    if t >= B['kid'] - 0.3:
        n = ease((t - B['kid'] + 0.3) / 0.3)
        head_line(c, gx + 4, round(gx + 4 - (gx + 4 - 4) * n), gy - 4 * 28)

    def paint(d, im):
        floor_labels(d, z, gy, 4, hi=3 if t >= B['kid'] else None)
    return c, z, paint


def day3_building(t):
    lit = 5 if t >= B['top5'] else None
    c, z, floors, (x0, x1), gy = building4(t, lit=lit)
    sx, sy = pop_scale(t, ST[2])
    g0 = grown(3); g = squash(g0, sx, sy)
    gx = 126
    c.blit(g, gx + (g0.w - g.w) // 2, gy - g.h + 1)
    if t >= B['top5']:
        n = ease((t - B['top5']) / 0.3)
        head_line(c, gx + 20, round(gx + 20 - (gx + 20 - x0) * n), gy - 8 * 28)

    def paint(d, im):
        floor_labels(d, z, gy, x0, hi=5 if lit else None)
        if B['x512'] <= t < B['x512'] + 1.1:
            text(d, ((gx + 4) * z, (gy - 120) * z), '衣服：64 件拼 1 件', 44, sw=6)
    return c, z, paint


def crowd512(t):
    """35.84 吨 = 512 个你: eight blocks of 64 little "你" (8 x 8), the blocks filling in one after another (6x).
    Each little one is 3 x 7 art px: hair, face, white shirt, blue trousers, like the big one."""
    z = 6
    c, gy = desk_room(z)
    c.rect(0, 0, c.w - 1, gy - 1, 'C')
    tiny = Canvas(3, 7)
    tiny.rect(0, 0, 2, 0, 'H'); tiny.rect(0, 1, 2, 2, 'S'); tiny.px(0, 1, 'H'); tiny.rect(0, 3, 2, 4, 'W'); tiny.px(0, 5, 'B'); tiny.px(2, 5, 'B'); tiny.px(0, 6, 'K'); tiny.px(2, 6, 'K')
    BX, BY = [8 + k * 37 for k in range(4)], [55, 130]
    shown = 0
    for b in range(8):
        tb = B['t3584'] + 0.1 * b
        if t < tb:
            continue
        fill = ease((t - tb) / 0.25)
        bx, by = BX[b % 4], BY[b // 4]
        c.rect(bx - 2, by - 2, bx + 32, by + 64, 'c')
        for i in range(64):
            if i >= fill * 64:
                break
            c.blit(tiny, bx + (i % 8) * 4, by + (i // 8) * 8)
            shown += 1
    if t >= B['t3584'] + 1.1:
        assert shown == 512, shown

    def paint(d, im):
        for b in range(8):
            if t >= B['t3584'] + 0.1 * b + 0.25:
                bx, by = BX[b % 4], BY[b // 4]
                text(d, ((bx + 15) * z, (by + 66) * z), '64', 38, sw=5, anchor='ma')
        if t >= B['t3584'] + 0.9:
            text(d, (468, 1220), '= 512 个你', 64, sw=7, anchor='ma')
    return c, z, paint


def window_close(t):
    """The 5th floor from inside at 18x: the scalp and whorl above the sill, the auntie from behind, 「……」, the stamp."""
    z = 18
    c = blank(z)
    gy = round(1320 / z)
    ceil = gy - round(3 * PPM)
    c.rect(0, 0, c.w - 1, ceil - 1, 'n'); c.hline(0, c.w - 1, ceil - 1, 'K')
    c.rect(0, ceil, c.w - 1, gy - 1, 'C'); c.rect(0, gy - 2, c.w - 1, gy - 1, 'c')
    c.rect(0, gy, c.w - 1, c.h - 1, 'T'); c.hline(0, c.w - 1, gy, 't')
    sill, wtop = gy - round(0.9 * PPM), gy - round(2.4 * PPM)
    wx0, wx1 = 22, 50
    c.rect(wx0, wtop, wx1, sill, 'M'); c.rect(wx0, wtop, wx1, wtop + 4, 'm')
    cx, top, R = (wx0 + wx1) // 2 + 2, sill - round(0.7 * PPM), 20
    for x in range(wx0, wx1 + 1):
        yy = top + round((x - cx) ** 2 / (2 * R))
        if yy <= sill:
            c.vline(x, yy, sill, 'H'); c.px(x, yy, 'K')
    for hx, hy in ((cx - 7, top + 3), (cx + 6, top + 4), (cx - 1, top + 1)):
        c.px(hx, hy, 'h'); c.px(hx + 1, hy, 'h')
    for dx, dy in ((0, 0), (1, 0), (1, 1), (0, 2), (-1, 2), (-2, 1), (-2, 0), (-2, -1), (-1, -2), (0, -2), (1, -2), (2, -2), (3, -1), (3, 0), (3, 1)):
        c.px(cx + dx, top + 6 + dy, 'A')
    c.px(cx - 6, top - 1, 'H'); c.px(cx - 5, top - 2, 'H'); c.px(cx + 4, top - 1, 'H')
    for x in range(wx0, wx1 + 1):                         # the forehead just above the sill, under a ragged fringe
        if top + round((x - cx) ** 2 / (2 * R)) <= sill - 4:
            c.vline(x, sill - 2, sill, 'S')
            if x % 3 == 0:
                c.px(x, sill - 2, 'H')
    c.rect(wx0 - 1, wtop - 1, wx0 - 1, sill, 'T'); c.rect(wx1 + 1, wtop - 1, wx1 + 1, sill, 'T'); c.hline(wx0 - 1, wx1 + 1, wtop - 1, 'T')
    c.rect(wx0 - 2, sill + 1, wx1 + 2, sill + 2, 'T')
    pot(c, wx0 + 1, sill + 1)
    a = chibi('bun', 'H', 'W', 'T', face='back', prop='can')
    c.blit(a, 3, gy - a.h + 1)
    if t >= B['pop5']:
        bubble(c, 12, gy - a.h - 1, '...')
    if t >= B['nb5']:      # a drop of sweat at the side of her head
        c.rect(1, gy - a.h + 5, 2, gy - a.h + 9, 'L'); c.px(1, gy - a.h + 5, 'Z'); c.hline(1, 2, gy - a.h + 10, 'l')

    def paint(d, im):
        text(d, (40, 340), '5楼', 56, sw=6)
        if t >= B['apol']:
            u = t - B['apol']
            k = 1 + 0.35 * (1 - ease(u / 0.12))
            st = Image.new('RGBA', (440, 190), (0, 0, 0, 0)); sd = ImageDraw.Draw(st)
            sd.rounded_rectangle((8, 8, 432, 182), 14, outline=REDC, width=14)
            sd.text((220, 98), '已道歉', font=font(108), fill=REDC, anchor='mm')
            st = st.rotate(8, resample=Image.BICUBIC, expand=True)
            st = st.resize((round(st.width * k), round(st.height * k)), Image.BICUBIC)
            im.paste(st, (wx0 * z + 40 + (464 - st.width) // 2, wtop * z + 20 + (250 - st.height) // 2), st)
    return c, z, paint


def push_in(t):
    """The cut from the whole building to the window: the building page zoomed toward the 5th-floor window."""
    c, z, paint = day3_building(t)
    return ('push', c, z, paint, ease((t - PUSH0) / (PUSH1 - PUSH0)))


def today(t):
    """s1-10 and g9 on today's street (4x, the whole building in view): today's "你", one more on the shoulders, then
    seven (a column of 8); one bone cell with 8 weights on it; a red 「？」."""
    c, z, boxes, gy = street(t, z=4, tree=False)
    base = you('neutral')
    bx = 118
    riders = []
    for k in range(7):
        t0 = B['one'] + 0.05 if k == 0 else B['seven'] + 0.02 + (k - 1) * 0.09
        p = min(1, max(0, (t - t0) / 0.22))
        if p > 0:
            riders.append(p)
    c.blit(base, bx, gy - base.h + 1)
    for k, p in enumerate(riders):
        y = gy - base.h + 1 - (k + 1) * 21 - round((1 - p * p) * 50)
        c.blit(base, bx, y)
    cx = 150                                                       # the bone cell, right of the column
    if t >= B['bone']:
        bone_tile(c, cx, gy - 12, cx + 24, gy - 2)
        w = weight_spr()
        for n in range(8):
            t0 = B['bone'] + 0.05 * n
            p = min(1, max(0, (t - t0) / 0.16))
            if p > 0:
                c.blit(w, cx + 7, round(gy - 7 - (n + 1) * (w.h - 1) + 1 - (1 - p * p) * 40))

    def paint(d, im):
        n = len(riders)
        if B['you'] <= t < B['bone']:
            text(d, ((bx - 3) * z, (gy - 18) * z), '今天的你', 46, sw=6, anchor='rm')
        if n == 1:
            text(d, ((bx - 3) * z, (gy - 18 - 21) * z), '背 1 个', 50, sw=6, anchor='rm')
        elif n == 7 and riders[-1] >= 1:
            text(d, ((bx - 3) * z, (gy - 29 - 4 * 21 + 10) * z), '背 7 个', 56, sw=6, anchor='rm')
        if t >= B['bone']:
            text(d, ((cx + 27) * z, (gy - 19) * z), '← 一格', 42, sw=6, anchor='lm')
            text(d, ((cx + 27) * z, (gy - 8) * z), '骨头截面', 42, sw=6, anchor='lm')
        if t >= B['cant'] + 0.35:
            k = 1 + 0.3 * (1 - ease((t - B['cant'] - 0.35) / 0.15))
            text(d, ((cx + 34) * z, (gy - 62) * z), '？', int(110 * k), fill=REDC, sw=8, anchor='mm')
    return c, z, paint


def hook_day3(t):
    """Hook cut, 0-1.0 s: day 3's whole building; the red head line runs into 5 楼 (0-0.3 s), 5 楼 lights up, the
    giant blinks at 0.6 s (no 「……」, no whorl close-up)."""
    lit = 5 if t >= 0.3 else None
    c, z, floors, (x0, x1), gy = building4(t, lit=lit)
    g = grown(3, 'deadpan' if 0.6 <= t < 0.67 else 'neutral')
    gx = 126
    c.blit(g, gx, gy - g.h + 1)
    n = ease(t / 0.3)
    head_line(c, gx + 20, round(gx + 20 - (gx + 20 - x0) * n), gy - 8 * 28)

    def paint(d, im):
        floor_labels(d, z, gy, x0, hi=lit)
    return c, z, paint


REWIND_DAY = lambda t: 3 - min(3, int((t - REW0) / (HOOK_END - REW0) * 4))  # noqa: E731


def rewind(t):
    """Hook cut, 1.0-1.7 s: rewinding. In the same building view the giant shrinks back a day every 0.175 s
    (day 3, 2, 1, 0), the lit floor and the head line going down with it; a big rewind sign and the day in the middle.
    No full-frame alternation (no flashing)."""
    day = REWIND_DAY(t)
    lit = {3: 5, 2: 3, 1: 2, 0: None}[day]
    c, z, floors, (x0, x1), gy = building4(t, lit=lit)
    g = grown(day) if day else you('neutral')
    gx = 126
    c.blit(g, gx, gy - g.h + 1)
    if lit:
        head_line(c, gx + 4, x0, gy - round(1.7 * 2 ** day * PPM))

    def paint(d, im):
        floor_labels(d, z, gy, x0, hi=lit)
        d.rounded_rectangle((250, 700, 830, 900), 24, fill=INK, outline=PAPER, width=6)
        for k in (0, 1):
            xr = 380 - k * 70
            d.polygon([(xr, 740), (xr, 860), (xr - 70, 800)], fill=REDC)
        text(d, (420, 800), f'第 {day} 天', 100, fill=AMBER, sw=0, anchor='lm')
    return c, z, paint


def frame(t):
    sc = scene_at(t)
    if sc[0] == 'push':
        _, c, z, paint, u = sc
        im = c.image(z).convert('RGB')
        d = ImageDraw.Draw(im)
        paint(d, im)
        k = 1 + 3.5 * u
        cx, cy = 470, 440
        w, h = 1080 / k, 1920 / k
        box = (cx - w * cx / 1080, cy - h * cy / 1920, cx - w * cx / 1080 + w, cy - h * cy / 1920 + h)
        im = im.crop(tuple(round(v) for v in box)).resize((1080, 1920), Image.NEAREST)
    else:
        c, z, paint = sc
        im = c.image(z).convert('RGB').crop((0, 0, 1080, 1920))
        d = ImageDraw.Draw(im)
        paint(d, im)
    d = ImageDraw.Draw(im)
    if t >= B['tail']:
        tail_card(im, d, t)
        return im
    load_pop(d, t)
    hud_at(d, t)
    panel_at(im, d, t, card=True)
    return im


# (from, to, bar move (a, b, from, to), the bar's start value, the box's top y): day 1 at 17.76, day 3 at 25.633,
# today at 33.875; each finished 「×N」 stays >= 0.5 s. Day 3's box sits lower, clear of 5 楼 and the head line.
LOAD_POPS = [(B['r2'] - 0.06, B['r2'] + 0.85, (B['r2'], B['r2'] + 0.26, 1, 2), 1, 330),
             (B['x8s'] - 0.06, 25.633 + 0.55, (B['x8s'], 25.633, 4, 8), 4, 690),
             (B['eight'] - 0.06, 33.875 + 0.55, (B['eight'], 33.875, 2, 8), 2, 330)]


def load_pop(d, t):
    """At each step of the load bar, the bar drawn big: 「每平方厘米」, 8 cells, 「×N」 (box 840 x 200)."""
    for a, b, move, v0, y0 in LOAD_POPS:
        if a <= t < b:
            v = lerp_load(t, [move], v0)
            done = t >= move[1]
            x0, x1, y1 = 70, 910, y0 + 200
            d.rounded_rectangle((x0, y0, x1, y1), 24, fill=INK, outline=PAPER, width=6)
            text(d, (x0 + 30, y0 + 16), '每平方厘米', 48, sw=0, fill=PAPER)
            full, part = int(v), v - int(v)
            for i in range(8):
                cx = x0 + 30 + i * 64
                d.rectangle((cx, y0 + 86, cx + 52, y0 + 176), fill=REDC if i < full else (60, 58, 68))
                if i == full and part > 0:
                    d.rectangle((cx, y0 + 176 - 90 * part, cx + 52, y0 + 176), fill=REDC)
            if done:
                text(d, (x1 - 28, y0 + 104), f'×{move[3]}', 116, sw=0, fill=REDC, anchor='rm')


def tail_card(im, d, t):
    """38.46 s: 「你押第几天？」 as the main thing, the 核算单 small under it."""
    d.rectangle((0, 0, 1080, 1920), fill=PAL['C'])
    for y in range(0, 1920, 36):
        d.line((0, y, 1080, y), fill=PAL['c'], width=2)
    text(d, (90, 300), '你押第几天？', 110, fill=INK, sw=0)
    text(d, (90, 450), '评论区写一个数，正片里算给你看', 46, fill=(95, 92, 85), sw=0, weight=700)
    text(d, (90, 520), '正片：《假如你每天长高一倍》', 46, fill=REDC, sw=0)
    d.rounded_rectangle((70, 600, 930, 1220), 18, fill=PAPER, outline=INK, width=6)
    text(d, (110, 630), '核算单', 56, fill=INK, sw=0)
    rows = ['① 假设：每天长高一倍，形状不变', '　 今天 1.7 米、70 公斤，一层楼 3 米',
            '② 身高 3.4、6.8、13.6 米：头顶 2、3、5 楼', '③ 体重 ×8、×64、×512',
            '④ 骨头截面 ×4、×16、×64', '⑤ 每平方厘米 = ③ ÷ ④：×2、×4、×8']
    for i, r in enumerate(rows):
        text(d, (110, 720 + i * 72), r, 36, fill=INK, sw=0, weight=700)
    text(d, (110, 1160), '有错，评论区见', 34, fill=(95, 92, 85), sw=0, weight=600)
    a = accountant('deadpan', 'clip')
    im.paste(a.image(8), (760, 1260), a.image(8))


# ---------------------------------------------------------------- output

def main():
    args = sys.argv[1:]
    if '--shots' in args:
        times = [float(x) for x in args[args.index('--shots') + 1].split(',')]
        out = os.path.join(REPO, 'out', 'grow1', 'pixel_shots' + ('_hook' if HOOK else ''))
        os.makedirs(out, exist_ok=True)
        for t in times:
            frame(t).save(os.path.join(out, f't{t:07.2f}.png'))
        print(out)
        return
    out = args[args.index('--out') + 1] if '--out' in args else os.path.join(REPO, 'out', 'grow1_pixel' + ('_hook' if HOOK else '') + '.mp4')
    audio = os.path.join(REPO, 'films', 'grow1', 'audio', 'master.wav')
    cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '1080x1920', '-r', str(FPS), '-i', '-',
           '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
           '-x264-params', 'keyint=60', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
           '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in range(NFR):
        p.stdin.write(frame(f / FPS).tobytes())
        if f % 150 == 0:
            print(f'frame {f}/{NFR}', flush=True)
    p.stdin.close()
    p.wait()
    print('done ->', out)


if __name__ == '__main__':
    main()
