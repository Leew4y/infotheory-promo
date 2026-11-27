"""The two covers of the film "grow1" (《长高一倍，体重变几倍？》), JPEG q94:

    python tools/grow1/covers.py [--v2] [out folder, default films/grow1/delivery]
        -> cover_4x3.jpg (1440 x 1080), cover_3x4.jpg (1080 x 1440), and -phone.jpg copies at feed size for checking
           (--v2: cover_v2_4x3.jpg, cover_v2_3x4.jpg for v2, pilot_short_1_v2.md; v1's covers are left as they are)

--v2: the 4:3 cover is tools/grow1/cover_scene_v2.ts (the title 「第 3 天」「头顶到 5 楼」, 「体重 ×512」, the stamp, the
three premise lines, the plate and the film's close-up of the 5th-floor window); the 3:4 cover's picture is the film's
own frame at V2_T (the close-up with 「……」, the day-3 weight line and crowd at the left; the film must be built), set
through vertical.py as below, with the title 「第 3 天，头顶到 5 楼」.

Copies films/grow1 into a private film films/g1c whose only scene is tools/grow1/cover_scene.ts (no narration),
builds its font subset and the film, shoots two frames and removes the copy, its build and its out folder:
  - t 0.5: the 4:3 cover, whole; cropped to x 240 .. 1680 of the 1920 x 1080 frame (centred, so the picture's
    vignette stays centred);
  - t 1.5: the picture of the 3:4 cover; made into a 2-second still clip and run through vertical.py --sample (the band
    with the 「假设」 stamp, the premise lines, the note and the name plate; the grid continued from the picture), with a
    timeline that has no captions. The page is cropped to y 136 .. 1576 and the title 「长高一倍，体重变几倍？」 is set
    under the picture (Noto Serif SC 700, ink), above the bottom 15 % of the cover, which stays clear.
Margins: 6 % (86 px of 1440, 65 px of 1080); the script checks that every non-paper pixel of each cover is inside them.
"""
import json
import os
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont, features

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
TOOLS = os.path.dirname(os.path.abspath(__file__))
FILM, FID = 'grow1', 'g1c'
V2 = '--v2' in sys.argv[1:]
ARGS = [a for a in sys.argv[1:] if a != '--v2']
OUT = os.path.abspath(ARGS[0]) if ARGS else os.path.join(REPO, 'films', FILM, 'delivery')
V2_T = 30.3   # the close-up with 「……」 and the red 「已道歉」 on the window
WORK = os.path.join(REPO, 'out', FILM, 'covers_v2' if V2 else 'covers')
TITLE = '第 3 天，头顶到 5 楼' if V2 else '长高一倍，体重变几倍？'
PRE = 'cover_v2_' if V2 else 'cover_'
SERIF = os.path.join(REPO, '.cache', 'fonts', 'NotoSerifSC[wght].ttf')
INK = (0x1A, 0x19, 0x17)
env = dict(os.environ, FILM=FID)
if sys.platform == 'darwin':
    env['DYLD_FALLBACK_LIBRARY_PATH'] = ':'.join(filter(None, [env.get('DYLD_FALLBACK_LIBRARY_PATH'), '/opt/homebrew/lib']))


def run(cmd, **kw):
    r = subprocess.run(cmd, cwd=REPO, env=env, capture_output=True, text=True, **kw)
    if r.returncode:
        sys.exit(f'$ {" ".join(cmd)}\n{(r.stdout + r.stderr)[-3000:]}')
    return r.stdout


os.makedirs(OUT, exist_ok=True)
os.makedirs(WORK, exist_ok=True)
src, dst = os.path.join(REPO, 'films', FILM), os.path.join(REPO, 'films', FID)
shutil.rmtree(dst, ignore_errors=True)
try:
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns('fonts', 'narration', 'regress', 'docs', 'audio', 'delivery',
                                                            'narration*.json', 'timeline.json', 'cues.json'))
    open(os.path.join(dst, 'film.ts'), 'w', encoding='utf-8').write(
        "import { defineFilm, selectStyle } from '../../engine';\nimport style from '../../styles/paper-dawn';\n\n"
        f"selectStyle([style]);\nexport default defineFilm({{ id: '{FID}', fps: 30, bpm: 80, chapters: 0, punctuation: 'display' }});\n")
    shutil.rmtree(os.path.join(dst, 'scenes'))
    os.makedirs(os.path.join(dst, 'scenes'))
    shutil.copy(os.path.join(TOOLS, 'cover_scene_v2.ts' if V2 else 'cover_scene.ts'), os.path.join(dst, 'scenes', 'cover.ts'))
    open(os.path.join(dst, 'scenes', 'index.ts'), 'w', encoding='utf-8').write("import './cover';\n")
    run(['bun', 'scripts/fonts.ts', '--film', FID])
    run(['bunx', 'vite', 'build'])
    run(['bun', 'scripts/export.ts', '--film', FID, '--shots', '0.5' if V2 else '0.5,1.5', '--dir', WORK, '--no-captions'])
