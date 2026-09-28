// 5. Chapter 03, compression: a Huffman tree drawn in ink, the same message in two codes, the entropy floor.
import { paper, text, label, ink, circle, rule, bits, C, F_EN, F_MATH, F_MONO } from '../engine/draw';
import { M, COL, statement, row } from '../engine/page';
import { scene } from '../engine/scene';
import { clamp, lerp, eout, sstep, win } from '../engine/util';

interface Node { id: string; p: number; x: number; y: number; kids?: [string, string]; born: number; code?: string }
const NODES: Record<string, Node> = {
  F: { id: 'F', p: 0.08, x: 0, y: 3, born: 0, code: '000' }, E: { id: 'E', p: 0.1, x: 1, y: 3, born: 0, code: '001' },
  B: { id: 'B', p: 0.2, x: 2, y: 3, born: 0, code: '01' }, D: { id: 'D', p: 0.12, x: 3, y: 3, born: 0, code: '100' },
  C: { id: 'C', p: 0.15, x: 4, y: 3, born: 0, code: '101' }, A: { id: 'A', p: 0.35, x: 5, y: 3, born: 0, code: '11' },
  FE: { id: 'FE', p: 0.18, x: 0.5, y: 2, kids: ['F', 'E'], born: 2.0 }, DC: { id: 'DC', p: 0.27, x: 3.5, y: 2, kids: ['D', 'C'], born: 3.2 },
  FEB: { id: 'FEB', p: 0.38, x: 1.25, y: 1, kids: ['FE', 'B'], born: 4.4 }, DCA: { id: 'DCA', p: 0.62, x: 4.25, y: 1, kids: ['DC', 'A'], born: 5.6 },
  ROOT: { id: 'ROOT', p: 1, x: 2.75, y: 0, kids: ['FEB', 'DCA'], born: 6.8 },
};
const PX = (n: Node) => COL + 60 + n.x * 128;
const PY = (n: Node) => 280 + n.y * 125;
const MSG = 'ABACABAEBA';
const FIXED: Record<string, string> = { A: '000', B: '001', C: '010', D: '011', E: '100', F: '101' };

