"""Measurements of grow1's effects in the final master, after sfx.py and audio/mix.py:

    python tools/grow1/sfx_measure.py

1. out/grow1/master.wav: integrated loudness, loudness range, true peak (ffmpeg ebur128), sample peak, samples at full
   scale; music.wav: true peak.
2. The mix rebuilt from its inputs with audio/mix.py's own functions (each line levelled to VOICE_RMS_DB, the music's
   gain from its RMS away from the narration, the duck, the headroom step); the music gain against sfx.py's prediction;
   the master's gain as the least-squares ratio of master to the rebuilt mix, the residual, whether the mixer's
   loudnorm ran linear or dynamic, and the local gain per 50 ms block (dynamic loudnorm moves it).
3. Inside the master (the rebuilt voice and effects, each times the local master gain): for every effect its level
   (RMS over its extent, sample peak, the 300 Hz - 8 kHz band) re the voice around it (RMS over the voiced spans of the
   lines within 1.5 s); the local gain there against the voice's; the voice's energy around it (RMS in the 100 ms
   before its start, during it and in the 100 ms after its end, and the loudest 5 ms voice frame from BWD_GAP before
   to FWD_GAP after, all re the voice level); the distance to the nearest speech frame each side; where it overlaps
   speech, its level re the voice in the worst 1/3-octave band (sfx.band_worst). Verdict per effect.
4. Spectrograms of the master: out/grow1/sfx/spectrogram.png (whole film, log frequency 50 Hz - 16 kHz, effects marked
   above, voiced spans below) and zooms.png (0.4 s each side of every stamp, gauge rise and the end motif).
Writes out/grow1/sfx/measure.json and the stems out/grow1/sfx/stems/{voice,fx}_in_master.wav.
"""
import json
import math
import os
import re
import subprocess
import sys

import numpy as np
import scipy.io.wavfile as wavfile
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sfx  # noqa: E402
from sfx import SR, F32, OUT, SFX_OUT, mix, db, rms, bandpass  # noqa: E402

BLOCK = 0.05  # s: blocks for the local master gain
AROUND = 0.1  # s: windows before and after an effect for the voice's energy
NEAR = 1.5  # s: lines whose voiced spans lie within this of an effect set the voice level around it


def ebur(path):
    o = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    s = o[o.rindex('Summary:'):]
    f = lambda pat: float(re.search(pat, s).group(1))  # noqa: E731
    return {'I': f(r'I:\s+(-?[\d.]+) LUFS'), 'LRA': f(r'LRA:\s+(-?[\d.]+) LU'), 'TP': f(r'Peak:\s+(-?[\d.]+) dBFS')}


