"""Energy envelope of one committed narration line of grow1, to find where a word starts inside a speech span.

    python envelope.py <line id> [from_s to_s]

Decodes films/grow1/narration/<id>.flac with ffmpeg (16 kHz mono), prints the RMS level in dB every 10 ms (line
seconds), with a bar, between from_s and to_s (default: the whole line), and the local minima (dips between syllables).
"""
import subprocess, sys
import numpy as np

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
lid = sys.argv[1]
a = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
b = float(sys.argv[3]) if len(sys.argv) > 3 else 99.0
src = rf'D:\promo-films-light\films\grow1\narration\{lid}.flac'
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True).stdout
x = np.frombuffer(raw, np.int16).astype(np.float64) / 32768
hop, win = 160, 400
n = (len(x) - win) // hop
rms = np.array([np.sqrt(np.mean(x[i * hop:i * hop + win] ** 2) + 1e-12) for i in range(n)])
db = 20 * np.log10(rms)
sm = np.convolve(db, np.ones(3) / 3, mode='same')
t = (np.arange(n) * hop + win / 2) / 16000
for i in range(n):
    if a <= t[i] <= b:
        dip = ' <dip' if 0 < i < n - 1 and sm[i] < sm[i - 1] and sm[i] <= sm[i + 1] and sm[i] < -25 else ''
        print(f'{t[i]:6.2f} {db[i]:6.1f} ' + '#' * max(0, int((db[i] + 60) / 1.5)) + dip)
