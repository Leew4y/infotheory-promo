// The title over the style's full-frame background, centred on the frame (landscape or portrait).
import { text, label, plate, backdrop, C, F, scene, clamp, eout, sstep, W, H } from '../../../engine';

scene({
  name: 'title', kind: 'plate', dur: 6, fi: 1.0, fo: 0.8, mb: 3,
  subs: [],
  cam: (lt, d) => ({ z: 1 + (0.03 * lt) / d }),
  draw(lt) {
    plate({ time: lt, progress: 0.4, highlight: 0.1 });
    const a = sstep(0.8, 2.0, lt);
    const y = H / 2 - 20;
    backdrop(W / 2, y + 60, Math.min(1400, W - 80), 360, a);
    const rise = (1 - eout(clamp((lt - 0.8) / 1.2))) * 16;
    text('新片标题', W / 2, y + rise, { size: 120, weight: 500, color: C.fgOnDark, alpha: a, align: 'center', ls: 24 });
    text('A one-line promise of what this film shows', W / 2, y + 80, { font: F.latin, style: 'italic', size: 28, color: C.mutedOnDark, alpha: sstep(1.8, 2.8, lt), align: 'center' });
    label('2026 · Hackathon demo', W / 2, y + 140, sstep(2.2, 2.8, lt), C.mutedOnDark, 16, 'center');
  },
});
