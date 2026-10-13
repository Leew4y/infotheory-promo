// Chapter 2 (v4): the question many viewers bring, asked as a question (audit R24: no unsourced "many people"), then
// the history that turns it: the preface to the 1699 volume of the Paris Academy answered the charge that mathematics
// is useless (F-H01: "the preface written for the 1699 volume"; R25: no "three hundred years ago"), in the words of
// F-H02. Both lines are shown verbatim, so they carry no caption.
import { background, M, W, narratedScene, sstep, win, vo, voParts } from '../../../engine';
import { bell, quote, voiceLine } from '../lib';

narratedScene({
  name: 'useless', kind: 'page', chapter: 2, ch: ['无用', ''], lead: 0.6, gap: 0.9, tail: 1.4, shown: ['ask', 'preface'],
  sfx: (at) => [[at('ask'), 'low', { midi: 33, dur: 1.6 }], [at('preface'), 'chime', { midi: bell(6) }]],
  draw(lt) {
    background();
    const [tq, tq2] = voParts('ask', ['机器会证明定理了，', '就意味着人不必再做数学了吗？']), tp = vo('preface');
    const [, tw] = voParts('preface', ['巴黎科学院 1699 年卷的序言，就回应过“数学无用”的说法：', '人们乐于把自己不懂的东西称为无用，这是一种报复。']);
    voiceLine('机器会证明定理了，', W / 2, 470, win(lt, tq, tp - 0.4, 0.7, 0.6), 'film', { size: 56, align: 'center', mk: '◇' });
    voiceLine('就意味着人不必再做数学了吗？', W / 2, 560, win(lt, tq2, tp - 0.4, 0.7, 0.6), 'film', { size: 56, align: 'center' });
    quote(
      ['人们乐于把自己不懂的东西', '称为无用，这是一种报复。'],
      ["On traite volontiers d'inutile ce qu'on ne sçait point,", "c'est une espece de vengeance."],
      'Fontenelle · 巴黎科学院 1699 年卷序言 · 据 1742 年《全集》第五卷 p. 1',
      M, 400, sstep(tw - 0.1, tw + 0.8, lt), '6', 64,
    );
    // the spoken attribution is on the page too (preface is shown, not captioned; PR #9 review)
    voiceLine('巴黎科学院 1699 年卷的序言，就回应过“数学无用”的说法', M, 300, sstep(tp, tp + 0.8, lt), 'film', { size: 28 });
  },
});
