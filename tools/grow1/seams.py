"""Look for seams where the vertical cut's bands meet the picture (rows PIC_Y and PIC_Y + PIC_H of vertical.py), on
grid paper: the grid's own lines are not seams, so they are found and left out, and the grid itself is checked across
each joint.

    python seams.py <vertical.mp4> [step]

For every step-th frame (luma as ffmpeg's gray, 0..255), at both joints:
  - paper: the row profile (mean of each row's values between its 20th and 80th percentile) of rows PIC_Y - 80 ..
    PIC_Y + 60 (and the same round the bottom joint); rows on a horizontal grid line (more than 1.2 levels under the
    running median over 15 rows) and 2 rows either side of them are left out; the largest step between neighbouring
    paper rows (at most 4 rows apart) within 6 rows of the joint, against the largest elsewhere in those 140 rows,
    over all columns and per 120-px column block (a seam over part of the width; blocks with a drawing left out);
  - horizontal grid lines: the dips of the row profile over the clear columns right of x 936 (centre of darkness),
    their spacings, and how far a spacing that crosses the joint or the feather's inner edge (28 rows inside) is off
    the median spacing of the window;
  - vertical grid lines: the column profile of the band 24-36 rows outside the joint against the picture 40-52 rows
    inside it (columns more than 20 levels under the paper, a drawing, left out); the shift of the best match
    (cross-correlation, parabolic peak, -3..3 px).
Prints the medians and the worst frames of each.
"""
import subprocess
import sys

import numpy as np
from scipy.ndimage import median_filter

VID = sys.argv[1]
STEP = int(sys.argv[2]) if len(sys.argv) > 2 else 3
W, H, PIC_Y, PIC_H, FEATHER, STRIP_X0 = 1080, 1920, 610, 608, 28, 936
EDGES = {'top': PIC_Y, 'bottom': PIC_Y + PIC_H}


def tmean(x, axis):
    """Mean of the values between the 20th and 80th percentile (grain, fibre, grid lines and drawings drop out)."""
    lo, hi = np.percentile(x, [20, 80], axis=axis, keepdims=True)
    m = (x >= lo) & (x <= hi)
    return (x * m).sum(axis=axis) / np.maximum(m.sum(axis=axis), 1)


