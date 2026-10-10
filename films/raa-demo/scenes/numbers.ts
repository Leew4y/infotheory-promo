// The size of the collection, checked against the site's reports.json (152 reports, 10 categories).
import { planScene, copy, background, text, rule, C, F, M, sstep, eout, clamp } from '../../../engine';

planScene('numbers', {
  draw(lt) {
    background();
    const a = sstep(0.5, 1.3, lt), rise = (1 - eout(clamp((lt - 0.5) / 1.0))) * 12;
    text(copy('numbers', 'count'), M, 560 + rise, { font: F.latin, size: 260, weight: 600, color: C.accent, alpha: a });
    text(copy('numbers', 'unit'), M + 520, 540, { size: 64, color: C.fg, alpha: sstep(0.9, 1.7, lt) });
    rule(M, 640, M + 760, 640, C.muted, sstep(1.4, 2.2, lt), 1.5);
    text(copy('numbers', 'detail'), M, 700, { size: 34, color: C.muted, alpha: sstep(1.6, 2.4, lt), ls: 2 });
  },
});
