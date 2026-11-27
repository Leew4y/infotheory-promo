"""Write tools/grow1/sfx_cues.json from the film's cue sheet.

    python sfx_cues.py [cues.json [out.json]]       (out.json: default tools/grow1/sfx_cues.json)

The cue sheet is films/grow1/cues.json, written by `bun scripts/export.ts --film grow1 --cues` from the scene's sfx
(films/grow1/scenes/s1.ts sets S.sfx to tuples [t, kind, params?], engine/scene.ts; engine/boot.ts writes each as
{"t": film seconds, "name": kind, ...params}, the params spread into the cue). Kinds (pilot_short_1_v2.md):
  - stamp {day: 1 | 2 | 3}: each counter step, later days heavier (sfx.py STAMPS);
  - gauge: where the pressure gauge's pointer arrives (optional dur, n: sfx.py);
  - pop: a neighbour's speech bubble appears;
  - end: the tail card comes in.
Output: [{"t": seconds, "kind": kind, ...params}], sorted by time; every param of a cue is carried through. A stamp
without a day, a day other than 1, 2, 3, or the same day stamped twice stops the script; so does a kind it does not
know. The file is only rewritten when its content changes (rebuild.py compares the master's age with it).
"""
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
KINDS = ('stamp', 'gauge', 'pop', 'end')
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'films', 'grow1', 'cues.json')
cues = json.load(open(src, encoding='utf-8'))
out, bad = [], []
for c in sorted(cues, key=lambda c: c['t']):
    kind = c.get('name', c.get('kind'))
    params = {k: v for k, v in c.items() if k not in ('t', 'name', 'kind')}
    out.append({'t': round(float(c['t']), 4), 'kind': kind, **params})
    if kind not in KINDS:
        bad.append(f'unknown kind {kind!r} at {c["t"]} ({", ".join(KINDS)})')
    if kind == 'stamp' and params.get('day') not in (1, 2, 3):
        bad.append(f'stamp at {c["t"]}: day {params.get("day")!r} (1, 2 or 3)')
days = [c['day'] for c in out if c['kind'] == 'stamp' and c.get('day') in (1, 2, 3) and not c.get('extra')]  # extra: a stamp that is not a counter step
if len(set(days)) != len(days):
    bad.append(f'a day is stamped more than once: {days}')
if not out:
    bad.append('no cues')
if bad:
    sys.exit(f'{src}:\n  ' + '\n  '.join(bad))
dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sfx_cues.json')
text = json.dumps(out, indent=1)
old = open(dst, encoding='utf-8').read() if os.path.exists(dst) else None
if old == text:
    print(f'{len(out)} cues, unchanged: {dst}')
else:
    with open(dst + '.tmp', 'w', encoding='utf-8') as f:
        f.write(text)
    os.replace(dst + '.tmp', dst)
    print(f'{len(out)} cues -> {dst}')
for c in out:
    extra = ', '.join(f'{k} {v}' for k, v in c.items() if k not in ('t', 'kind'))
    print(f"  {c['t']:8.4f}  {c['kind']}" + (f' ({extra})' if extra else ''))