scene({
  name: 'compress', kind: 'page', start: 22, len: 7, mb: 3, chapter: 3, ch: ['压缩', 'Compression'],
  subs: [
    [0.8, 4.6, '常见的符号给短码，罕见的给长码。', 'Frequent symbols get short codes, rare ones long codes.'],
    [5.2, 9.4, '霍夫曼树：每次把最不常见的两个合并，直到只剩一个根。', 'A Huffman tree: merge the two least frequent, until one root remains.'],
    [10.2, 14.2, '同一段消息，从 30 比特变成 22 比特。', 'The same message: 30 bits become 22.'],
    [14.8, 17.6, 'ZIP、PNG、MP3，做的都是同一件事：削减冗余。', 'ZIP, PNG and MP3 all do the same thing: shave off redundancy.'],
    [18, 20.8, '但再聪明的编码，平均也不能短于熵。', 'But no code, however clever, averages below the entropy.'],
  ],
  sfx: [[0.1, 'page'], ...[2.0, 3.2, 4.4, 5.6, 6.8].map((t) => [t, 'ink'] as [number, string]), [6.8, 'tone', { midi: 71 }], [8.2, 'tick'], [10.4, 'tick'], [11.2, 'tick'], [13.6, 'tone', { midi: 67 }], [18.2, 'tone', { midi: 60 }], [19.6, 'chime', { midi: 72 }]],
  draw(lt) {
    paper();
    statement('常见的说短些，罕见的说长些。', 'Say the common briefly, and the rare at length.', lt);
    const aT = 1 - sstep(17.2, 18, lt) * 0.35;
    // edges
    for (const n of Object.values(NODES)) {
      if (!n.kids) continue;
      const k = eout(clamp((lt - n.born) / 0.7));
      if (k <= 0) continue;
      n.kids.forEach((kid, j) => {
        const c = NODES[kid];
        ink([[PX(n), PY(n)], [PX(c), PY(c)]], k, C.ink2, 1.4, aT);
        text(j === 0 ? '0' : '1', lerp(PX(n), PX(c), 0.5) + (j === 0 ? -16 : 16), lerp(PY(n), PY(c), 0.5) + 6, { font: F_MONO, size: 16, color: C.grey, alpha: aT * sstep(0.8, 1, k), align: 'center' });
      });
    }
    // nodes
    for (const n of Object.values(NODES)) {
      const leaf = !n.kids;
      const k = leaf ? eout(clamp((lt - 0.6 - n.x * 0.15) / 0.5)) : eout(clamp((lt - n.born) / 0.5));
      if (k <= 0) continue;
      const x = PX(n), y = PY(n);
      if (leaf) {
        circle(x, y, 26, k, C.ink, 1.6, aT);
        text(n.id, x, y + 10, { font: F_EN, size: 28, color: C.ink, alpha: aT * k, align: 'center' });
        text(`${(n.p * 100).toFixed(0)}%`, x, y + 56, { font: F_MONO, size: 15, color: C.grey, alpha: aT * k, align: 'center' });
        if (n.code) text(n.code, x, y + 92, { font: F_MONO, size: 20, weight: 700, color: C.rust, alpha: aT * sstep(7.6 + n.x * 0.1, 8 + n.x * 0.1, lt), align: 'center' });
      } else {
        circle(x, y, 18, k, C.rust, 1.6, aT);
        text(n.p.toFixed(2), x, y + 5, { font: F_MONO, size: 13, color: C.ink2, alpha: aT * k, align: 'center' });
      }
    }
    label('Huffman coding · 霍夫曼编码', COL + 60, 240, aT * sstep(0.4, 1, lt), C.grey, 15);
    text('平均码长 2.45 bit', 1740, 240, { font: F_MATH, size: 24, color: C.rust, alpha: aT * sstep(8.4, 9, lt), align: 'right' });
    // the message in two codes
    const aM = win(lt, 10, 21, 0.5, 0.01);
    if (aM > 0) {
      text(MSG.split('').join(' '), M, 540, { font: F_EN, size: 34, color: C.ink, alpha: aM, ls: 6 });
      const fixedBits = [...MSG].map((c) => FIXED[c]).join('');
      const huffBits = [...MSG].map((c) => NODES[c].code!).join('');
      const litF = (lt - 10.4) * 12, litH = (lt - 11.2) * 12;
      text('定长', M, 604, { size: 20, color: C.grey, alpha: aM });
      bits(fixedBits, M + 90, 604, 22, litF, aM);
      text(`${Math.min(30, Math.max(0, Math.floor(litF)))} bit`, M + 610, 604, { font: F_MATH, size: 24, color: C.grey, alpha: aM });
      text('霍夫曼', M, 660, { size: 20, color: C.rust, alpha: aM });
      bits(huffBits, M + 90, 660, 22, litH, aM);
      text(`${Math.min(22, Math.max(0, Math.floor(litH)))} bit`, M + 610, 660, { font: F_MATH, size: 24, color: C.rust, alpha: aM });
    }
    // the floor
    const aF = win(lt, 17.6, 21, 0.5, 0.01);
    if (aF > 0) {
      const y = 760;
      row('3.00', '定长编码', 'log₂ 6 向上取整', M, y, aF * sstep(17.8, 18.3, lt), 110);
      row('2.45', '霍夫曼', '最优前缀码', M + 420, y, aF * sstep(18.4, 18.9, lt), 110);
      row('2.40', '熵 H', '任何码的平均下限', M + 840, y, aF * sstep(19.0, 19.5, lt), 110);
      rule(M, y + 52, M + 1200 * eout(clamp((lt - 19.4) / 1.0)), y + 52, C.rust, aF, 1.5);
      label('Source coding theorem · 源编码定理：平均码长 ≥ H', M, y + 88, aF * sstep(19.8, 20.4, lt), C.grey, 15);
    }
  },
});
