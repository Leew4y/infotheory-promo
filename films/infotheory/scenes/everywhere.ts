// 11. Chapter 08, everywhere: six rows, each with a small ink drawing, and one unit for all of them.
import { text, label, ink, circle, rule, dot, background, statement, M, COL, C, F, scene, clamp, eout, sstep, ctx, TAU, PI, bars } from '../../../engine';

type Icon = (x: number, y: number, k: number) => void;
const helix: Icon = (x, y, k) => {
  const L: [number, number][] = [], R: [number, number][] = [];
  for (let i = 0; i <= 20; i++) {
    const u = i / 20, yy = y - 34 + u * 68, ph = u * TAU * 1.2;
    L.push([x + Math.sin(ph) * 16, yy]);
    R.push([x - Math.sin(ph) * 16, yy]);
  }
  ink(L, k, C.fg, 1.6);
  ink(R, k, C.fg, 1.6);
  for (let i = 1; i < 5; i++) if (k > i / 5) ink([[x + Math.sin((i / 5) * TAU * 1.2) * 16, y - 34 + (i / 5) * 68], [x - Math.sin((i / 5) * TAU * 1.2) * 16, y - 34 + (i / 5) * 68]], 1, C.accent, 1.3);
};
const chip: Icon = (x, y, k) => {
  ink([[x - 26, y - 26], [x + 26, y - 26], [x + 26, y + 26], [x - 26, y + 26], [x - 26, y - 26]], k, C.fg, 1.6);
  for (let i = 0; i < 4; i++) if (k > 0.5) { const p = -18 + i * 12; ink([[x + p, y - 26], [x + p, y - 38]], 1, C.fg, 1.2); ink([[x + p, y + 26], [x + p, y + 38]], 1, C.fg, 1.2); }
  if (k > 0.8) text('1→0', x, y + 7, { font: F.math, size: 16, color: C.accent, align: 'center' });
};
const hole: Icon = (x, y, k) => {
  circle(x, y, 20, k, C.fg, 1.6);
  const e: [number, number][] = [];
  for (let i = 0; i <= 48; i++) e.push([x + Math.cos((i / 48) * TAU) * 44, y + Math.sin((i / 48) * TAU) * 13]);
  ink(e, k, C.accent, 1.4);
};
const tokens: Icon = (x, y, k) => {
  const ps = [0.45, 0.22, 0.15, 0.1, 0.08];
  ps.forEach((p, i) => { if (k > i / 5) { const h = 60 * p * 1.6; ctx.save(); ctx.fillStyle = i === 0 ? C.accent : C.fg2; ctx.globalAlpha = i === 0 ? 0.8 : 0.4; ctx.fillRect(x - 40 + i * 17, y + 30 - h, 12, h); ctx.restore(); } });
  ink([[x - 44, y + 30], [x + 44, y + 30]], k, C.fg, 1.2);
};
const signal: Icon = (x, y, k) => {
  for (let i = 1; i <= 3; i++) {
    const a: [number, number][] = [];
    for (let j = 0; j <= 24; j++) { const t = -PI * 0.75 + (j / 24) * PI * 0.5; a.push([x + Math.cos(t) * i * 16, y + 30 + Math.sin(t) * i * 16]); }
    ink(a, clamp((k - (i - 1) * 0.25) / 0.4), i === 3 ? C.accent : C.fg, 1.5);
  }
  dot(x, y + 30, 4, C.fg, k);
};
const grid: Icon = (x, y, k) => {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const keep = i + j < 4;
    if (k > (i * 4 + j) / 16) { ctx.save(); ctx.globalAlpha = keep ? 0.75 : 0.18; ctx.fillStyle = keep ? C.fg2 : C.muted; ctx.fillRect(x - 32 + i * 17, y - 32 + j * 17, 13, 13); ctx.restore(); }
  }
};
const ROWS: [Icon, string, string, string][] = [
  [helix, 'DNA', '4 种碱基，每个 2 比特', '人类基因组约 6 × 10⁹ 比特'],
  [chip, '兰道尔极限', '擦除 1 比特，至少放热 kT ln 2', '室温下约 3 × 10⁻²¹ 焦耳'],
  [hole, '黑洞', '熵正比于视界面积：S = kA / 4ℓₚ²', '信息写在边界上'],
  [tokens, '语言模型', '预测下一个词，就是在压缩语言', '损失函数是交叉熵'],
  [signal, '5G', 'LDPC 码与极化码', '距香农极限只差一点点'],
  [grid, 'JPEG · MP3', '有损压缩：丢掉你察觉不到的', '眼睛和耳朵也有熵'],
];

scene({
  name: 'everywhere', kind: 'page', dur: bars(7), mb: 3, chapter: 8, ch: ['无处不在', 'Everywhere'],
  subs: [
    [0.6, 3.6, 'DNA 用四种碱基写字：每个两比特。', 'DNA writes with four bases: two bits each.'],
    [3.9, 6.8, '擦掉一比特，至少要放出 kT ln 2 的热。', 'Erasing one bit costs at least kT ln 2 of heat.'],
    [7.1, 10, '黑洞的熵，写在它的视界面积上。', 'A black hole’s entropy is written on its horizon.'],
    [10.3, 13.2, '语言模型预测下一个词，也就是在压缩语言。', 'A language model predicting the next word is compressing language.'],
    [13.5, 16.4, '5G 的纠错码，距离香农极限只差一点点。', 'The codes in 5G sit a whisker below the Shannon limit.'],
    [16.7, 20.4, '从基因到黑洞，从 ZIP 到 5G：同一个单位。', 'From genes to black holes, from ZIP to 5G: one unit.'],
  ],
  sfx: [[0.1, 'page'], ...ROWS.map((_, i) => [0.6 + i * 3.2, 'ink'] as [number, string]), ...ROWS.map((_, i) => [1.2 + i * 3.2, 'tone', { midi: [60, 62, 64, 67, 69, 72][i] }] as [number, string, Record<string, number>]), [19.4, 'chime', { midi: 76 }]],
  draw(lt) {
    background();
    statement('同一个单位。', 'One unit, everywhere.', lt, 0.4, 300, 64);
    ROWS.forEach(([icon, name, l1, l2], i) => {
      const t0 = 0.6 + i * 3.2;
      const k = eout(clamp((lt - t0) / 0.9));
      if (k <= 0) return;
      const y = 280 + i * 100;
      icon(COL + 40, y + 6, k);
      text(name, COL + 120, y + 4, { size: 26, weight: 500, color: C.fg, alpha: k });
      text(l1, COL + 120, y + 36, { size: 19, color: C.fg2, alpha: k * sstep(0.4, 0.9, k) });
      text(l2, COL + 460, y + 36, { size: 19, color: C.muted, alpha: k * sstep(0.6, 1, k) });
      rule(COL + 40, y + 60, COL + 40 + 740 * k, y + 60, C.rule, k, 1);
    });
    const kf = sstep(19.2, 20, lt);
    rule(M, 560, M + 300 * eout(clamp((lt - 19.2) / 0.9)), 560, C.accent, kf, 2);
    text('bit', M, 640, { font: F.latin, size: 72, color: C.fg, alpha: kf, ls: 6 });
    label('比特 · 信息的单位 · 1948', M, 690, sstep(19.6, 20.2, lt), C.muted, 16);
    void F.latin;
  },
});
