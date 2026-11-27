"""Render check frames of the film "grow1" (《长高一倍，体重变几倍？》) in isolation, so the scene can be checked while
other jobs build or export films/grow1 itself.

    python prev.py <t1,t2,...> [--tag name] [--validate] [--probe [step]]

Times are film seconds (the film is one scene, s1). Copies films/grow1 into a private film films/g1p (narration lines,
the lock re-labelled for the private film, kit.ts, scenes), builds its font subset, builds it, renders the frames to
out/grow1/prev/<tag>/tSSSS.SS.jpg (default tag "s1"), optionally runs validate (--no-captions, the picture as
exported) and probe.ts (every frame's text boxes: sizes, safe area, overlaps, display punctuation; and the beat
table), and removes the private film, its build and its out folder. For every frame it also writes vSSSS.SS.jpg, a
rough vertical mock (1080x1920: the 16:9 frame scaled to 1080x608 at y = 610 on paper with the grid continued, page
pitch 36 px; the real band and captions come from vertical.py) and pSSSS.SS.jpg, the mock at phone size (360x640).
"""
import json
import os
import re
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))  # the repository root
FILM = 'grow1'
if len(sys.argv) < 2:
    sys.exit(__doc__)
times = sys.argv[1]
args = sys.argv[2:]
tag = args[args.index('--tag') + 1] if '--tag' in args else 's1'
want_validate = '--validate' in args
probe_step = None
if '--probe' in args:
    i = args.index('--probe')
    probe_step = args[i + 1] if i + 1 < len(args) and not args[i + 1].startswith('--') else '0.0333333'
fid = 'g1p'
src = os.path.join(REPO, 'films', FILM)
dst = os.path.join(REPO, 'films', fid)
out = os.path.join(REPO, 'out', FILM, 'prev', tag)
TOOLS = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(REPO, '.cache', 'tmp')
os.makedirs(TMP, exist_ok=True)
env = dict(os.environ, FILM=fid, TEMP=TMP, TMP=TMP, TMPDIR=TMP)


def run(cmd):
    r = subprocess.run(cmd, cwd=REPO, env=env, capture_output=True, text=True, encoding='utf-8', errors='replace')
    tail = '\n'.join((r.stdout + r.stderr).strip().splitlines()[-40:])
    print(f'$ {" ".join(cmd)}  (exit {r.returncode})\n{tail}\n', flush=True)
    return r.returncode


shutil.rmtree(dst, ignore_errors=True)
shutil.copytree(src, dst, ignore=shutil.ignore_patterns('fonts', 'narration', 'regress'))
film = open(os.path.join(dst, 'film.ts'), encoding='utf-8').read()
if f"id: '{FILM}'" not in film:
    sys.exit(f"films/{FILM}/film.ts has no id: '{FILM}' to re-label")
open(os.path.join(dst, 'film.ts'), 'w', encoding='utf-8', newline='\n').write(film.replace(f"id: '{FILM}'", f"id: '{fid}'"))
lock = json.load(open(os.path.join(src, 'narration.lock.json'), encoding='utf-8'))
lock['film'] = fid
json.dump(lock, open(os.path.join(dst, 'narration.lock.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
shutil.copytree(os.path.join(src, 'narration'), os.path.join(dst, 'narration'))
os.makedirs(out, exist_ok=True)
for name in os.listdir(out):
    if re.match(r'[tvp]\d', name):
        os.remove(os.path.join(out, name))
ok = checks = True
try:
    ok = run(['bun', 'scripts/fonts.ts', '--film', fid]) == 0
    ok = ok and run(['bunx', 'vite', 'build']) == 0
    ok = ok and run(['bun', 'scripts/export.ts', '--film', fid, '--shots', times, '--dir', out, '--no-captions']) == 0
    if ok and probe_step:
        checks = run(['bun', os.path.join(TOOLS, 'probe.ts'), fid, probe_step]) == 0 and checks
    if ok and want_validate:
        checks = run(['bun', 'scripts/validate.ts', '--film', fid, '--no-captions']) == 0 and checks
finally:
    shutil.rmtree(dst, ignore_errors=True)
    shutil.rmtree(os.path.join(REPO, 'dist', fid), ignore_errors=True)
    shutil.rmtree(os.path.join(REPO, 'out', fid), ignore_errors=True)


def page():
    """The page ground: paper with the grid continued (page pitch 36 px, majors every 180 px, from y = 610)."""
    v = Image.new('RGB', (1080, 1920), (243, 241, 234))
    d = ImageDraw.Draw(v)
    for i in range(0, 31):
        x = i * 36
        d.line([(x, 0), (x, 1919)], fill=(214, 209, 198) if i % 5 else (204, 199, 187), width=1)
    for j in range(-17, 37):
        y = 610 + j * 36
        if 0 <= y < 1920:
            d.line([(0, y), (1079, y)], fill=(214, 209, 198) if j % 5 else (204, 199, 187), width=1)
    return v


if ok:
    base = page()
    for name in sorted(os.listdir(out)):
        if not (name.startswith('t') and name.endswith('.jpg')):
            continue
        pic = Image.open(os.path.join(out, name)).convert('RGB').resize((1080, 608), Image.LANCZOS)
        v = base.copy()
        v.paste(pic, (0, 610))
        v.save(os.path.join(out, 'v' + name[1:]), quality=90)
        v.resize((360, 640), Image.LANCZOS).save(os.path.join(out, 'p' + name[1:]), quality=90)
print('OK' if ok and checks else 'FRAMES OK, CHECKS FAILED' if ok else 'FAILED', '->', out)
sys.exit(0 if ok and checks else 1)
