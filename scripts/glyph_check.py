"""
Glyph sanity check of CJK fonts on a film's character set, run by scripts/fonts.ts (and scripts/glyph-check.ts) through
the pinned fontTools. Pure Python: outlines are flattened and filled with the nonzero rule on a grid of GRID pixels per
em, so the checks see what a renderer draws, not what the cmap promises. A variable font is drawn at wght 400 (the
default instances of Noto Sans SC / Noto Serif SC are 100 / 200, which nothing renders).

    python -I glyph_check.py <job.json>

job.json: {"text": "<characters>", "fonts": [{"id": ..., "path": ..., "ref": <path of the reference CJK face>}]}
Prints one JSON object: {"fonts": [{"id", "checked": {...}, "stats": {...}, "findings": [...]}]}; a finding is
{"check", "level": "error" | "warning", "chars", "message"}.

Checks, on the characters of the text that the font maps. The thresholds were set on the six CJK faces of
fonts/catalog.json and the two Noto faces (all 6763 GB2312 hanzi plus the characters of the films); the measured
margins are next to each constant.
  twin   two distinct CJK unified ideographs drawn alike: mapped to one glyph; or outlines with the same number of
         contours and bounding boxes within TWIN_BOX of the em whose inked pixels differ by less than TWIN_SAME, or by
         less than TWIN_XOR and less than TWIN_REL times as much as the same two characters in the reference face
         (the reference draws them clearly apart, this face does not). The other character is looked for among the
         6763 GB2312 hanzi and the text. Error: a reader sees one character for the other (ZCOOL XiaoWei draws 己
         like 巳, 熹 like 喜, 锛 like 钡, 莨 like 茛).
  ink    an ideograph that inks what should be empty. Error when (1) the nonzero rule fills a connected region twice
         over more than FILLED of the em square: a counter whose contour winds the same way as the one around it, so
         it is filled (ZCOOL XiaoWei's 回 and 蛔); or (2) its share of its bounding box is an outlier for the font
         (robust z > FILL_Z and > FILL_RATIO x the median, over the text's ideographs and 470 GB2312 hanzi): a solid
         block; or (3) it has no ink. Warning: ideographs that do not advance by one em (a looser or tighter grid).
  punct  CJK punctuation against the reference face (Noto Serif SC for serif faces, else Noto Sans SC): an advance
         narrower than PUNCT_NARROW of the reference's; the ink centre moved by more than PUNCT_SHIFT (of the advance
         across, of the em up or down); a different number of enclosed counters. Errors: a narrow advance of a
         full-width code point (U+3001-303E, U+FF01-FF60; it breaks the em grid of every line), and a full-width mark
         with fewer counters than the reference (。 filled like a Latin period). Everything else is a warning: TC
         and HK conventions centre ，。, display faces vary, and some good CJK fonts draw “”‘’…—· narrow.
"""
import itertools
import json
import math
import statistics
import sys

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont

GRID = 64            # raster pixels per em
WGHT = 400           # instance of a variable font
TWIN_BOX = 0.02      # twin candidates: same contour count, every bbox side within 2 % of the em
TWIN_COARSE = 0.3    # ... and 16-per-em masks differing in under 30 % of their pixels (a cheap pre-filter)
TWIN_SAME = 0.02     # copies; the closest pair of Noto Sans SC is 汨/汩 at 9 %, of Noto Serif SC above 12 %
TWIN_XOR = 0.08      # ZCOOL XiaoWei: 锛/钡 1.0 %, 己/巳 3.2 %, 熹/喜 4.6 %, 亓/开 5.5 %, 莨/茛 6.8 % (reference 16-78 %);
TWIN_REL = 0.5       # its 木/本, 江/汪 (9.5 %, reference 36-60 %) are drawn apart and are not reported
FILLED = 0.05        # of the em (205 px at 64/em); ZCOOL XiaoWei's eight filled counters (回 圃 圊 圄 崮 徊 痼 蛔) 18-37 %;
                     # stroke overlaps at wght 400: Noto Sans SC 63 px (概), Noto Serif SC 39 px (郴), the other faces 0-1 px
