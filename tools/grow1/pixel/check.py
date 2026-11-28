"""Checks of the pixel cut after a render (out/grow1_pixel.mp4 and out/grow1_pixel_hook.mp4).

    ~/envs/research/bin/python tools/grow1/pixel/check.py [--no-asr]

1. The files (ffprobe): 1080x1920, 30 fps, the frame count of film.py, audio as long as the video, at most 40.0 s;
   loudness and true peak of each file's audio (ffmpeg ebur128): -16 LUFS +- 0.5, at most -1.0 dBTP.
2. Single-frame flashes: every frame at 135x240 grey; a frame that differs from both neighbours by a mean of more than
   4 grey levels while the neighbours differ from each other by less than 1 is reported (it only finds large ones).
3. Text: every frame drawn again with film.text recording each call's box (text through other paths, such as the floor
   numbers, the stamps and the tail card's small print, is not seen); every box must lie in x 24-930, y 150-1560
   (Douyin's buttons on the right and its caption at the bottom), the tail card excepted; text under 40 px is listed.
4. Words: each line's window of the final mix (its start to its end in film.py, from the normal cut's audio)
   transcribed with Qwen3-ASR 1.7B; it must read as the line's words (punctuation aside). --no-asr skips it.
Prints one line per check and exits 1 if any fails.
"""
import json
import os
import re
import subprocess
import sys
from collections import Counter

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
_argv = sys.argv
sys.argv = [sys.argv[0]]
sys.path.insert(0, HERE)
import film  # noqa: E402
sys.argv = _argv
sys.path.insert(0, os.path.join(REPO, 'tools', 'grow1'))
from voice_takes import ASR, bare  # noqa: E402

CUTS = {'normal': os.path.join(REPO, 'out', 'grow1_pixel.mp4'), 'hook': os.path.join(REPO, 'out', 'grow1_pixel_hook.mp4')}
fails = []


def check(ok, msg):
    print(('ok    ' if ok else 'FAIL  ') + msg, flush=True)
    if not ok:
        fails.append(msg)


def probe(path):
    p = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-show_entries',
                                   'stream=codec_type,width,height,r_frame_rate,nb_read_frames,duration', '-of', 'json', path],
                                  capture_output=True, text=True, check=True).stdout)
    v = next(s for s in p['streams'] if s['codec_type'] == 'video')
    a = next(s for s in p['streams'] if s['codec_type'] == 'audio')
    return v, a


def loudness(path):
    e = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    summary = e[e.rindex('Summary:'):]
    return float(re.search(r'I:\s+(-?\d+\.\d)', summary).group(1)), float(re.search(r'Peak:\s+(-?\d+\.\d)', summary).group(1))


def flashes(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', 'scale=135:240', '-pix_fmt', 'gray', '-f', 'rawvideo', '-'],
                         capture_output=True, check=True).stdout
    f = np.frombuffer(raw, np.uint8).reshape(-1, 240, 135).astype(np.float32)
    d = lambda a, b: np.abs(f[a] - f[b]).mean()  # noqa: E731
    return [k for k in range(1, len(f) - 1) if d(k - 1, k) > 4 and d(k, k + 1) > 4 and d(k - 1, k + 1) < 1]


def text_boxes(hook):
    film.HOOK = hook
    boxes, small = [], Counter()
    orig = film.text

    def rec(d, xy, s, size, fill=(255, 255, 255), stroke=(29, 26, 36), sw=6, weight=900, anchor='la'):
        boxes.append((d.textbbox(xy, s, font=film.font(size, weight), anchor=anchor, stroke_width=sw), s, size))
        orig(d, xy, s, size, fill=fill, stroke=stroke, sw=sw, weight=weight, anchor=anchor)
    film.text = rec
    out, n = [], 0
    try:
        for k in range(film.NFR):
            t = k / film.FPS
            boxes.clear()
            film.frame(t)
            if t >= film.B['tail']:
                continue
            for (x0, y0, x1, y1), s, size in boxes:
                n += 1
                if x0 < 24 or x1 > 930 or y0 < 150 or y1 > 1560:
                    out.append(f'{t:.2f}s {s!r} {x0},{y0}-{x1},{y1}')
                if size < 40:
                    small[(s if len(s) < 12 else s[:12] + '…', size)] += 1
    finally:
        film.text = orig
        film.HOOK = False
    return n, out, small


def main():
    for cut, path in CUTS.items():
        v, a = probe(path)
        dur = float(v['duration'])
        check(v['width'] == 1080 and v['height'] == 1920 and v['r_frame_rate'] == '30/1' and int(v['nb_read_frames']) == film.NFR,
              f"{cut}: {v['width']}x{v['height']} at {v['r_frame_rate']}, {v['nb_read_frames']} frames (film.py {film.NFR})")
        check(abs(float(a['duration']) - dur) < 0.03 and dur <= 40.0, f"{cut}: video {dur:.3f} s, audio {float(a['duration']):.3f} s, at most 40.0 s")
        lufs, tp = loudness(path)
        check(abs(lufs + 16) <= 0.5 and tp <= -1.0, f'{cut}: {lufs} LUFS, true peak {tp} dBTP')
        fl = flashes(path)
        check(not fl, f'{cut}: single-frame flashes {fl if fl else "none"}')
        n, out, small = text_boxes(cut == 'hook')
        check(not out, f'{cut}: {n} text boxes, outside x 24-930 / y 150-1560: {out[:6] if out else "none"}')
        print(f'      {cut}: text under 40 px: ' + ', '.join(f'{s} {z}px ({c} frames)' for (s, z), c in sorted(small.items(), key=lambda q: q[0][1])))
    if '--no-asr' not in sys.argv:
        work = os.path.join(REPO, '.cache', 'grow1_pixel_check')
        os.makedirs(work, exist_ok=True)
        for i in film.START:
            a, b = film.START[i], film.START[i] + film.LOCK[i]['duration']
            w = os.path.join(work, f'{i}.wav')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{a - 0.05:.3f}', '-to', f'{b + 0.05:.3f}', '-i', CUTS['normal'],
                            '-ac', '1', '-ar', '16000', w], check=True)
            p = subprocess.run(['speech', 'transcribe', '-m', ASR, '--language', 'chinese', w], capture_output=True, text=True)
            got = next((ln[7:].strip() for ln in (p.stdout + p.stderr).splitlines() if ln.startswith('Result:')), '')
            said = film.LOCK[i]['said']
            check(bare(got) == bare(said), f'words {i} {a:.2f}-{b:.2f} s: {got}' + ('' if bare(got) == bare(said) else f' (the line: {said})'))
    print(f'{len(fails)} failed' if fails else 'all passed')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
