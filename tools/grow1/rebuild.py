"""Rebuild the film "grow1" (长高一倍，体重变几倍？) from its narration lock to the vertical video, in order, stopping at
the first failure:

    python rebuild.py <out.mp4> [--skip-sound] [--samples <folder>] [--dry-run]

0. checks that every input exists before anything runs, and names all that are missing: the film's sources
   (film.ts, main.ts, kit.ts, scenes/index.ts and every scene it imports), narration.json, the lock and one FLAC per
   locked line, the repository scripts, the sound (grow1-tools/sfx.py, audio/mix.py, the harp samples), the composer
   and the seam check. Without grow1-tools/sfx_cues.json (written by the scene) the sound runs on its provisional cues
   from the voice's pauses: said as a WARNING at the start and the end. --dry-run stops after this check.
1. font subsets, build, timeline + sound cues + narration placements, validate --no-captions (0 errors), type check
2. sound: grow1-tools/sfx.py --samples <folder> (out/grow1/music.wav: silent except the effects; no music under the
   voice), the final mix (audio/mix.py, -16 LUFS -> out/grow1/master.wav), measurements (grow1-tools/sfx_measure.py);
   with --skip-sound the existing out/grow1/master.wav is used, and the run stops if it is older than the narration
   lock, sfx_cues.json or sfx.py
3. the 16:9 picture without captions or audio (4 workers) to D:/demo/.cache/grow1-tools/build/pic.mp4
4. the vertical cut (vertical.py) with out/grow1/master.wav, then the seam check (seams.py) on it
After each step the file it should have written is checked (exists and is new); each step's full output is kept in
build/<step>.log, and its WARNING lines are repeated at the end. TEMP/TMP are set to
D:/demo/.cache/tmp for every step. --samples defaults to the VSCO 2 CE folder the earlier films used.
"""
import json
import os
import re
import subprocess
import sys
import time

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')
REPO = r'D:\promo-films-light'
FILM = 'grow1'
TOOLS = r'D:\demo\.cache\grow1-tools'
TMP = r'D:\demo\.cache\tmp'
args = sys.argv[1:]
SKIP_SOUND = '--skip-sound' in args
DRY = '--dry-run' in args
SAMPLES = r'D:\earthage-promo\audio\samples'
if '--samples' in args:
    SAMPLES = args[args.index('--samples') + 1]
    del args[args.index('--samples'):args.index('--samples') + 2]
args = [a for a in args if a not in ('--skip-sound', '--dry-run')]
if len(args) != 1 and not (DRY and not args):
    sys.exit(__doc__)
OUT = os.path.abspath(args[0]) if args else None
F = os.path.join(REPO, 'films', FILM)
O = os.path.join(REPO, 'out', FILM)
PIC = os.path.join(TOOLS, 'build', 'pic.mp4')
TL = os.path.join(F, 'timeline.json')
MASTER = os.path.join(O, 'master.wav')
LOCK = os.path.join(F, 'narration.lock.json')
SFX = os.path.join(TOOLS, 'sfx.py')
CUES = os.path.join(TOOLS, 'sfx_cues.json')
MEASURE = os.path.join(TOOLS, 'sfx_measure.py')
os.makedirs(TMP, exist_ok=True)
os.makedirs(os.path.dirname(PIC), exist_ok=True)
env = dict(os.environ, Path=r'D:\bun\bin;' + os.environ.get('Path', ''), TEMP=TMP, TMP=TMP)
warnings = []


def need(paths, before):
    """Stop, naming every missing path, before the step `before` runs."""
    missing = [p for p in paths if not os.path.exists(p)]
    if missing:
        sys.exit(f'cannot run {before}: missing\n  ' + '\n  '.join(missing))


def step(name, cmd, cwd=REPO, extra=None, makes=None):
    t_mark = time.time()
    r = subprocess.run(cmd, cwd=cwd, env=dict(env, **(extra or {})), capture_output=True, text=True, encoding='utf-8',
                       errors='replace')
    text = r.stdout + r.stderr
    open(os.path.join(TOOLS, 'build', f'{name}.log'), 'w', encoding='utf-8').write(text)
    lines = text.strip().splitlines()
    tail = '\n'.join(lines[-8:])
    warn = [ln for ln in lines[:-8] if 'WARNING' in ln or ln.startswith('warning')]
    print(f'== {name}: exit {r.returncode} ({time.time() - t_mark:.0f} s), full output build/{name}.log\n'
          + ''.join(w + '\n' for w in warn) + f'{tail}\n', flush=True)
    warnings.extend(f'{name}: {w.strip()}' for w in lines if 'WARNING' in w)
    if r.returncode:
        sys.exit(f'stopped at: {name}')
    for p in makes or []:
        if not os.path.exists(p) or os.path.getmtime(p) < t_mark - 2:
            sys.exit(f'stopped after {name}: it did not write {p}')


