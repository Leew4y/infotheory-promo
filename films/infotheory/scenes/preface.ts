// 1. Preface: the question, set on paper, with four small ink drawings.
import { text, label, ink, circle, dot } from '../../../engine/draw';
import { background, M, C, F } from '../../../engine/style';
import { scene } from '../../../engine/scene';
import { clamp, eout, sstep, TAU } from '../../../engine/util';

function helix(x: number, y: number, k: number, a: number): void {
  const L: [number, number][] = [], R: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24, yy = y - 70 + u * 140, ph = u * TAU * 1.5;
    L.push([x + Math.sin(ph) * 26, yy]);
    R.push([x - Math.sin(ph) * 26, yy]);
  }
  ink(L, k, C.fg, 2, a);
  ink(R, k, C.fg, 2, a);
  for (let i = 1; i < 6; i++) {
    const u = i / 6, yy = y - 70 + u * 140, ph = u * TAU * 1.5;
    if (k > u) ink([[x + Math.sin(ph) * 26, yy], [x - Math.sin(ph) * 26, yy]], 1, C.accent, 1.5, a);
  }
}

scene({
  name: 'preface', kind: 'page', start: 5, len: 3, fi: 0.8, fo: 0.6, mb: 3,
  subs: [],
  sfx: [[0.1, 'page'], [0.8, 'ink'], [1.8, 'ink'], [2.8, 'ink'], [3.8, 'ink'], [4.4, 'tone', { midi: 64 }]],
  draw(lt) {
    background();
    label('Preface · 序', M, 132, sstep(0.2, 0.9, lt));
    const k = clamp((lt - 0.4) / 2.4);
    ['一枚硬币，一封信，', '一张照片，一段基因——'].forEach((l, i) => {
      const a = eout(clamp((k - i * 0.35) / 0.5));
      text(l, M, 420 + i * 96 + (1 - a) * 12, { size: 60, weight: 500, color: C.fg, alpha: a, ls: 4 });
    });
    const a3 = eout(clamp((lt - 4.2) / 0.8));
    text('它们有什么共同点？', M, 612 + (1 - a3) * 12, { size: 60, weight: 500, color: C.accent, alpha: a3, ls: 4 });
    text('A coin, a letter, a photograph, a strand of DNA — what do they have in common?', M, 690, { font: F.latin, style: 'italic', size: 25, color: C.muted, alpha: sstep(5, 5.8, lt) });
    // four drawings, one per line
    const ix = 1200, iy = 520;
    const k1 = clamp((lt - 0.8) / 0.8), k2 = clamp((lt - 1.8) / 0.8), k3 = clamp((lt - 2.8) / 0.8), k4 = clamp((lt - 3.8) / 1.0);
    circle(ix, iy, 62, k1);
    if (k1 > 0.99) text('1', ix, iy + 18, { font: F.latin, size: 52, color: C.accent, align: 'center' });
    const ex = ix + 190;
    ink([[ex - 70, iy - 45], [ex + 70, iy - 45], [ex + 70, iy + 45], [ex - 70, iy + 45], [ex - 70, iy - 45], [ex, iy + 10], [ex + 70, iy - 45]], k2);
    const px = ix + 380;
    ink([[px - 70, iy - 55], [px + 70, iy - 55], [px + 70, iy + 55], [px - 70, iy + 55], [px - 70, iy - 55]], k3);
    if (k3 > 0.6) ink([[px - 60, iy + 40], [px - 20, iy - 5], [px + 5, iy + 20], [px + 30, iy - 15], [px + 60, iy + 40]], clamp((k3 - 0.6) / 0.4));
    if (k3 > 0.9) dot(px + 35, iy - 30, 7, C.accent, clamp((k3 - 0.9) / 0.1));
    helix(ix + 570, iy, k4, 1);
  },
});