def paper_steps(win, yj):
    """Steps between neighbouring paper rows (rows on a grid line and 2 either side left out), as (largest within 6
    rows of the joint, largest elsewhere in the window), over all columns and per 120-px block (blocks more than 10
    levels off the row, a drawing, left out)."""
    rows = tmean(win, 1)
    line = rows < median_filter(rows, size=15, mode='nearest') - 1.2
    bad = np.zeros_like(line)
    for i in np.nonzero(line)[0]:
        bad[max(0, i - 2):i + 3] = True
    keep = np.nonzero(~bad)[0]
    pairs = [(a, b) for a, b in zip(keep[:-1], keep[1:]) if b - a <= 4]
    blocks = np.stack([tmean(win[:, x:x + 120], 1) for x in range(0, W // 120 * 120, 120)], axis=1)
    off = np.abs(blocks - rows[:, None]) > 10
    near = lambda a, b: abs((a + b) / 2 - yj) <= 6
    out = []
    for want in (True, False):
        pp = [(a, b) for a, b in pairs if near(a, b) == want]
        s_all = max([abs(rows[b] - rows[a]) for a, b in pp] or [0.0])
        s_blk = max([float(np.abs(np.where(off[a] | off[b], 0, blocks[b] - blocks[a])).max()) for a, b in pp] or [0.0])
        out += [float(s_all), s_blk]
    return out


def hlines(f, yj):
    """Dips of the clear strip's row profile around the joint; the largest deviation from the window's median spacing
    of a spacing that crosses the joint or the feather's inner edge."""
    r0, r1 = yj - 200, yj + 200
    prof = np.median(f[r0:r1, STRIP_X0:W - 2], axis=1)
    d = median_filter(prof, size=15, mode='nearest') - prof
    cs = []
    for i in range(1, len(d) - 1):
        if d[i] >= d[i - 1] and d[i] > d[i + 1] and d[i] > 2.5:
            w = np.clip(d[i - 1:i + 2], 0, None)
            cs.append(r0 + i - 1 + float((np.arange(3) * w).sum() / w.sum()))
    if len(cs) < 4:
        return float('nan'), float('nan')
    sp = np.diff(cs)
    P = float(np.median(sp))
    inner = (yj + FEATHER, yj - FEATHER)
    dev = [abs(b - a - P) for a, b in zip(cs[:-1], cs[1:]) if a < yj <= b or any(a < z <= b for z in inner)]
    return (max(dev) if dev else float('nan')), P


def vshift(f, yj, side):
    rb = (yj - 36, yj - 24) if side == 'top' else (yj + 24, yj + 36)
    rp = (yj + 40, yj + 52) if side == 'top' else (yj - 52, yj - 40)
    out = []
    for r in (rb, rp):
        p = np.median(f[r[0]:r[1]], axis=0)
        out.append(median_filter(p, size=31, mode='nearest') - p)    # darkness of lines
    a, b = out
    ok = (a < 20) & (b < 20)
    a, b = np.where(ok, a, 0), np.where(ok, b, 0)
    cc = [float((np.roll(a, s) * b).sum()) for s in range(-3, 4)]
    i = int(np.argmax(cc))
    off = 0.0
    if 0 < i < 6:
        den = cc[i - 1] - 2 * cc[i] + cc[i + 1]
        off = 0.5 * (cc[i - 1] - cc[i + 1]) / den if den else 0.0
    return -(i - 3 + off)


cmd = ['ffmpeg', '-v', 'error', '-i', VID, '-vf', f"select=not(mod(n\\,{STEP})),format=gray", '-fps_mode', 'passthrough',
       '-f', 'rawvideo', '-']
p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
res = {k: [] for k in EDGES}
i = 0
while True:
    buf = p.stdout.read(W * H)
    if len(buf) < W * H:
        break
    f = np.frombuffer(buf, np.uint8).reshape(H, W).astype(np.float32)
    for k, y in EDGES.items():
        j_all, j_blk, e_all, e_blk = paper_steps(f[y - 80:y + 60], 80)
        hdev, P = hlines(f, y)
        res[k].append((i * STEP, j_all, j_blk, hdev, P, vshift(f, y, k), e_all, e_blk))
    i += 1
p.wait()
if not any(res.values()):
    sys.exit(f'could not read {VID}')
for k, v in res.items():
    a = np.array([r[1:] for r in v], np.float64)
    print(f'{k} joint (y {EDGES[k]}), {len(v)} frames:')
    print(f'  paper, step between neighbouring paper rows within 6 rows of the joint: median {np.median(a[:, 0]):.2f},'
          f' max {a[:, 0].max():.2f} (elsewhere in the 140 rows: median {np.median(a[:, 5]):.2f}, max {a[:, 5].max():.2f});'
          f' per 120-px block median {np.median(a[:, 1]):.2f}, max {a[:, 1].max():.2f} (elsewhere: median'
          f' {np.median(a[:, 6]):.2f}, max {a[:, 6].max():.2f}) levels')
    print(f'  horizontal grid lines: spacing {np.nanmedian(a[:, 3]):.3f} px; spacing across the joint / feather edge off'
          f' it by median {np.nanmedian(a[:, 2]):.3f}, max {np.nanmax(a[:, 2]):.3f} px')
    print(f'  vertical grid lines: band against picture shift median {np.median(a[:, 4]):+.3f}, largest'
          f' {a[np.argmax(np.abs(a[:, 4])), 4]:+.3f} px')
    for r in sorted(v, key=lambda r: -r[2])[:5]:
        print(f'   frame {r[0]:5d} ({r[0] / 30:6.2f} s): paper step {r[1]:.2f}, block step {r[2]:.2f},'
              f' h-line spacing off {r[3]:.3f} px, v-line shift {r[5]:+.3f} px')
