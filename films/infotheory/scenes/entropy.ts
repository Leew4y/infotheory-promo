// 3. Chapter 02, entropy: a distribution morphs from flat to a spike while H is read out; English letters.
import { text, label, ink, rule, rollNumber, background, statement, M, COL, C, F, scene, clamp, lerp, eio, eout, sstep, win, ctx } from '../../../engine';

const FLAT = [1, 1, 1, 1, 1, 1, 1, 1].map((v) => v / 8);
const PEAK = [0.5, 0.2, 0.1, 0.08, 0.05, 0.04, 0.02, 0.01];
const SPIKE = [0.995, 0.001, 0.001, 0.001, 0.0005, 0.0005, 0.0005, 0.0005];
const entropy = (p: number[]): number => -p.reduce((s, v) => s + (v > 0 ? v * Math.log2(v) : 0), 0);
const mixP = (a: number[], b: number[], k: number) => a.map((v, i) => lerp(v, b[i], k));
const LETTERS = 'ETAOINSHRDLCUMWFGYPBVKJXQZ';
const FREQ = [12.7, 9.1, 8.2, 7.5, 7.0, 6.7, 6.3, 6.1, 6.0, 4.3, 4.0, 2.8, 2.8, 2.4, 2.4, 2.2, 2.0, 2.0, 1.9, 1.5, 1.0, 0.8, 0.15, 0.15, 0.1, 0.07];

scene({
  name: 'entropy', kind: 'page', start: 14, len: 6, mb: 3, chapter: 2, ch: ['熵', 'Entropy'],
  subs: [
    [0.8, 4.4, '八种结果，等可能：每一次，你都完全猜不到。', 'Eight outcomes, equally likely: each time, you have no idea.'],
    [5, 8.8, '把每种结果的惊讶按概率平均，就是熵。', 'Average the surprise of each outcome by its probability: that is entropy.'],
    [9.6, 13.2, '二十六个字母若等可能，是 4.7 比特；按真实频率，只有 4.1。', 'Twenty-six equiprobable letters: 4.7 bits. Real frequencies: 4.1.'],
    [13.8, 17.6, '读得越多，猜得越准：英语每个字母其实只有约 1 比特。', 'The more context you read, the better you guess: English carries about one bit per letter.'],
  ],
  sfx: [[0.1, 'page'], ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [0.9 + i * 0.12, 'tick'] as [number, string]), [2.6, 'breath', { dur: 2 }], [5.6, 'breath', { dur: 2 }], [8.2, 'tone', { midi: 62 }], [9.6, 'ink'], [11.6, 'tone', { midi: 67 }], [13.8, 'tone', { midi: 64 }], [16.2, 'chime', { midi: 72 }]],
  draw(lt) {
    background();
    statement('熵，是平均的惊讶。', 'Entropy is surprise, averaged.', lt);
    const aD = 1 - sstep(9.0, 9.8, lt);
    if (aD > 0) {
      const m1 = eio(clamp((lt - 2.6) / 2.0)), m2 = eio(clamp((lt - 5.6) / 2.0));
      const p = mixP(mixP(FLAT, PEAK, m1), SPIKE, m2);
      const x0 = COL + 40, by = 720, bw = 66, gap = 24, hmax = 380;
      rule(x0 - 10, by, x0 + 8 * (bw + gap), by, C.rule, aD, 1.5);
      p.forEach((v, i) => {
        const a = aD * sstep(0.9 + i * 0.12, 1.2 + i * 0.12, lt);
        const h = Math.min(hmax, hmax * v * 3.2);
        const x = x0 + i * (bw + gap);
        ink([[x, by], [x, by - h], [x + bw, by - h], [x + bw, by]], 1, C.fg, 1.5, a);
        ink([[x + 2, by - 1], [x + 2, by - h + 2]], 1, C.accent, 0, a);
        // a light rust fill
        ctx_fill(x, by - h, bw, h, a * 0.18);
        text(String.fromCharCode(65 + i), x + bw / 2, by + 30, { font: F.latin, size: 18, color: C.muted, alpha: a, align: 'center' });
      });
      const H = entropy(p);
      text(`H = ${H.toFixed(2)} bit`, x0, 250, { font: F.math, size: 46, color: C.accent, alpha: aD * sstep(1.8, 2.4, lt) });
      const lab = m2 > 0.9 ? '只有一种可能，熵为零' : m1 > 0.9 && m2 < 0.1 ? '偏向一种结果，熵变小' : m1 < 0.1 ? '等可能，熵最大' : '';
      text(lab, x0 + 300, 250, { size: 22, color: C.muted, alpha: aD * sstep(1.2, 1.8, lt) });
    }
    const kf = sstep(4.8, 5.6, lt);
    text('H(X) = −Σ p(x) log₂ p(x)', M, 620, { font: F.math, size: 44, color: C.fg, alpha: kf });
    rule(M, 636, M + 420 * eout(clamp((lt - 5.2) / 0.8)), 636, C.accent, kf, 2);
    label('Entropy · 平均惊讶', M, 672, sstep(5.4, 6, lt), C.muted, 16);
    // English letters
    const aE = win(lt, 9.4, 18, 0.6, 0.01);
    if (aE > 0) {
      const x0 = COL + 20, y0 = 720, w = 28, hmax = 380;
      rule(x0 - 6, y0, x0 + 26 * w, y0, C.rule, aE, 1.5);
      [...LETTERS].forEach((ch, i) => {
        const a = aE * sstep(9.6 + i * 0.05, 9.9 + i * 0.05, lt);
        const h = (FREQ[i] / 12.7) * hmax;
        ctx_fill(x0 + i * w + 4, y0 - h, w - 8, h, a * (i < 5 ? 0.9 : 0.45), i < 5 ? C.accent : C.fg2);
        text(ch, x0 + i * w + w / 2, y0 + 26, { font: F.mono, size: 15, color: C.muted, alpha: a, align: 'center' });
      });
      const rows: [number, string, string][] = [[11.4, 'log₂ 26 = 4.70 bit', '若二十六个字母等可能'], [13.8, 'H₁ ≈ 4.14 bit', '按单字母频率'], [16.2, 'H ≈ 1 bit / 字母', '考虑上下文']];
      rows.forEach(([t0, f, lab], i) => {
        const a = aE * sstep(t0, t0 + 0.5, lt);
        text(f, x0 + 330, 270 + i * 60, { font: F.math, size: 30, color: i === 2 ? C.accent : C.fg, alpha: a });
        text(lab, x0 + 640, 270 + i * 60, { size: 20, color: C.muted, alpha: a });
      });
    }
  },
});

function ctx_fill(x: number, y: number, w: number, h: number, a: number, col = C.accent): void {
  if (a <= 0.002 || h <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}
