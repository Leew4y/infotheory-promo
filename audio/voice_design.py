"""Design voice prompts from text descriptions with Qwen3-TTS VoiceDesign (MLX, Apple silicon).

    python audio/voice_design.py <job.json>      (scripts/voice-design.ts runs it in .cache/voice-design/venv)

job.json: { "model_dir": <local snapshot of the pinned model>, "text": <what each clip says>, "language": "Chinese",
            "seed": <int>, "out": <directory>, "candidates": { "<key>": "<description>", ... } }

Writes <out>/<key>.wav (16-bit mono at the model's rate) and prints one JSON object per candidate to stdout:
{ "key", "file", "rate", "seconds", "f0" } where f0 is the median pitch of voiced 10 ms frames in Hz (normalised
autocorrelation over 40 ms windows, 60-500 Hz, frames louder than 3 % of the peak and correlation above 0.5). Model logs
go to stderr.
"""
import json
import sys

import mlx.core as mx
import numpy as np
from scipy.io import wavfile
from mlx_audio.tts.utils import load_model


def median_f0(x, rate, fmin=60.0, fmax=500.0):
    n, hop = int(0.04 * rate), int(0.01 * rate)
    lo, hi = int(rate / fmax), int(rate / fmin)
    peak = float(np.max(np.abs(x))) or 1.0
    f0 = []
    for i in range(0, len(x) - n, hop):
        w = x[i:i + n] * np.hanning(n)
        if np.sqrt(np.mean(w ** 2)) < 0.03 * peak:
            continue
        ac = np.correlate(w, w, 'full')[n - 1:]
        ac /= ac[0] + 1e-9
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] > 0.5:
            f0.append(rate / k)
    return round(float(np.median(f0)), 1) if f0 else None


def main():
    with open(sys.argv[1], encoding='utf-8') as f:
        job = json.load(f)
    model = load_model(job['model_dir'])
    rate = int(getattr(model, 'sample_rate', 24000))
    for key, description in job['candidates'].items():
        mx.random.seed(int(job['seed']))
        parts = [np.array(r.audio, dtype=np.float32) for r in
                 model.generate_voice_design(text=job['text'], language=job['language'], instruct=description)]
        audio = np.concatenate(parts)
        path = f"{job['out']}/{key}.wav"
        wavfile.write(path, rate, (np.clip(audio, -1, 1) * 32767).astype(np.int16))
        print(json.dumps({'key': key, 'file': path, 'rate': rate, 'seconds': round(len(audio) / rate, 2),
                          'f0': median_f0(audio, rate)}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
