"""Write D:/demo/.cache/grow1-tools/sfx_cues.json from the film's cue sheet.

    python sfx_cues.py [cues.json]

The cue sheet is films/grow1/cues.json, written by `bun scripts/export.ts --film grow1 --cues` from the scene's sfx
(films/grow1/scenes/s1.ts: 'stamp' on each counter step, 'gauge' where the pressure gauge's pointer arrives, 'end' when
the tail card comes in), times in film seconds. Output: [{"t": seconds, "kind": "stamp" | "gauge" | "end"}], sorted.
"""
import json, os, sys
src = sys.argv[1] if len(sys.argv) > 1 else r'D:\promo-films-light\films\grow1\cues.json'
cues = json.load(open(src, encoding='utf-8'))
out = [{'t': round(c['t'], 4), 'kind': c['name']} for c in sorted(cues, key=lambda c: c['t'])]
bad = [c for c in out if c['kind'] not in ('stamp', 'gauge', 'end')]
if bad or not out:
    sys.exit(f'unexpected cues in {src}: {bad or "none"}')
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sfx_cues.json')
json.dump(out, open(dst, 'w', encoding='utf-8'), indent=1)
print(f'{len(out)} cues -> {dst}')
for c in out:
    print(f"  {c['t']:8.4f}  {c['kind']}")
