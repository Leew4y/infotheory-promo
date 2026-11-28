"""The pixel cut's two covers, JPEG q94, drawn with the film's own pixel code (tools/grow1/pixel/film.py):

    ~/envs/research/bin/python tools/grow1/pixel/covers.py [out folder, default films/grow1/delivery]
        -> cover_pixel_3x4.jpg (1080 x 1440), cover_pixel_4x3.jpg (1440 x 1080);
           feed-size copies for checking in out/grow1/covers_pixel/

Both show day 3 as the film does at 25.85 s: the whole building in section, the 13.6 m giant beside it, the red head
line into 5 楼, 5 楼 lit. The title sits on a dark panel drawn like the film's readout bar:
「第 3 天」「头顶到 5 楼」 and the line 「你每天长高一倍，我算过了」.
  - 3:4: the film's 4x page, cropped to page y 60 .. 1500, the panel across the top (above the giant's head).
  - 4:3: the same art drawn at 3x on a wider canvas (480 x 360 art px), the panel on the right.
The script checks that the panel's text stays 6 % inside each edge (65 px of 1080).
"""
import os
import sys

from PIL import Image, ImageDraw

sys.argv = sys.argv[:1] + [a for a in sys.argv[1:]]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import film  # noqa: E402
from px import Canvas  # noqa: E402
from scenes import REPO, font, text, sky, ground  # noqa: E402
from scenes2 import INK, AMBER, PAPER  # noqa: E402

OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(REPO, 'films', 'grow1', 'delivery')
CHECK = os.path.join(REPO, 'out', 'grow1', 'covers_pixel')
T = film.B['top5'] + 0.5
MARGIN = 65
GREY = (207, 202, 192)


def title_panel(d, box, size1, size2, stack):
    """The readout-bar panel with the title; returns the text boxes (for the margin check)."""
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, 26, fill=INK, outline=PAPER, width=6)
    boxes = []
    if stack:      # 4:3: three lines
        lines = [('第 3 天', size1, AMBER), ('头顶到 5 楼', size1, PAPER), ('你每天长高一倍', size2, GREY), ('我算过了', size2, GREY)]
        y = y0 + 40
        for s, sz, col in lines:
            d.text((x0 + 44, y), s, font=font(sz), fill=col)
            boxes.append(d.textbbox((x0 + 44, y), s, font=font(sz)))
            y += sz + (34 if sz == size1 else 18)
    else:          # 3:4: 「第 3 天」「头顶到 5 楼」 on one line, the sentence under it
        x = x0 + 36
        for s, col in (('第 3 天', AMBER), ('头顶到 5 楼', PAPER)):
            d.text((x, y0 + 34), s, font=font(size1), fill=col)
            boxes.append(d.textbbox((x, y0 + 34), s, font=font(size1)))
            x += d.textlength(s, font=font(size1)) + 40
        d.text((x0 + 38, y0 + 64 + size1), '你每天长高一倍，我算过了', font=font(size2), fill=GREY)
        boxes.append(d.textbbox((x0 + 38, y0 + 64 + size1), '你每天长高一倍，我算过了', font=font(size2)))
    return boxes


def check(boxes, w, h, name):
    for b in boxes:
        assert b[0] >= MARGIN and b[1] >= MARGIN and b[2] <= w - MARGIN and b[3] <= h - MARGIN, (name, b)


def cover_3x4():
    c, z, paint = film.day3_building(T)
    im = c.image(z).convert('RGB').crop((0, 0, 1080, 1920))
    paint(ImageDraw.Draw(im), im)
    im = im.crop((0, 60, 1080, 1500))
    d = ImageDraw.Draw(im)
    boxes = title_panel(d, (MARGIN - 20, 40, 1080 - MARGIN + 20, 300), 96, 52, stack=False)
    check(boxes, 1080, 1440, '3x4')
    return im


def cover_4x3():
    c, z, paint = film.day3_building(T)          # art canvas 270 x 480, the ground at y 330
    wide = Canvas(480, 360)
    sky(wide, 330); ground(wide, 330)
    wide.g[:, :240] = c.g[:360, :240]
    im = wide.image(3).convert('RGB')
    d = ImageDraw.Draw(im)
    for i in range(5):                            # floor numbers, as floor_labels but at 3x (its y window is the film's)
        hi = i == 4
        text(d, (14 * 3 + 10, (330 - (i + 1) * 49) * 3 + 10), f'{i + 1}楼', 50 if hi else 44, fill=film.REDC if hi else (255, 255, 255), sw=6)
    boxes = title_panel(d, (735, 150, 1440 - MARGIN + 20, 760), 104, 56, stack=True)
    check(boxes, 1440, 1080, '4x3')
    return im


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(CHECK, exist_ok=True)
    for name, im, feed in (('cover_pixel_3x4.jpg', cover_3x4(), (360, 480)), ('cover_pixel_4x3.jpg', cover_4x3(), (480, 360))):
        im.save(os.path.join(OUT, name), quality=94)
        im.resize(feed, Image.LANCZOS).save(os.path.join(CHECK, name.replace('.jpg', '-feed.jpg')), quality=92)
        print(os.path.join(OUT, name), im.size)


if __name__ == '__main__':
    main()
