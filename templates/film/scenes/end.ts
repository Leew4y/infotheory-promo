// The closing line on a page, then the film's name.
import { text, label, rule, background, M, C, F, scene, clamp, eout, sstep } from '../../../engine';

scene({
  name: 'end', kind: 'page', dur: 5, fi: 0.6, fo: 1.0, mb: 3,
  subs: [],
  draw(lt) {
    background();
    const a = eout(clamp((lt - 0.4) / 0.9));
    text('谢谢观看。', M, 480 + (1 - a) * 12, { size: 72, weight: 500, color: C.fg, alpha: a, ls: 6 });
    text('Thank you for watching.', M, 550, { font: F.latin, style: 'italic', size: 28, color: C.muted, alpha: sstep(1.0, 1.8, lt) });
    rule(M, 640, M + 260 * eout(clamp((lt - 1.6) / 1.0)), 640, C.accent, 1, 1.5);
    label('github.com / your-project', M, 690, sstep(2.0, 2.8, lt), C.muted, 16);
  },
});
