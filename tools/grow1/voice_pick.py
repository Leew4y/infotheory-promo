"""Pick and join grow1's narration takes (from voice_takes.py) into audition files.

    ~/envs/research/bin/python tools/grow1/voice_pick.py <takes dir> [--styles a,b] [--natural]

For every take: speaker similarity to voice H, the cosine between its WeSpeaker embedding (`speech embed-speaker`) and
the mean embedding of grow1's 11 committed voice-H lines. Baselines printed for comparison: each committed line
against the mean of the other ten, and the repo's male voice prompt (voices/zh-male-professor).
Pauses inside a take (10 ms frames below -45 dBFS and the take's loudest frame - 30 dB, at least 0.15 s) are shortened
to min(p, 0.2 + 0.3 (p - 0.2)) s by cutting silence out of their middle (10 ms crossfade): the engine pauses 0.3-0.6 s
at every comma, which is slow and stiff; longer pauses stay longer than shorter ones (0.3 -> 0.23, 0.6 -> 0.32 s).
Per style, each line's take is the one whose transcript matches the text, with the highest similarity among those
whose speaking rate (syllables per second, after the pauses are shortened) is within 15 % of that style's median; the
takes are joined with the
picture's gaps (0.3 s after the first line, 0.2 s after the others) into <takes dir>/audition_<style>.wav and .mp3,
and the choice goes to <takes dir>/picked_<style>.json. A narration longer than TARGET s (the film's tail card starts at
38.46 s) is played faster to TARGET with ffmpeg atempo (pitch kept); the factor is printed.
--natural keeps each take as the engine made it (no pause shortening), joins with the gaps of ordinary speech (0.5 s
after the first line, 0.35 s between the two 「再翻一倍」, 0.45 s elsewhere) and never speeds up: it shows the
engine's own pace and how long the script runs at it (files get the suffix _natural). --styles limits the run to those
styles.
"""
import json
import os
import subprocess
import sys
import wave

import numpy as np

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
ORDER = ['s1-1', 'g1', 's1-2', 's1-3', 's1-4', 's1-5', 's1-7', 's1-8b', 'g5b', 's1-10', 'g9']
PUNCT = set('，。、；：？！—… ,.?!;:')
TARGET = 38.2


def emb(path):
    p = subprocess.run(['speech', 'embed-speaker', path, '--json'], capture_output=True, text=True)
    out = p.stdout
    v = np.array(json.loads(out[out.index('{'):])['embedding'])
    return v / np.linalg.norm(v)


def as16k(src, dst):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-ar', '16000', '-ac', '1', dst], check=True)
    return dst


def read(path):
    with wave.open(path) as w:
        return np.frombuffer(w.readframes(w.getnframes()), np.int16), w.getframerate()


