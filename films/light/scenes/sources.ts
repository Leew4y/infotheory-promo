// 11. The references page (no chapter, no captions): one entry for each work in the source table of script.md (rows
// citing the same work share an entry; the film's own conversion has none), in order of publication year, in two
// columns: year, author, title or journal with volume, pages. The years are publication years (Rømer 1677, Michelson
// 1927, Evenson et al. 1973), not the years the captions name. Titles appear only where the table gives them; the 1983
// resolution is cited from the BIPM website, without a page. The SI Brochure, 9th ed., is a separate work (BIPM) and
// has its own last entry, without a year, because the table gives none. The film fades out at the end of this page.
import { ctx, text, measure, label, rule, background, C, F, M, W, scene, clamp, eout, sstep, bars } from '../../../engine';

interface Ref {
  yr: string;
  who: string;
  /** Muted remark after the author on the first line. */
  note?: string;
  /** Second line: the work, volume and pages. In note and work, *...* marks a book or journal title (italic). */
  work: string;
}

const REFS: Ref[] = [
  { yr: '1638', who: 'Galileo', note: 'Leida, First Day', work: '*Discorsi e dimostrazioni matematiche*  ·  pp. 43–44' },
  { yr: '1677', who: 'Rømer', note: 'translated from *Journal des Sçavans*, 1676', work: '*Phil. Trans.* 12, no. 136  ·  pp. 893–894' },
  { yr: '1690', who: 'Huygens', note: 'Leiden, ch. 1', work: '*Traité de la lumière*  ·  pp. 8–9' },
  { yr: '1728', who: 'Bradley', work: '*Phil. Trans.* 35, no. 406  ·  pp. 652–653' },
  { yr: '1849', who: 'Fizeau', work: '*Comptes rendus* 29  ·  p. 92' },
  { yr: '1856', who: 'Weber & Kohlrausch', work: '*Annalen der Physik und Chemie* 99  ·  pp. 10–25' },
  { yr: '1862', who: 'Foucault', work: '*Comptes rendus* 55  ·  pp. 502, 796' },
  { yr: '1862', who: 'Maxwell', work: '*Phil. Mag.* 4th ser. 23  ·  p. 22' },
  { yr: '1865', who: 'Maxwell', work: '*Phil. Trans.* 155  ·  p. 499' },
  { yr: '1927', who: 'Michelson', note: 'assisted by F. Pearson', work: '*ApJ* 65  ·  pp. 1, 3, 13' },
  { yr: '1973', who: 'Evenson, Wells, Petersen, Danielson, Day', work: '*Appl. Phys. Lett.* 22  ·  pp. 192–195' },
  { yr: '1975', who: '15th CGPM', note: 'proceedings', work: 'Resolutions 1, 2, p. 103  ·  CCDM report, pp. 68–69' },
  { yr: '1983', who: '17th CGPM', work: 'Resolution 1  ·  BIPM website' },
  { yr: '', who: 'BIPM', work: '*SI Brochure*, 9th ed.' },
];

/** Columns: left at the margin, right at XR; rows on a common grid so the two columns line up. */
const XR = 990, Y0 = 292, PITCH = 102, LINE2 = 38, INDENT = 86, PER_COL = 7;
/** Entry i starts to appear at T0 + i * STEP. */
const T0 = 1.0, STEP = 0.5;

/** Width of a Latin run in the given size, weight and style (italic runs are narrower than roman ones). */
function width(s: string, size: number, weight = 400, style = ''): number {
  ctx.save();
  ctx.font = `${style} ${weight} ${size}px ${F.latin}`;
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

/** A 24 px Latin line from x, titles (between asterisks) in italic, the rest in roman. */
function runs(s: string, x: number, y: number, color: string, a: number): void {
  s.split('*').forEach((part, i) => {
    if (!part) return;
    const style = i % 2 ? 'italic' : '';
    text(part, x, y, { font: F.latin, style: style || undefined, size: 24, color, alpha: a });
    x += width(part, 24, 400, style);
  });
}

/** One reference: year in the left gutter; author (and remark) on the first line; work and pages on the second. */
function entry(r: Ref, x: number, y: number, a: number): void {
  if (a <= 0.002) return;
  const xi = x + INDENT;
  if (r.yr) text(r.yr, x, y, { font: F.mono, size: 26, color: C.accent, alpha: a });
  text(r.who, xi, y, { font: F.latin, size: 27, weight: 600, color: C.fg, alpha: a });
  if (r.note) runs(r.note, xi + width(r.who, 27, 600) + 18, y, C.muted, a);
  runs(r.work, xi, y + LINE2, C.fg2, a);
}

scene({
  name: 'sources', kind: 'page', dur: bars(4) + 4, fo: 2.4, mb: 3,
  subs: [],
  sfx: [[0.1, 'page'], [T0 + PER_COL * STEP, 'tone', { midi: 64 }], [T0 + (REFS.length - 1) * STEP + 0.4, 'chime', { midi: 76 }]],
  // a still camera: small text on a page meant to be read
  cam: () => ({ z: 1 }),
  draw(lt) {
    background();
    // the title, set like the other pages' statements: a short cyan bar, the line slides in from the left
    const kt = eout(clamp((lt - 0.3) / 0.7));
    rule(M - 26, 128, M - 26, 128 + 42 * kt, C.accent, kt, 3);
    const dx = (1 - kt) * -18, zw = measure('参考文献', 50, F.body, 600, 2), ae = sstep(0.6, 1.2, lt);
    text('参考文献', M + dx, 166, { size: 50, weight: 600, color: C.fg, alpha: kt, ls: 2 });
    text('·', M + dx + zw + 24, 166, { font: F.latin, size: 40, color: C.fg2, alpha: ae, align: 'center' });
    // the English name in small mono capitals, as the chapter label sets it next to the Chinese one
    label('Sources', M + dx + zw + 48, 164, ae, C.accent, 28);
    const kr = eout(clamp((lt - 0.6) / 1.0));
    rule(M, 212, M + (W - 2 * M) * kr, 212, C.rule, kr, 1.5);
    // the entries, one by one: down the left column, then down the right
    REFS.forEach((r, i) => {
      const col = Math.floor(i / PER_COL), row = i % PER_COL;
      const t = T0 + i * STEP, k = eout(clamp((lt - t) / 0.6));
      entry(r, (col ? XR : M) + (1 - k) * -14, Y0 + row * PITCH, sstep(t, t + 0.6, lt));
    });
  },
});