FILL_Z = 10.0        # boxes at least 0.4 em on both sides; ZCOOL XiaoWei 回 z 12.0 / 2.5 x the median;
FILL_RATIO = 2.2     # largest legitimate values: Zhi Mang Xing 日 z 8.3 / 1.8 x, Noto Serif SC 蠼 z 4.5
PUNCT_NARROW = 0.75
PUNCT_SHIFT = 0.2
ADVANCE_TOL = 0.01
MIN_HOLE = 2         # enclosed background regions smaller than this many pixels are raster noise


def unified(cp):
    """CJK unified ideographs (not compatibility ideographs, not radicals: those share glyphs by design)."""
    return 0x3400 <= cp <= 0x4DBF or 0x4E00 <= cp <= 0x9FFF or 0x20000 <= cp <= 0x2A6DF or 0x2A700 <= cp <= 0x2EBEF or 0x30000 <= cp <= 0x323AF


AMBIGUOUS = set(map(ord, '·—―‘’“”‥…・'))


def fullwidth(cp):
    """CJK symbols and punctuation (without the combining tone marks U+302A-302F and the half fill space U+303F),
    and the fullwidth punctuation of U+FF01-FF60: East Asian Width W or F."""
    return (0x3001 <= cp <= 0x3029 or 0x3030 <= cp <= 0x303E or 0xFF01 <= cp <= 0xFF0F or 0xFF1A <= cp <= 0xFF20
            or 0xFF3B <= cp <= 0xFF40 or 0xFF5B <= cp <= 0xFF60)


def punct(cp):
    return fullwidth(cp) or cp in AMBIGUOUS


def gb2312(level1_only=False):
    """The GB2312 hanzi in code order (level 1: rows 16-55, 3755 characters; level 2: rows 56-87)."""
    out = []
    for row in range(0xB0, 0xD8 if level1_only else 0xF8):
        for col in range(0xA1, 0xFF):
            try:
                out.append(bytes([row, col]).decode('gb2312'))
            except UnicodeDecodeError:
                pass
    return out


def u(ch):
    return f'{ch} U+{ord(ch):04X}'


class FlattenPen(BasePen):
    """Contours as point lists in font units, curves cut into short lines (BasePen decomposes components)."""

    def __init__(self, glyphSet, step):
        super().__init__(glyphSet)
        self.contours, self.cur, self.step = [], None, step

    def _moveTo(self, p):
        self.cur = [p]

    def _lineTo(self, p):
        self.cur.append(p)

    def _n(self, *pts):
        return max(2, min(24, int(sum(math.dist(a, b) for a, b in zip(pts, pts[1:])) / self.step) + 1))

    def _qCurveToOne(self, p1, p2):
        p0 = self.cur[-1]
        n = self._n(p0, p1, p2)
        for i in range(1, n + 1):
            t = i / n
            s = 1 - t
            self.cur.append((s * s * p0[0] + 2 * s * t * p1[0] + t * t * p2[0], s * s * p0[1] + 2 * s * t * p1[1] + t * t * p2[1]))

    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur[-1]
        n = self._n(p0, p1, p2, p3)
        for i in range(1, n + 1):
            t = i / n
            s = 1 - t
            a, b, c, d = s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t
            self.cur.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))

    def _closePath(self):
        if self.cur and len(self.cur) > 2:
            self.contours.append(self.cur)
        self.cur = None

    _endPath = _closePath