def shape(x, rate):
    """The take with its inside pauses shortened (see the module docstring)."""
    fr = rate // 100
    n = len(x) // fr
    y = x.astype(np.float64) / 32768
    db = 20 * np.log10(np.sqrt((y[:n * fr].reshape(n, fr) ** 2).mean(axis=1)) + 1e-9)
    quiet = ~(db > max(-45.0, db.max() - 30.0))
    cuts, i = [], 0
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            p = (j - i) / 100
            if i > 0 and j < n and p >= 0.15:
                q = min(p, 0.2 + 0.3 * (p - 0.2))
                drop = int(round((p - q) * rate))
                mid = (i * fr + j * fr) // 2
                cuts.append((mid - drop // 2, mid - drop // 2 + drop))
            i = j
        else:
            i += 1
    out, pos, xf = [], 0, rate // 100
    for a, b in cuts:
        seg = y[pos:a].copy()
        if out and len(seg) > xf:                      # crossfade over the join (it is silence on both sides)
            tail = out[-1][-xf:].copy()
            ramp = np.linspace(0, 1, xf)
            out[-1] = out[-1][:-xf]
            seg[:xf] = tail * (1 - ramp) + seg[:xf] * ramp
        out.append(seg)
        pos = b
    out.append(y[pos:])
    return (np.clip(np.concatenate(out), -1, 1) * 32767).astype(np.int16)


def gap(i, natural):
    if natural:
        return {'s1-1': 0.5, 's1-5': 0.35}.get(i, 0.45)
    return 0.3 if i == 's1-1' else 0.2


def main():
    d = os.path.abspath(sys.argv[1])
    natural = '--natural' in sys.argv
    only = sys.argv[sys.argv.index('--styles') + 1].split(',') if '--styles' in sys.argv else None
    sfx = '_natural' if natural else ''
    cache = os.path.join(d, 'ref16k'); os.makedirs(cache, exist_ok=True)
    refs = {i: emb(as16k(os.path.join(REPO, 'films', 'grow1', 'narration', f'{i}.flac'), os.path.join(cache, f'{i}.wav'))) for i in ORDER}
    mean = np.mean(list(refs.values()), axis=0); mean /= np.linalg.norm(mean)
    loo = []
    for i, v in refs.items():
        m = np.mean([w for j, w in refs.items() if j != i], axis=0); m /= np.linalg.norm(m)
        loo.append(float(v @ m))
    male = float(emb(as16k(os.path.join(REPO, 'voices', 'zh-male-professor', 'prompt.wav'), os.path.join(cache, 'male.wav'))) @ mean)
    print(f'baseline: voice-H lines vs the others {min(loo):.3f}-{max(loo):.3f} (mean {np.mean(loo):.3f}); male prompt {male:.3f}')

    takes = [json.loads(l) for l in open(os.path.join(d, 'takes.jsonl'), encoding='utf-8')]
    if only:
        takes = [t for t in takes if t['style'] in only]
    for t in takes:
        t['sim'] = float(emb(as16k(t['file'], os.path.join(cache, os.path.basename(t['file'])))) @ mean)
        text = ''.join(ch for ch in t['asr'] if ch not in PUNCT)
        x, r = read(t['file'])
        t['shaped'] = x if natural else shape(x, r)
        t['shaped_s'] = len(t['shaped']) / r
        t['rate'] = len(text) / t['shaped_s'] if t['shaped_s'] else 0
    for style in sorted({t['style'] for t in takes}):
        st = [t for t in takes if t['style'] == style]
        med = float(np.median([t['rate'] for t in st if t['match']]))
        sims = [t['sim'] for t in st]
        print(f'\n{style}: {sum(t["match"] for t in st)}/{len(st)} takes read right; similarity {min(sims):.3f}-{max(sims):.3f}; median rate {med:.2f} syl/s')
        picked, parts, rate = {}, [], None
        for i in ORDER:
            ok = [t for t in st if t['id'] == i and t['match']]
            if i == 's1-7':           # the same words as s1-5: another seed, so the two are not one clip played twice
                ok = [t for t in ok if t['seed'] != picked['s1-5']['seed']]
            near = [t for t in ok if abs(t['rate'] - med) <= 0.15 * med] or ok
            if not near:
                sys.exit(f'{style}: no take of {i} reads right')
            best = max(near, key=lambda t: t['sim'])
            picked[i] = best
            _, rate = read(best['file'])
            parts.append(best['shaped'])
            parts.append(np.zeros(int(rate * gap(i, natural)), np.int16))
            print(f'  {i:6s} seed {best["seed"]}  {best["seconds"]:5.2f} -> {best["shaped_s"]:5.2f} s  {best["rate"]:.2f} syl/s  sim {best["sim"]:.3f}  {best["asr"]}')
        y = np.concatenate(parts[:-1])
        out = os.path.join(d, f'audition_{style}{sfx}.wav')
        raw = out[:-4] + '_raw.wav'
        with wave.open(raw, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(y.tobytes())
        tempo = 1.0 if natural else max(1.0, len(y) / rate / TARGET)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af', f'atempo={tempo:.4f}', '-c:a', 'pcm_s16le', out], check=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', out, '-af', 'loudnorm=I=-16:TP=-1.5', '-ar', '44100', '-b:a', '192k', out[:-4] + '.mp3'], check=True)
        print(f'  {len(y) / rate:.2f} s joined, played {tempo:.3f}x -> {len(y) / rate / tempo:.2f} s')
        pos = 0.0                                     # each line's start and end in the final file (for checks)
        bounds = {}
        for i in ORDER:
            n = len(picked[i]['shaped']) / rate / tempo
            bounds[i] = (round(pos, 3), round(pos + n, 3))
            pos += n + gap(i, natural) / tempo
        json.dump(bounds, open(os.path.join(d, f'bounds_{style}{sfx}.json'), 'w'), indent=1)
        json.dump({i: {k: picked[i][k] for k in ('seed', 'file', 'seconds', 'shaped_s', 'asr', 'sim')} for i in ORDER},
                  open(os.path.join(d, f'picked_{style}{sfx}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f'  total {len(y) / rate:.2f} s of narration -> {out[:-4]}.mp3')


if __name__ == '__main__':
    main()
