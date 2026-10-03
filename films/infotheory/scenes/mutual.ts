// 10. Chapter 07, mutual information: two entropies overlap in ink; then training as cross-entropy going down.
import { text, label, circle, hatch, rule } from '../../../engine/draw';
import { background, statement, M, COL, C, F } from '../../../engine/style';
import { scene } from '../../../engine/scene';
import { clamp, lerp, eio, eout, sstep, win, ctx, TAU } from './_ctx';

const TOKENS = ['信息', '比特', '熵', '噪声', '编码', '香农'];
const PTRUE = [0.34, 0.22, 0.18, 0.12, 0.09, 0.05];
const Q0 = [0.05, 0.1, 0.3, 0.25, 0.2, 0.1];
const xent = (p: number[], q: number[]) => -p.reduce((s, v, i) => s + v * Math.log2(Math.max(q[i], 1e-6)), 0);

scene({
  name: 'mutual', kind: 'page', start: 48, len: 6, mb: 3, chapter: 7, ch: ['互信息', 'Mutual information'],
  subs: [
    [0.8, 4.4, '知道了 Y，关于 X 的不确定减少了多少？', 'Knowing Y, how much less uncertain are you about X?'],
    [5, 7.8, '这块重叠，叫互信息。', 'That overlap is mutual information.'],
    [8.4, 12.4, '训练一个模型，就是让它的预测 q 逼近真实分布 p。', 'Training a model means pulling its prediction q toward the true distribution p.'],
    [13, 17.2, '损失函数就是交叉熵：预测得越好，压缩得越好。', 'The loss is cross-entropy: predict better, compress better.'],
  ],
  sfx: [[0.1, 'page'], [1.0, 'ink'], [1.6, 'ink'], [3.4, 'tone', { midi: 62 }], [5.2, 'tone', { midi: 67 }], [8.6, 'ink'], ...[0, 1, 2, 3, 4, 5].map((i) => [9.0 + i * 0.12, 'tick'] as [number, string]), [13.2, 'tone', { midi: 64 }], [15.6, 'chime', { midi: 72 }]],
  draw(lt) {
    background();
    statement('知道了一个，就少猜另一个。', 'Know one, and there is less to guess about the other.', lt);
    const aV = 1 - sstep(8.0, 8.8, lt);
    if (aV > 0) {
      const cx = 1380, cy = 520, R = 170;
      const sep = lerp(420, 190, eio(clamp((lt - 1.0) / 2.6)));
      const xa = cx - sep / 2, xb = cx + sep / 2;
      const k = eout(clamp((lt - 1.0) / 0.9));
      hatch(() => { ctx.arc(xa, cy, R, 0, TAU); }, C.alt, aV * 0.22 * k, 9);
      hatch(() => { ctx.arc(xb, cy, R, 0, TAU); }, C.accent, aV * 0.22 * k, 9, Math.PI / 4);
      circle(xa, cy, R, k, C.alt, 1.8, aV);
      circle(xb, cy, R, k, C.accent, 1.8, aV);
      text('H(X)', xa - 60, cy - R - 24, { font: F.math, style: 'italic', size: 30, color: C.alt, alpha: aV * k, align: 'center' });
      text('H(Y)', xb + 60, cy - R - 24, { font: F.math, style: 'italic', size: 30, color: C.accent, alpha: aV * k, align: 'center' });
      text('I(X;Y)', cx, cy + 10, { font: F.math, style: 'italic', size: 32, weight: 700, color: C.fg, alpha: aV * sstep(3.2, 3.8, lt), align: 'center' });
      text('H(X|Y)', xa - 55, cy + 60, { font: F.math, style: 'italic', size: 20, color: C.fg2, alpha: aV * sstep(3.8, 4.4, lt), align: 'center' });
      text('H(Y|X)', xb + 55, cy + 60, { font: F.math, style: 'italic', size: 20, color: C.fg2, alpha: aV * sstep(3.8, 4.4, lt), align: 'center' });
    }
    const kf = sstep(4.8, 5.6, lt);
    text('I(X;Y) = H(X) − H(X|Y)', M, 560, { font: F.math, size: 44, color: C.fg, alpha: kf });
    rule(M, 576, M + 470 * eout(clamp((lt - 5.2) / 0.8)), 576, C.accent, kf, 2);
    label('Mutual information · 两个变量共享的信息', M, 612, sstep(5.4, 6, lt), C.muted, 16);
    // training
    const aT = win(lt, 8.4, 18, 0.6, 0.01);
    if (aT > 0) {
      const k = eout(clamp((lt - 9.4) / 5.5));
      const q = Q0.map((v, i) => lerp(v, PTRUE[i], k));
      const loss = xent(PTRUE, q), Hp = xent(PTRUE, PTRUE);
      const x0 = COL + 60, y0 = 720, bw = 96, gap = 24, hmax = 360;
      rule(x0 - 10, y0, x0 + 6 * (bw + gap), y0, C.rule, aT, 1.5);
      TOKENS.forEach((tk, i) => {
        const a = aT * sstep(9.0 + i * 0.12, 9.3 + i * 0.12, lt);
        const x = x0 + i * (bw + gap);
        const hp = hmax * PTRUE[i] * 2.4, hq = hmax * q[i] * 2.4;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = C.fg;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(x, y0 - hp, bw * 0.46, hp);
        ctx.fillStyle = C.accent;
        ctx.globalAlpha = a * 0.75;
        ctx.fillRect(x + bw * 0.52, y0 - hq, bw * 0.46, hq);
        ctx.restore();
        text(tk, x + bw / 2, y0 + 30, { size: 20, color: C.fg2, alpha: a, align: 'center' });
      });
      label('p · true', x0, 250, aT, C.fg, 14);
      label('q · model', x0 + 120, 250, aT, C.accent, 14);
      text(`H(p, q) = ${loss.toFixed(3)} bit`, x0 + 300, 254, { font: F.math, size: 26, color: loss - Hp < 0.05 ? C.alt2 : C.accent, alpha: aT * sstep(9.2, 9.8, lt) });
      text(`H(p) = ${Hp.toFixed(3)} bit`, x0 + 300, 290, { font: F.math, size: 20, color: C.muted, alpha: aT * sstep(9.8, 10.4, lt) });
      text(`step ${Math.floor(k * 4000).toString().padStart(4, '0')}`, x0 + 300, 322, { font: F.mono, size: 16, color: C.muted, alpha: aT * sstep(9.8, 10.4, lt) });
      const kk = sstep(13.0, 13.8, lt);
      text('H(p, q) = H(p) + D(p ‖ q)', M, 720, { font: F.math, size: 40, color: C.fg, alpha: kk });
      text('多出来的那一项，是模型还没学会的部分', M, 762, { size: 20, color: C.muted, alpha: sstep(13.6, 14.2, lt) });
    }
  },
});