class Face:
    def __init__(self, path):
        self.font = TTFont(path)
        self.upem = self.font['head'].unitsPerEm
        self.cmap = self.font.getBestCmap()
        self.rev = {}
        for cp, g in self.cmap.items():
            self.rev.setdefault(g, []).append(cp)
        axes = {a.axisTag: a for a in self.font['fvar'].axes} if 'fvar' in self.font else {}
        if 'wght' in axes:
            a = axes['wght']
            self.location = {'wght': min(max(WGHT, a.minValue), a.maxValue)}
            self.gs = self.font.getGlyphSet(location=self.location)
        else:
            self.location = None
            self.gs = self.font.getGlyphSet()
        os2 = self.font['OS/2']
        asc, desc = os2.sTypoAscender, os2.sTypoDescender
        if asc - desc <= 0:
            asc, desc = self.font['hhea'].ascent, self.font['hhea'].descent
        self.asc, self.desc = asc, desc
        self.px = self.upem / GRID
        self._outline, self._coarse = {}, {}

    def advance(self, g):
        return self.gs[g].width

    def outline(self, g):
        if g not in self._outline:
            pen = FlattenPen(self.gs, self.px / 2)
            self.gs[g].draw(pen)
            self._outline[g] = pen.contours
        return self._outline[g]

    def box(self, g):
        pts = [p for c in self.outline(g) for p in c]
        if not pts:
            return None
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        return min(xs), min(ys), max(xs), max(ys)

    def raster(self, g, box, scale=1):
        """Rows (bottom up) of int bit masks over `box` at GRID/scale per em: bit i is set if pixel i's centre is inside
        (nonzero rule). Also the rows where the winding number is 2 or more (a region filled twice)."""
        x0, y0, x1, y1 = box
        s = self.px * scale
        w, h = int(math.ceil((x1 - x0) / s)) + 1, int(math.ceil((y1 - y0) / s)) + 1
        edges = []
        for c in self.outline(g):
            n = len(c)
            for k in range(n):
                (xa, ya), (xb, yb) = c[k], c[(k + 1) % n]
                ya, yb, xa, xb = (ya - y0) / s, (yb - y0) / s, (xa - x0) / s, (xb - x0) / s
                if ya == yb:
                    continue
                wind = 1 if yb > ya else -1
                if ya > yb:
                    xa, ya, xb, yb = xb, yb, xa, ya
                edges.append((ya, yb, xa, (xb - xa) / (yb - ya), wind))
        edges.sort()
        rows, twice, active, ei = [], [], [], 0
        for j in range(h):
            yc = j + 0.5
            while ei < len(edges) and edges[ei][0] <= yc:
                active.append(edges[ei])
                ei += 1
            active = [e for e in active if e[1] > yc]
            xs = sorted((e[2] + (yc - e[0]) * e[3], e[4]) for e in active)
            row, row2, wind = 0, 0, 0
            for k in range(len(xs) - 1):
                wind += xs[k][1]
                if wind:
                    i0, i1 = max(0, math.ceil(xs[k][0] - 0.5)), min(w, math.ceil(xs[k + 1][0] - 0.5))
                    if i1 > i0:
                        bits = ((1 << (i1 - i0)) - 1) << i0
                        row |= bits
                        if abs(wind) >= 2:
                            row2 |= bits
            rows.append(row)
            twice.append(row2)
        return rows, twice, w, h

    def coarse(self, g):
        """16-per-em mask over a fixed em-sized box (one int), for the twin pre-filter."""
        if g not in self._coarse:
            rows, _, w, _ = self.raster(g, (0, self.desc, self.upem, self.desc + self.upem), GRID // 16)
            m = 0
            for j, r in enumerate(rows[:16]):
                m |= (r & 0xFFFF) << (16 * j)
            self._coarse[g] = m
        return self._coarse[g]


def components(rows, w, h, diagonal):
    """Sizes of the connected regions of set bits (8-connected if diagonal, else 4-connected)."""
    cells = {(i, j) for j, r in enumerate(rows) for i in range(w) if r >> i & 1}
    steps = [(dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if (dx or dy) and (diagonal or not (dx and dy))]
    seen, sizes = set(), []
    for c in cells:
        if c in seen:
            continue
        seen.add(c)
        stack, n = [c], 0
        while stack:
            i, j = stack.pop()
            n += 1
            for dx, dy in steps:
                q = (i + dx, j + dy)
                if q in cells and q not in seen:
                    seen.add(q)
                    stack.append(q)
        sizes.append(n)
    return sizes


def holes(rows, w, h):
    """Enclosed background regions of at least MIN_HOLE pixels (background 8-connected; outside the box is open)."""
    full = (1 << (w + 2)) - 1
    bg = [full] + [full & ~(r << 1) for r in rows] + [full]
    # flood the background from the border, then count what is left
    cells = {(i, j) for j, r in enumerate(bg) for i in range(w + 2) if r >> i & 1}
    open_, stack = set(), [(i, j) for (i, j) in cells if i in (0, w + 1) or j in (0, h + 1)]
    open_.update(stack)
    while stack:
        i, j = stack.pop()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                q = (i + dx, j + dy)
                if q in cells and q not in open_:
                    open_.add(q)
                    stack.append(q)
    inner = cells - open_
    rows_in = [0] * (h + 2)
    for i, j in inner:
        rows_in[j] |= 1 << i
    return sum(1 for n in components(rows_in, w + 2, h + 2, True) if n >= MIN_HOLE)


def signature(face, g):
    """(contours, xMin, yMin, xMax, yMax) from the glyf header without decoding the outline, else from the outline."""
    glyf = face.font['glyf'] if 'glyf' in face.font else None
    if glyf is not None:
        raw = getattr(glyf.glyphs.get(g), 'data', None)
        if raw is not None and len(raw) >= 10:
            return tuple(int.from_bytes(raw[i:i + 2], 'big', signed=True) for i in range(0, 10, 2))
        gl = glyf[g]
        return (gl.numberOfContours, gl.xMin, gl.yMin, gl.xMax, gl.yMax) if gl.numberOfContours else None
    b = face.box(g)
    return (len(face.outline(g)),) + tuple(round(v) for v in b) if b else None


def xor(face, g1, g2):
    """Pixels inked in only one of two glyphs over pixels inked in either (on their common box), or None."""
    b1, b2 = face.box(g1), face.box(g2)
    if not b1 or not b2:
        return None
    box = (min(b1[0], b2[0]), min(b1[1], b2[1]), max(b1[2], b2[2]), max(b1[3], b2[3]))
    r1, r2 = face.raster(g1, box)[0], face.raster(g2, box)[0]
    union = sum((a | b).bit_count() for a, b in zip(r1, r2))
    return sum((a ^ b).bit_count() for a, b in zip(r1, r2)) / union if union else None


def twins(face, ref, text):
    findings, reported = [], set()
    tol = TWIN_BOX * face.upem
    pool = {ord(ch) for ch in set(gb2312()) | set(text) if unified(ord(ch))}
    index, sigs = {}, {}
    for cp in sorted(pool):
        if cp in face.cmap and face.cmap[cp] not in sigs:
            g = face.cmap[cp]
            s = signature(face, g)
            if s and s[0]:
                sigs[g] = s
                index.setdefault((s[0],) + tuple(int(v // tol) for v in s[1:]), []).append(g)

    def report(ch, other, why):
        reported.add(frozenset((ord(ch), other)))
        findings.append({'check': 'twin', 'level': 'error', 'chars': ch + chr(other),
                         'message': f'{u(ch)} and {u(chr(other))} {why}: a reader sees one for the other'})

    for ch in text:
        cp = ord(ch)
        if not unified(cp) or cp not in face.cmap:
            continue
        g = face.cmap[cp]
        for other in face.rev[g]:
            if other != cp and other in pool and frozenset((cp, other)) not in reported:
                report(ch, other, f'are mapped to one glyph ({g})')
        s = sigs.get(g)
        if not s:
            continue
        k = (s[0],) + tuple(int(v // tol) for v in s[1:])
        near = {gg for d in itertools.product((-1, 0, 1), repeat=4)
                for gg in index.get((k[0],) + tuple(a + b for a, b in zip(k[1:], d)), [])}
        for gg in sorted(near):
            if gg == g or max(abs(a - b) for a, b in zip(sigs[gg][1:], s[1:])) > tol:
                continue
            c1, c2 = face.coarse(g), face.coarse(gg)
            if (c1 | c2) and (c1 ^ c2).bit_count() > TWIN_COARSE * (c1 | c2).bit_count():
                continue
            d = xor(face, g, gg)
            if d is None or d >= TWIN_XOR:
                continue
            for other in face.rev[gg]:
                if other not in pool or frozenset((cp, other)) in reported:
                    continue
                r = xor(ref, ref.cmap[cp], ref.cmap[other]) if ref is not face and cp in ref.cmap and other in ref.cmap else None
                if d < TWIN_SAME:
                    report(ch, other, f'have outlines that differ in {100 * d:.1f} % of their ink')
                elif r is not None and d < TWIN_REL * r:
                    report(ch, other, f'have outlines that differ in {100 * d:.1f} % of their ink, in the reference face {100 * r:.0f} %')
    return findings


def ink(face, text):
    findings = []
    ideo = [ch for ch in text if unified(ord(ch)) and ord(ch) in face.cmap]
    sample = sorted(set(ideo) | {ch for ch in gb2312(True)[::8] if ord(ch) in face.cmap})
    m = {}
    for ch in sample:
        g = face.cmap[ord(ch)]
        b = face.box(g)
        if not b:
            m[ch] = None
            continue
        rows, twice, w, h = face.raster(g, b)
        side = min(b[2] - b[0], b[3] - b[1]) / face.upem
        m[ch] = {'fill': sum(r.bit_count() for r in rows) / (w * h), 'side': side,
                 'twice': max(components(twice, w, h, False), default=0) if ch in ideo else 0}
    fills = [v['fill'] for v in m.values() if v and v['side'] >= 0.4]
    med = statistics.median(fills) if fills else 0
    mad = statistics.median(abs(v - med) for v in fills) if fills else 0
    limit = GRID * GRID * FILLED
    for ch in ideo:
        v = m[ch]
        if v is None:
            findings.append({'check': 'ink', 'level': 'error', 'chars': ch, 'message': f'{u(ch)} is mapped to a glyph with no ink'})
            continue
        if v['twice'] > limit:
            findings.append({'check': 'ink', 'level': 'error', 'chars': ch,
                             'message': f'{u(ch)}: {100 * v["twice"] / GRID ** 2:.0f} % of the em is filled twice (a counter wound like the contour around it, so it is filled); it inks {100 * v["fill"]:.0f} % of its box, the font\'s median is {100 * med:.0f} %'})
        elif v['side'] >= 0.4 and mad and (v['fill'] - med) / mad > FILL_Z and v['fill'] > FILL_RATIO * med:
            findings.append({'check': 'ink', 'level': 'error', 'chars': ch,
                             'message': f'{u(ch)} inks {100 * v["fill"]:.0f} % of its box, the font\'s median is {100 * med:.0f} % (robust z {(v["fill"] - med) / mad:.1f}): a solid block?'})
    adv = {}
    for ch in ideo:
        a = face.advance(face.cmap[ord(ch)]) / face.upem
        if abs(a - 1) > ADVANCE_TOL:
            adv.setdefault(round(a, 3), []).append(ch)
    for a, chs in sorted(adv.items()):
        findings.append({'check': 'ink', 'level': 'warning', 'chars': ''.join(chs[:12]),
                         'message': f'{len(chs)} of {len(ideo)} ideographs advance {a:.3f} em, not 1: Chinese set in this face runs {"looser" if a > 1 else "tighter"} than an em grid'})
    top = sorted((ch for ch in ideo if m[ch]), key=lambda c: -m[c]['fill'])[:3]
    return findings, {'sample': len(fills), 'fillMedian': round(med, 4), 'fillMad': round(mad, 4),
                      'densest': [[c, round(m[c]['fill'], 3), round((m[c]['fill'] - med) / mad, 1) if mad else None] for c in top],
                      'twiceMax': max(([m[c]['twice'], c] for c in ideo if m[c]), default=None)}


def punct_metrics(face, ch):
    g = face.cmap[ord(ch)]
    adv = face.advance(g)
    b = face.box(g)
    if b is None or adv <= 0:
        return {'adv': adv / face.upem, 'x': None, 'y': None, 'holes': 0}
    rows, _, w, h = face.raster(g, b)
    return {'adv': adv / face.upem, 'x': (b[0] + b[2]) / 2 / adv, 'y': ((b[1] + b[3]) / 2 - face.desc) / (face.asc - face.desc),
            'holes': holes(rows, w, h)}


def punct_check(face, ref, text):
    """Errors one per character; warnings one per kind, listing the characters."""
    errors, warn, n = [], {'narrow': [], 'moved': [], 'counters': []}, 0
    for ch in text:
        cp = ord(ch)
        if not punct(cp) or cp not in face.cmap or cp not in ref.cmap:
            continue
        n += 1
        t, r = punct_metrics(face, ch), punct_metrics(ref, ch)
        if t['adv'] < PUNCT_NARROW * r['adv']:
            what = f'{ch} {t["adv"]:.2f} em (reference {r["adv"]:.2f})'
            if fullwidth(cp):
                errors.append({'check': 'punct', 'level': 'error', 'chars': ch,
                               'message': f'{u(ch)} advances {t["adv"]:.2f} em, the reference face {r["adv"]:.2f} em: a full-width mark set like Latin punctuation'})
            else:
                warn['narrow'].append((ch, what))
        if t['x'] is not None and r['x'] is not None:
            dx, dy = t['x'] - r['x'], t['y'] - r['y']
            where = ([f'{"right" if dx > 0 else "left"} {abs(dx):.2f} of the advance'] if abs(dx) > PUNCT_SHIFT else []) + \
                    ([f'{"up" if dy > 0 else "down"} {abs(dy):.2f} em'] if abs(dy) > PUNCT_SHIFT else [])
            if where:
                warn['moved'].append((ch, f'{ch} {" and ".join(where)}'))
        if t['holes'] != r['holes']:
            if t['holes'] < r['holes'] and fullwidth(cp):
                errors.append({'check': 'punct', 'level': 'error', 'chars': ch,
                               'message': f'{u(ch)} has {t["holes"]} enclosed counter(s), the reference face {r["holes"]}: filled where it should be open'})
            else:
                warn['counters'].append((ch, f'{ch} {t["holes"]} (reference {r["holes"]})'))
    say = {'narrow': 'narrower than in the reference face (Latin width)',
           'moved': 'ink moved against the reference face (centred like TC / HK or Latin punctuation, or off the line)',
           'counters': 'a different number of enclosed counters than in the reference face'}
    for kind, items in warn.items():
        if items:
            errors.append({'check': 'punct', 'level': 'warning', 'chars': ''.join(c for c, _ in items),
                           'message': f'{say[kind]}: {"; ".join(w for _, w in items)}'})
    return errors, n


def main():
    job = json.load(open(sys.argv[1], encoding='utf-8'))
    text = sorted(set(job['text']))
    faces, out = {}, []

    def load(p):
        if p not in faces:
            faces[p] = Face(p)
        return faces[p]

    for f in job['fonts']:
        face, ref = load(f['path']), load(f['ref'])
        found = twins(face, ref, text)
        ink_found, stats = ink(face, text)
        punct_found, n_punct = punct_check(face, ref, text)
        n_ideo = sum(1 for ch in text if unified(ord(ch)) and ord(ch) in face.cmap)
        stats['instance'] = face.location
        out.append({'id': f['id'], 'checked': {'ideographs': n_ideo, 'punctuation': n_punct}, 'stats': stats,
                    'findings': found + ink_found + punct_found})
    # ASCII JSON: a piped stdout is encoded with the locale code page on Windows (and -I ignores PYTHONUTF8)
    print(json.dumps({'fonts': out}))


if __name__ == '__main__':
    main()
