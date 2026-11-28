"""The pixel cut's sound: the new voice (films/grow1/pixel_voice/) and the effects at film.py's CUES, made by the same
effect synthesiser and mixer as v2 (tools/grow1/sfx.py, audio/mix.py, tools/grow1/sfx_measure.py) on a copy of the
repository's layout in a scratch folder, so v2's narration, timeline and master stay as they are.

    ~/envs/research/bin/python tools/grow1/pixel/sound.py [--work dir] [--snap]

1. The scratch root (default .cache/grow1_pixel_sound/): films/grow1/narration.lock.json and narration/*.flac (the
   pixel voice), films/grow1/timeline.json (v2's: 1199 frames at 30 fps), out/grow1/narration.cues.json (each line at
   its start in film.py), audio/mix.py and synth.py linked from the repository, sfx_cues.json from film.CUES.
2. sfx.py with GROW1_REPO=<root>: the effects, each checked clear of the speech (BWD_GAP before, FWD_GAP after); with
   --snap a cue that is not is moved into the nearest clear slot (out/grow1/sfx/cues_used.json in the root; the
   picture must then follow).
3. audio/mix.py --film grow1 --music <root>/out/grow1/music.wav: every line levelled, mastered to -16 LUFS, true peak
   at most -1.5 dBTP.
4. sfx_measure.py: loudness, peaks and each effect's level and distance from the speech (out/grow1/sfx/ in the root).
5. The master copied to films/grow1/audio/master_pixel.wav, with master_pixel.json (mix.py's record of what it was made
   from, and the cues used).
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.argv, _argv = [sys.argv[0]], sys.argv           # film.py reads sys.argv at import (--hook): import it plain
sys.path.insert(0, HERE)
import film  # noqa: E402
sys.argv = _argv
PY = sys.executable


def run(cmd, env=None):
    print('$', ' '.join(os.path.relpath(c, REPO) if os.path.isabs(c) else c for c in cmd), flush=True)
    p = subprocess.run(cmd, env={**os.environ, **(env or {})}, cwd=REPO)
    if p.returncode:
        sys.exit(f'failed: {cmd[1]}')


def main():
    work = os.path.abspath(sys.argv[sys.argv.index('--work') + 1]) if '--work' in sys.argv else os.path.join(REPO, '.cache', 'grow1_pixel_sound')
    if os.path.exists(work):
        shutil.rmtree(work)
    fdir = os.path.join(work, 'films', 'grow1')
    os.makedirs(os.path.join(fdir, 'narration'))
    os.makedirs(os.path.join(work, 'out', 'grow1'))
    os.makedirs(os.path.join(work, 'audio'))
    for f in ('mix.py', 'synth.py'):
        os.symlink(os.path.join(REPO, 'audio', f), os.path.join(work, 'audio', f))
    lock = json.load(open(os.path.join(film.VOICE, 'narration.lock.json'), encoding='utf-8'))
    json.dump(lock, open(os.path.join(fdir, 'narration.lock.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for i in lock['lines']:
        shutil.copy(os.path.join(film.VOICE, 'narration', f'{i}.flac'), os.path.join(fdir, 'narration', f'{i}.flac'))
    shutil.copy(os.path.join(REPO, 'films', 'grow1', 'timeline.json'), os.path.join(fdir, 'timeline.json'))
    placements = [{'id': i, 't': film.START[i], 'dur': lock['lines'][i]['duration']} for i in film.START]
    digest = hashlib.sha256(json.dumps(placements, sort_keys=True).encode()).hexdigest()
    json.dump({'film': 'grow1', 'frames': film.NFR, 'fps': film.FPS, 'bar': 3, 'duration': film.NFR / film.FPS,
               'digest': digest, 'placements': placements},
              open(os.path.join(work, 'out', 'grow1', 'narration.cues.json'), 'w'), indent=1)
    cues = os.path.join(work, 'sfx_cues.json')
    json.dump([{**c, 't': round(c['t'], 4)} for c in film.CUES], open(cues, 'w'), indent=1)
    env = {'GROW1_REPO': work, 'GROW1_SFX_CUES': cues}
    samples = os.path.join(REPO, 'films', 'grow1', 'audio', 'samples')
    run([PY, os.path.join(REPO, 'tools', 'grow1', 'sfx.py'), '--samples', samples] + (['--snap'] if '--snap' in sys.argv else []), env)
    run([PY, os.path.join(work, 'audio', 'mix.py'), '--film', 'grow1', '--music', os.path.join(work, 'out', 'grow1', 'music.wav')])
    run([PY, os.path.join(REPO, 'tools', 'grow1', 'sfx_measure.py')], env)
    dst = os.path.join(REPO, 'films', 'grow1', 'audio', 'master_pixel.wav')
    shutil.copy(os.path.join(work, 'out', 'grow1', 'master.wav'), dst)
    meta = json.load(open(os.path.join(work, 'out', 'grow1', 'master.json')))
    used = os.path.join(work, 'out', 'grow1', 'sfx', 'cues_used.json')
    meta.update({'voice': 'films/grow1/pixel_voice', 'cues': json.load(open(used)) if os.path.exists(used) else film.CUES,
                 'made_with': 'tools/grow1/pixel/sound.py (tools/grow1/sfx.py, audio/mix.py)'})
    json.dump(meta, open(dst[:-4] + '.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('->', os.path.relpath(dst, REPO))


if __name__ == '__main__':
    main()