finally:
    shutil.rmtree(dst, ignore_errors=True)
    shutil.rmtree(os.path.join(REPO, 'dist', FID), ignore_errors=True)
    shutil.rmtree(os.path.join(REPO, 'out', FID), ignore_errors=True)

shots = sorted(f for f in os.listdir(WORK) if f.startswith('t') and f.endswith('.jpg'))
fa, fb = os.path.join(WORK, shots[0]), (os.path.join(WORK, shots[1]) if len(shots) > 1 else None)
if V2:
    # the film's own frame for the 3:4 picture (the film as last built: dist/grow1)
    film_dir = os.path.join(WORK, 'film')
    shutil.rmtree(film_dir, ignore_errors=True)
    run(['bun', 'scripts/export.ts', '--film', FILM, '--shots', str(V2_T), '--dir', film_dir, '--no-captions'])
    fb = os.path.join(film_dir, sorted(os.listdir(film_dir))[0])


def margins_ok(im, name, mx, my, bottom=None):
    """Every pixel much darker or redder than the paper lies inside the margins (and above `bottom`, if given)."""
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    ink = (a.sum(2) < 3 * 150) | ((a[..., 0] - a[..., 2]) > 60)
    ys, xs = np.nonzero(ink)
    box = (xs.min(), ys.min(), xs.max(), ys.max())
    h, w = ink.shape
    ok = box[0] >= mx and box[2] <= w - 1 - mx and box[1] >= my and box[3] <= (bottom if bottom else h - 1 - my)
    print(f'{name}: ink box x {box[0]}..{box[2]}, y {box[1]}..{box[3]} of {w}x{h}; margins {mx}/{my} px'
          + (f', bottom clear from y {bottom}' if bottom else '') + (': ok' if ok else ': OUTSIDE'))
    return ok


# 4:3
c43 = Image.open(fa).convert('RGB').crop((240, 0, 1680, 1080))
ok = margins_ok(c43, 'cover_4x3', 86, 65)
c43.save(os.path.join(OUT, PRE + '4x3.jpg'), quality=94, subsampling=0)

# 3:4: the picture through the composer
clip = os.path.join(WORK, 'pic34.mp4')
run(['ffmpeg', '-y', '-v', 'error', '-loop', '1', '-i', fb, '-t', '2', '-r', '30', '-c:v', 'libx264', '-crf', '10',
     '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', clip])
tl = os.path.join(WORK, 'pic34.timeline.json')
json.dump({'film': FID, 'fps': 30, 'frames': 60, 'duration': 2.0, 'captions': [],
           'scenes': [{'name': 'cover', 'f0': 0, 'f1': 60}]}, open(tl, 'w'))
page = os.path.join(WORK, 'page34.png')
print(run([sys.executable, os.path.join(TOOLS, 'vertical.py'), clip, tl, os.path.join(WORK, 'none.wav'), page,
           '--sample', '1.0']).strip().splitlines()[-1])
Y0 = 98 if V2 else 136   # v2's band has its plate higher (vertical.py: frame from y 184), 86 px under the cover's top
p = Image.open(page).convert('RGB').crop((0, Y0, 1080, Y0 + 1440))
d = ImageDraw.Draw(p)
size = 86
f = ImageFont.truetype(SERIF, size)
f.set_variation_by_axes([700])
w = d.textlength(TITLE, font=f)
bbox = d.textbbox((0, 0), TITLE, font=f)
x = (1080 - w) / 2
y_ink_bottom = 1440 - 216 - 24          # the ink ends 24 px above the bottom 15 % (y 1224)
d.text((x, y_ink_bottom - bbox[3]), TITLE, font=f, fill=INK)
if V2:
    # the brief's small 「体重 ×512」, right-aligned between the band and the picture
    fs = ImageFont.truetype(SERIF, 60)
    fs.set_variation_by_axes([700])
    w1, w2 = d.textlength('体重 ', font=fs), d.textlength('×512', font=fs)
    x2 = 1015 - w2
    d.text((x2 - w1, 470), '体重 ', font=fs, fill=INK)
    d.text((x2, 470), '×512', font=fs, fill=(0x9E, 0x42, 0x1C))
ok = margins_ok(p, 'cover_3x4', 65, 86, bottom=1440 - 216) and ok
p.save(os.path.join(OUT, PRE + '3x4.jpg'), quality=94, subsampling=0)
for n in (PRE + '4x3', PRE + '3x4'):
    im = Image.open(os.path.join(OUT, n + '.jpg'))
    im.resize((im.width // 3, im.height // 3), Image.LANCZOS).save(os.path.join(WORK, n + '-phone.jpg'), quality=90)
print('covers ->', OUT, '' if ok else '(MARGIN CHECK FAILED)')
sys.exit(0 if ok else 1)