# 0. inputs, all named at once
srcs = [os.path.join(F, p) for p in ('film.ts', 'main.ts', 'kit.ts', os.path.join('scenes', 'index.ts'),
                                     'narration.json', 'narration.lock.json')]
idx = os.path.join(F, 'scenes', 'index.ts')
if os.path.exists(idx):
    srcs += [os.path.join(F, 'scenes', m + '.ts')
             for m in re.findall(r"^import '\./([\w-]+)';", open(idx, encoding='utf-8').read(), re.M)]
flacs = []
if os.path.exists(LOCK):
    flacs = [os.path.join(F, 'narration', f'{lid}.flac') for lid in json.load(open(LOCK, encoding='utf-8'))['lines']]
scripts = [os.path.join(REPO, 'scripts', s) for s in ('fonts.ts', 'export.ts', 'validate.ts')]
tools = [os.path.join(TOOLS, 'vertical.py'), os.path.join(TOOLS, 'seams.py')]
sound = [MASTER] if SKIP_SOUND else [SFX, os.path.join(REPO, 'audio', 'mix.py'), SAMPLES]
need(srcs + flacs + scripts + tools + sound,
     'the rebuild' + (' with --skip-sound (run without it to make the mix)' if SKIP_SOUND else ''))
if not os.path.exists(CUES):
    warnings.append(f'{CUES} does not exist: the sound effects use sfx.py\'s provisional cues (the voice\'s pauses),'
                    ' not the picture\'s stamp moments')
if SKIP_SOUND:
    for p in (LOCK, CUES, SFX):
        if os.path.exists(p) and os.path.getmtime(MASTER) < os.path.getmtime(p):
            sys.exit(f'{MASTER} is older than {p}: run without --skip-sound')
for w in warnings:
    print('WARNING: ' + w + '\n')
if DRY:
    print(f'inputs complete ({len(srcs)} sources, {len(flacs)} narration files); dry run: nothing built')
    sys.exit(0)

# 1. build and checks
step('fonts', ['bun', 'scripts/fonts.ts', '--film', FILM], makes=[os.path.join(F, 'fonts', 'paper-dawn', 'manifest.json')])
step('build', ['bunx', 'vite', 'build'], extra={'FILM': FILM}, makes=[os.path.join(REPO, 'dist', FILM, 'index.html')])
step('timeline', ['bun', 'scripts/export.ts', '--film', FILM, '--cues', '--timeline', '--narration'],
     makes=[TL, os.path.join(O, 'narration.cues.json')])
step('validate', ['bun', 'scripts/validate.ts', '--film', FILM, '--no-captions'])  # the picture as exported (step 3)
step('tsc', ['bun', 'x', 'tsc', '--noEmit', '-p', '.'])
# 2. sound and mix
if not SKIP_SOUND:
    step('sound', [sys.executable, SFX, '--samples', SAMPLES], makes=[os.path.join(O, 'music.wav')])
    step('mix', [sys.executable, os.path.join('audio', 'mix.py'), '--film', FILM, '--music', f'out/{FILM}/music.wav'],
         makes=[MASTER])
    if os.path.exists(MEASURE):
        step('measure', [sys.executable, MEASURE])
    else:
        print(f'(no {MEASURE}: no measurements)\n')
# 3. the picture
step('picture', ['bun', 'scripts/export.ts', '--film', FILM, '--workers', '4', '--no-captions', '--noaudio', '--out', PIC],
     makes=[PIC])
# 4. the vertical cut and its seams
need([PIC, TL, MASTER], 'the vertical cut')
step('vertical', [sys.executable, os.path.join(TOOLS, 'vertical.py'), PIC, TL, MASTER, OUT], cwd=TOOLS, makes=[OUT])
step('seams', [sys.executable, os.path.join(TOOLS, 'seams.py'), OUT, '3'], cwd=TOOLS)
for w in warnings:
    print('WARNING: ' + w)
print('done ->', OUT)
