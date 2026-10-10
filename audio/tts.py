"""Text-to-speech adapter for narration (scripts/narrate.ts runs it; one process per run, the model loaded once).

    python audio/tts.py <job.json>

job.json: { "backend": "fake" | "cosyvoice3", "model_dir": ..., "src_dir": ... (cosyvoice3),
            "voice": { "wav": <prompt wav>, "text": <its transcript> },
            "lines": [ { "id", "read", "seed", "out" } ] }

Each line's reading is synthesized and written to `out` as a 16-bit mono WAV at the backend's sample rate, with the
silence before and after the speech trimmed (frames of 10 ms below -45 dBFS RMS; 30 ms kept on each side), so a
line's placement in the film is where its speech starts. One JSON object per line goes to stdout:
{ "id", "out", "rate", "samples" }. Everything else (model logs) goes to stderr.

Backends:
  fake        standard library only, any Python: a deterministic speech-like noise burst of 0.2 s per character of
              the reading (whitespace excluded) at 24 kHz, -18 dBFS RMS, seeded by the line's seed. For tests.
  cosyvoice3  Fun-CosyVoice3-0.5B (zero-shot from the voice prompt), imported only here; needs the TTS environment
              (just tts-setup). Seeded per line (set_all_random_seed); the yielded segments of one line are joined.
              No text normaliser: CosyVoice would otherwise use ttsfrd or wetext, whose resources wetext downloads at
              run time without a pinned revision (and silently falls back to none when that fails). Both are blocked,
              so only the pinned CosyVoice code shapes the text; numbers, versions and amounts are written out in each
              line's reading (narration.json "read").

The top level imports only the standard library, so the fake backend runs anywhere.
"""
import json
import math
import os
import random
import struct
import sys
import wave

ADAPTER_VERSION = 2
FAKE_RATE = 24000
FAKE_SECONDS_PER_CHAR = 0.2
TRIM_DB = -45.0
TRIM_KEEP = 0.03


def trim(samples, rate):
    """Indices [a, b) of the speech in a float sample list: 10 ms frames above TRIM_DB RMS, with TRIM_KEEP around."""
    n = max(1, rate // 100)
    floor = 10 ** (TRIM_DB / 20)
    loud = [i for i in range(0, len(samples), n)
            if math.sqrt(sum(x * x for x in samples[i:i + n]) / len(samples[i:i + n])) > floor]
    if not loud:
        raise SystemExit('tts: a line came out silent')
    keep = int(TRIM_KEEP * rate)
    return max(0, loud[0] - keep), min(len(samples), loud[-1] + n + keep)


def write_wav(path, samples, rate):
    """16-bit mono WAV, written to a temporary name and renamed into place."""
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    tmp = f'{path}.{os.getpid()}.tmp'
    pcm = b''.join(struct.pack('<h', max(-32767, min(32767, int(round(x * 32767))))) for x in samples)
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    os.replace(tmp, path)


def fake_backend(job):
    def synth(read, seed):
        rng = random.Random(seed)
        chars = sum(1 for c in read if not c.isspace())
        n = round(FAKE_SECONDS_PER_CHAR * chars * FAKE_RATE)
        out, lp = [], 0.0
        for i in range(n):
            t = i / FAKE_RATE
            lp += 0.35 * (rng.uniform(-1, 1) - lp)  # band-limited noise
            env = 0.75 + 0.25 * math.cos(2 * math.pi * 4 * t)  # syllable-rate swell, never silent
            edge = min(1.0, i / (0.005 * FAKE_RATE), (n - 1 - i) / (0.005 * FAKE_RATE) + 1e-9)
            out.append(lp * env * edge)
        rms = math.sqrt(sum(x * x for x in out) / max(1, len(out))) or 1.0
        g = 10 ** (-18 / 20) / rms
        return [x * g for x in out], FAKE_RATE
    return synth


def cosyvoice3_backend(job):
    src = job['src_dir']
    sys.path[:0] = [src, os.path.join(src, 'third_party', 'Matcha-TTS')]
    # block the text normalisers (see the docstring): an import of either fails, and CosyVoice runs without one
    sys.modules['ttsfrd'] = None
    sys.modules['wetext'] = None
    import torch  # noqa: E402  (the TTS environment)
    from cosyvoice.cli.cosyvoice import AutoModel
    from cosyvoice.utils.common import set_all_random_seed
    # GPU memory on a 6 GB laptop GPU (beside the desktop): every checkpoint is read into CPU memory and copied into
    # the parameters (CosyVoice maps them straight to the GPU, holding a second copy while loading, which ran out of
    # memory). fp32: fp16 also fits but was ~4x slower here (RTF 5-9 against 1.2-2.0, RTX 3060 Laptop, 2026-10-10).
    load = torch.load
    torch.load = lambda *a, **k: load(*a, **{**k, 'map_location': 'cpu'})
    try:
        model = AutoModel(model_dir=job['model_dir'], fp16=False)
    finally:
        torch.load = load
    if model.frontend.text_frontend != '':
        raise SystemExit(f'tts: expected no text normaliser, CosyVoice loaded {model.frontend.text_frontend!r}')
    prompt = 'You are a helpful assistant.<|endofprompt|>' + job['voice']['text']

    def synth(read, seed):
        set_all_random_seed(seed)
        parts = [o['tts_speech'] for o in model.inference_zero_shot(read, prompt, job['voice']['wav'], stream=False)]
        if not parts:
            raise SystemExit(f'tts: cosyvoice3 produced nothing for "{read}"')
        audio = torch.cat(parts, dim=1)[0].float().cpu().numpy()
        return audio.tolist(), int(model.sample_rate)
    return synth


BACKENDS = {'fake': fake_backend, 'cosyvoice3': cosyvoice3_backend}


def main():
    if len(sys.argv) != 2:
        raise SystemExit('usage: python audio/tts.py <job.json>')
    with open(sys.argv[1], encoding='utf-8') as f:
        job = json.load(f)
    if job.get('backend') not in BACKENDS:
        raise SystemExit(f"tts: unknown backend {job.get('backend')!r} (one of {', '.join(BACKENDS)})")
    synth = BACKENDS[job['backend']](job)
    for line in job['lines']:
        samples, rate = synth(line['read'], int(line['seed']))
        a, b = trim(samples, rate)
        write_wav(line['out'], samples[a:b], rate)
        print(json.dumps({'id': line['id'], 'out': line['out'], 'rate': rate, 'samples': b - a}), flush=True)


if __name__ == '__main__':
    main()