def loudnorm_type(pre):
    tmp = os.path.join(SFX_OUT, f'measure.{os.getpid()}.tmp.wav')
    try:
        wavfile.write(tmp, SR, (np.clip(pre, -1, 1).T * 32767).astype(np.int16))
        ln = f'loudnorm=I={mix.synth.TARGET_I}:TP={mix.synth.MAX_TP}:LRA=13'
        o = subprocess.run(['ffmpeg', '-hide_banner', '-i', tmp, '-af', ln + ':print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
        q = json.loads(o[o.rindex('{'):o.rindex('}') + 1])
        ln += (f":measured_I={q['input_i']}:measured_TP={q['input_tp']}:measured_LRA={q['input_lra']}:measured_thresh={q['input_thresh']}"
               f":offset={q['target_offset']}:linear=true:print_format=json")
        o = subprocess.run(['ffmpeg', '-hide_banner', '-i', tmp, '-af', ln, '-f', 'null', '-'], capture_output=True, text=True).stderr
        q2 = json.loads(o[o.rindex('{'):o.rindex('}') + 1])
        return q, q2.get('normalization_type')
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


# ------------------------------------------------------------------ spectrogram pictures
LUT_ANCHORS = [(0, 0, 4), (28, 16, 68), (79, 18, 123), (129, 37, 129), (181, 54, 122), (229, 80, 100), (251, 135, 97),
               (254, 194, 135), (252, 253, 191)]  # magma-like
_xs = np.linspace(0, 1, len(LUT_ANCHORS))
LUT = np.stack([np.interp(np.linspace(0, 1, 256), _xs, [c[k] for c in LUT_ANCHORS]) for k in range(3)], 1).astype(np.uint8)
FMIN, FMAX = 50.0, 16000.0
KIND_COL = {'stamp': (230, 40, 40), 'tick': (60, 200, 230), 'end': (90, 220, 90)}


def spec(x, t0, t1, width, height, nfft, hop, top_db, range_db=90.0):
    a, b = max(0, int(t0 * SR) - nfft // 2), min(len(x), int(t1 * SR) + nfft // 2)
    seg = np.asarray(x[a:b], np.float64)
    w = np.hanning(nfft)
    starts = np.arange(0, max(1, len(seg) - nfft), hop)
    S = np.stack([np.abs(np.fft.rfft(seg[s:s + nfft] * w)) ** 2 for s in starts], 1) / (np.sum(w) ** 2 / 4)
    L = 10 * np.log10(S + 1e-20)
    fr = np.fft.rfftfreq(nfft, 1 / SR)
    rows = FMIN * (FMAX / FMIN) ** (np.arange(height)[::-1] / (height - 1))
    Lr = np.stack([np.interp(rows, fr, L[:, k]) for k in range(L.shape[1])], 1)
    tc = (a + starts + nfft / 2) / SR
    cols = np.linspace(t0, t1, width)
    idx = np.clip(np.searchsorted(tc, cols), 0, len(tc) - 1)
    # each column: the loudest STFT frame that falls in it (so a short click is not averaged away)
    edges = np.searchsorted(tc, np.linspace(t0, t1, width + 1))
    img = np.empty((height, width))
    for c in range(width):
        lo, hi = edges[c], max(edges[c + 1], edges[c] + 1)
        img[:, c] = Lr[:, lo:hi].max(1) if lo < Lr.shape[1] else Lr[:, idx[c]]
    v = np.clip((img - (top_db - range_db)) / range_db, 0, 1)
    return Image.fromarray(LUT[(v * 255).astype(int)])


def freq_y(f, height):
    return int(round((height - 1) * (1 - math.log(f / FMIN) / math.log(FMAX / FMIN))))


def picture(x, t0, t1, width, height, nfft, hop, top_db, events, spans, title, tick_step, font):
    sp = spec(x, t0, t1, width, height, nfft, hop, top_db)
    L, T, Bm = 56, 30, 34
    im = Image.new('RGB', (width + L + 8, height + T + Bm), (20, 20, 24))
    im.paste(sp, (L, T))
    d = ImageDraw.Draw(im)
    d.text((L, 4), title, fill=(235, 235, 235), font=font)
    for f in (100, 300, 1000, 3000, 10000):
        y = T + freq_y(f, height)
        d.line([(L - 5, y), (L, y)], fill=(200, 200, 200))
        d.text((4, y - 6), f'{f // 1000}k' if f >= 1000 else str(f), fill=(200, 200, 200), font=font)
    X = lambda t: L + int(round((t - t0) / (t1 - t0) * (width - 1)))  # noqa: E731
    k = math.ceil(t0 / tick_step)
    while k * tick_step <= t1 + 1e-9:
        t = k * tick_step
        d.line([(X(t), T + height), (X(t), T + height + 4)], fill=(200, 200, 200))
        d.text((X(t) - 10, T + height + 18), f'{t:.1f}' if tick_step < 1 else f'{t:.0f}', fill=(200, 200, 200), font=font)
        k += 1
    for a, b in spans:  # voiced spans, below the picture
        if b >= t0 and a <= t1:
            d.rectangle([X(max(a, t0)), T + height + 6, X(min(b, t1)), T + height + 12], fill=(235, 235, 235))
    for ev in events:  # effects, above the picture
        if ev['end'] >= t0 and ev['start'] <= t1:
            col = KIND_COL[ev['kind']]
            d.rectangle([X(max(ev['start'], t0)), T - 9, X(min(ev['end'], t1)) + 1, T - 3], fill=col)
    return im


def main():
    F = sfx.load_film()
    n, voice, duck, away = F['n'], F['voice'], F['duck'], F['away']
    levels = json.load(open(os.path.join(SFX_OUT, 'levels.json'), encoding='utf-8'))
    events = levels['events']
    music_p, master_p = os.path.join(OUT, 'music.wav'), os.path.join(OUT, 'master.wav')
    mj = json.load(open(os.path.join(OUT, 'master.json'), encoding='utf-8'))
    if mj['music']['sha256'] != sfx.mix.sha256_file(music_p):
        raise SystemExit('master.json names another music.wav: run audio/mix.py --film grow1 --music out/grow1/music.wav first')
    res = {'master': {}, 'events': []}

    qm = ebur(master_p)
    qmu = ebur(music_p)
    sr_, xi = wavfile.read(master_p)
    clip = int(np.sum((xi >= 32767) | (xi <= -32767)))
    spk = 20 * math.log10(max(int(np.max(np.abs(xi.astype(np.int32)))), 1) / 32768)
    print(f"== master.wav: {qm['I']:.2f} LUFS integrated, LRA {qm['LRA']:.1f} LU, true peak {qm['TP']:.2f} dBTP, sample peak {spk:.2f} dBFS, "
          f'samples at full scale {clip}; duration {xi.shape[0] / SR:.4f}s ({xi.shape[0]} samples, film {n})')
    print(f"   music.wav: true peak {qmu['TP']:.2f} dBTP")
    res['master'] = {'I_LUFS': qm['I'], 'LRA_LU': qm['LRA'], 'TP_dBTP': qm['TP'], 'sample_peak_dBFS': round(spk, 2), 'full_scale_samples': clip,
                     'samples': int(xi.shape[0])}

    # the mix as audio/mix.py builds it
    music = mix.decode(music_p, 2)
    gm = 10 ** ((mix.VOICE_RMS_DB - mix.BED_BELOW_DB - mix.rms_db(music[:, away])) / 20)
    mus = music * np.float32(gm) * duck
    pre = mus + voice[None, :]
    hd = 1 / max(1.0, float(np.max(np.abs(pre))) / 0.89)
    pre *= np.float32(hd)
    master = mix.decode(master_p, 2)[:, :n]
    G = float(np.sum(master.astype(np.float64) * pre) / np.sum(pre.astype(np.float64) ** 2))
    resid = mix.rms_db(master - G * pre) - mix.rms_db(master)
    q, ntype = loudnorm_type(pre)
    print(f"== rebuilt mix: music gain {20 * math.log10(gm):+.2f} dB (sfx.py predicted {levels['predicted_mix_gain_on_music_wav_db']:+.2f}), headroom "
          f"{20 * math.log10(hd):+.2f} dB, master gain {20 * math.log10(G):+.2f} dB (least squares), residual {resid:.1f} dB under the master; "
          f"loudnorm: input {q['input_i']} LUFS, {q['input_tp']} dBTP -> normalization_type {ntype}")
    # local gain per block, interpolated where the mix is silent
    Bk = int(BLOCK * SR)
    nb = n // Bk
    m64, p64 = master[:, :nb * Bk].astype(np.float64), pre[:, :nb * Bk].astype(np.float64)
    num = (m64 * p64).reshape(2, nb, Bk).sum(axis=(0, 2))
    den = (p64 ** 2).reshape(2, nb, Bk).sum(axis=(0, 2))
    ok = den > (10 ** (-70 / 10)) * Bk * 2
    gb = np.where(ok, num / np.maximum(den, 1e-30), np.nan)
    centers = (np.arange(nb) + 0.5) * Bk
    g_t = np.interp(np.arange(n), centers[ok], gb[ok]).astype(F32)
    lg = 20 * np.log10(np.maximum(gb[ok], 1e-9) / G)
    print(f'   local master gain per 50 ms block re the overall: median {np.median(lg):+.2f} dB, range {lg.min():+.2f} .. {lg.max():+.2f} dB')
    res['mix'] = {'music_gain_db': round(20 * math.log10(gm), 3), 'predicted_db': levels['predicted_mix_gain_on_music_wav_db'],
                  'headroom_db': round(20 * math.log10(hd), 3), 'master_gain_db': round(20 * math.log10(G), 3), 'residual_db': round(resid, 1),
                  'loudnorm_input_I': q['input_i'], 'loudnorm_input_TP': q['input_tp'], 'normalization_type': ntype,
                  'local_gain_db_range': [round(float(lg.min()), 2), round(float(lg.max()), 2)]}

    vm = (voice * hd * g_t).astype(F32)  # the voice in the master
    fm = (mus.mean(axis=0) * hd * g_t).astype(F32)  # the effects in the master (mono)
    fm2 = (mus * hd * g_t[None, :]).astype(F32)
    left = rms(master - (vm[None, :] + fm2)) / max(rms(master), 1e-12)
    print(f'   master explained by (voice + effects) x local gain: residual {db(left):.1f} dB under the master')
    wavfile.write(os.path.join(SFX_OUT, 'stems', 'voice_in_master.wav'), SR, vm)
    wavfile.write(os.path.join(SFX_OUT, 'stems', 'fx_in_master.wav'), SR, fm2.T)
    act, B = sfx.speech_frames(voice)
    all_spans = [(a, b) for L in F['lines'] for a, b in L['spans']]
    v_act = rms(np.concatenate([vm[int(a * SR):int(b * SR)] for a, b in all_spans]))
    v_line_db = mix.VOICE_RMS_DB + 20 * math.log10(hd * G)
    print(f'   voice in the master: {v_line_db:.1f} dBFS RMS per line (whole clip, at the overall gain), {db(v_act):.1f} dBFS over all voiced spans')
    res['master']['voice_line_rms_dBFS'] = round(v_line_db, 2)
    res['master']['voice_active_rms_dBFS'] = round(db(v_act), 2)

    print('== effects in the master (levels re the voice around each: RMS over the voiced spans of lines within 1.5 s)')
    print('   kind    time    len   rms  300-8k  peak dBFS | gain re voice | voice re its level: 100ms before / during / 100ms after / '
          'loudest 5ms in guard | clear ms before/after | worst band | verdict')
    fails = []
    for ev in events:
        s0, s1 = ev['start'], ev['end']
        i0, i1 = int(s0 * SR), int(s1 * SR)
        near = [(a, b) for a, b in all_spans if b > s0 - NEAR and a < s1 + NEAR]
        vseg = np.concatenate([vm[int(a * SR):int(b * SR)] for a, b in near]) if near else vm[:1]
        vref = db(rms(vseg))
        g_ev = float(np.median(g_t[i0:i1]))
        g_v = float(np.median(np.concatenate([g_t[int(a * SR):int(b * SR)] for a, b in near]))) if near else g_ev
        e = fm[i0:i1]
        lv = db(rms(e)) - vref
        band = db(rms(bandpass(e, 300, 8000))) - vref if len(e) > 64 else float('nan')
        pk = db(np.max(np.abs(fm2[:, i0:i1])))
        w_before = db(rms(vm[max(0, i0 - int(AROUND * SR)):i0])) - vref
        w_during = db(rms(vm[i0:i1])) - vref
        w_after = db(rms(vm[i1:min(n, i1 + int(AROUND * SR))])) - vref if i1 < n else float('-inf')
        g0, g1 = max(0, int((s0 - sfx.BWD_GAP) * SR)), min(n, int((s1 + sfx.FWD_GAP) * SR))
        lvv, _ = sfx.frame_db(vm[g0:g1])
        loud5 = float(lvv.max()) - vref if len(lvv) else float('-inf')
        prev, nxt = sfx.speech_near(act, B, s0, s1)
        gap_b = None if prev is None else round((s0 - prev) * 1000)
        gap_a = None if nxt is None else round((nxt - s1) * 1000)
        k0, k1 = max(0, int((s0 - sfx.BWD_GAP) * SR) // B), int(math.ceil((s1 + sfx.FWD_GAP) * SR / B))
        on_speech = bool(act[k0:k1].any())
        worst = sfx.band_worst(vm, fm, max(0, i0 - int(0.03 * SR)), min(n, i1 + int(0.06 * SR))) if on_speech else None
        if not on_speech:
            verdict = 'clear of speech'
        elif worst is not None and worst <= -sfx.MASK_MARGIN:
            verdict = f'over speech, >= {sfx.MASK_MARGIN:.0f} dB under it in every band'
        else:
            verdict = 'MASKS SPEECH'
            fails.append(f"{ev['kind']} {ev['t']}")
        row = {'kind': ev['kind'], 't': ev['t'], 'start': s0, 'end': s1, 'length_ms': round((s1 - s0) * 1000, 1),
               'rms_db_re_voice': round(lv, 2), 'band_300_8k_db_re_voice': round(band, 2), 'peak_dBFS': round(pk, 2),
               'voice_level_dBFS': round(vref, 2), 'gain_at_effect_re_voice_db': round(20 * math.log10(g_ev / g_v), 2),
               'voice_100ms_before_db': (None if w_before < -120 else round(w_before, 1)), 'voice_during_db': (None if w_during < -120 else round(w_during, 1)), 'voice_100ms_after_db': (None if w_after < -120 else round(w_after, 1)),
               'voice_loudest_5ms_in_guard_db': (None if loud5 < -120 else round(loud5, 1)), 'clear_before_ms': gap_b, 'clear_after_ms': gap_a,
               'worst_band_db_re_voice': None if worst is None else round(worst, 1), 'verdict': verdict}
        if ev['kind'] == 'end':
            row['rms_after_last_line_db_re_voice'] = round(db(rms(fm[int(levels['away_window_s'][0] * SR):])) - vref, 2)
        res['events'].append(row)
        f1 = lambda v: 'silent' if v < -120 else f'{v:+6.1f}'  # noqa: E731
        print(f"   {ev['kind']:5s} {ev['t']:7.3f} {row['length_ms']:6.0f} {lv:+6.1f} {band:+6.1f} {pk:+7.1f}   | {row['gain_at_effect_re_voice_db']:+5.2f} dB"
              f"      | {f1(w_before)} / {f1(w_during)} / {f1(w_after)} / {f1(loud5)}          | {gap_b} / {gap_a}"
              f"  | {'-' if worst is None else f'{worst:+.1f}'} | {verdict}")
    # under each line: the effects re the voice
    under = []
    for L in F['lines']:
        a, b = L['i0'], L['i1']
        under.append((L['id'], db(rms(fm[a:b])) - db(rms(vm[a:b]))))
    print('   effects under each line (RMS over the line clip re the voice): ' + ', '.join(f'{k} {"silent" if v < -150 else f"{v:.1f}"}' for k, v in under))
    res['under_lines_db'] = {k: (None if v < -150 else round(v, 1)) for k, v in under}

    # pictures
    font = ImageFont.load_default()
    mono = master.mean(axis=0)
    top = db(np.max(np.abs(mono))) - 6
    im = picture(mono, 0, n / SR, 2400, 520, 2048, 256, top, events, all_spans,
                 'grow1 master.wav  (red: stamp, cyan: gauge tick, green: end motif; white: voiced spans)', 1.0, font)
    im.save(os.path.join(SFX_OUT, 'spectrogram.png'))
    groups = []
    for ev in events:
        if ev['kind'] == 'tick' and groups and groups[-1][0] == 'tick' and ev['t'] - groups[-1][2] < 0.5:
            groups[-1][2] = ev['end']
            continue
        groups.append([ev['kind'], ev['start'], ev['end']])
    tiles = []
    for kind, a, b in groups:
        c = (a + b) / 2 if kind != 'end' else a + 0.4
        t0, t1 = (c - 0.45, c + 0.45) if kind != 'end' else (a - 0.4, n / SR)
        tiles.append(picture(mono, max(0, t0), min(n / SR, t1), 560, 300, 512, 32, top, events, all_spans,
                             f'{kind} {a:.3f}s', 0.1 if kind != 'end' else 0.5, font))
    cols = 3
    tw, th = tiles[0].size
    rows_n = -(-len(tiles) // cols)
    grid = Image.new('RGB', (cols * tw, rows_n * th), (20, 20, 24))
    for k, t in enumerate(tiles):
        grid.paste(t, ((k % cols) * tw, (k // cols) * th))
    grid.save(os.path.join(SFX_OUT, 'zooms.png'))
    with open(os.path.join(SFX_OUT, 'measure.json'), 'w', encoding='utf-8') as f:
        json.dump(res, f, indent=1, ensure_ascii=False)
    print(f'pictures: {os.path.join(SFX_OUT, "spectrogram.png")}, {os.path.join(SFX_OUT, "zooms.png")}')
    errs = []
    if abs(qm['I'] - (-16.0)) > 0.5:
        errs.append(f"integrated loudness {qm['I']}")
    if qm['TP'] > -1.0:
        errs.append(f"true peak {qm['TP']} dBTP > -1")
    if fails:
        errs.append('effects masking speech: ' + ', '.join(fails))
    if errs:
        raise SystemExit('FAILED: ' + '; '.join(errs))
    print('ok: -16 LUFS +-0.5, true peak <= -1 dBTP, no effect on a syllable')


if __name__ == '__main__':
    main()
