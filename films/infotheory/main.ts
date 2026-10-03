/**
 * Entry. Normal load: a player (fonts -> start card -> audio-clocked playback with a scrub bar).
 * ?export=1: no UI; export hooks for scripts/export.ts:
 *   __ready()          fonts loaded
 *   __frame(t, fps)    render time t with motion blur, return a JPEG data URL
 *   __duration         film length in seconds
 *   __cues()           the sound-effect cue sheet (audio/music.py reads it as cues.json)
 *   __scenes()         name/start/end of every scene (for the shot list)
 */
import './film';
import './scenes/index';
import { cv, F_ZH, F_EN, F_MATH, F_MONO } from '../../engine/draw';
const F_IT = F_EN;
import { frame } from '../../engine/frame';
import { gpuName } from '../../engine/gl';
import { SC, sceneAt } from '../../engine/scene';
import { clamp, fmtTime } from '../../engine/util';
import { TOTAL } from '../../engine/film';

declare global {
  interface Window {
    __ready: () => boolean;
    __frame: (t: number, fps?: number) => string;
    __duration: number;
    __gpu: () => string;
    __cues: () => { t: number; name: string; [k: string]: number | string }[];
    __scenes: () => { name: string; start: number; end: number }[];
  }
}

const EXPORT = /[?&]export=1/.test(location.search);
const params = new URLSearchParams(location.search);

let fontsReady = false;
const SAMPLE = '信息论熵比特惊讶压缩噪声纠错容量互信息无处不在ABCabc0123456789';
Promise.all([
  ...['400', '500', '600'].map((w) => document.fonts.load(`${w} 40px ${F_ZH}`, SAMPLE)),
  document.fonts.load(`400 40px ${F_EN}`),
  document.fonts.load(`700 40px ${F_EN}`),
  document.fonts.load(`italic 400 40px ${F_IT}`),
  document.fonts.load(`400 40px ${F_MATH}`, 'H = −Σ p log₂ p'),
  document.fonts.load(`italic 400 40px ${F_MATH}`),
  document.fonts.load(`700 40px ${F_MONO}`, '0101'),
])
  .catch(() => {})
  .then(() => document.fonts.ready)
  .then(() => {
    fontsReady = true;
    const l = document.getElementById('load');
    if (l) l.textContent = '字体已就绪 · 建议全屏观看（F）';
    frame(0);
  });
setTimeout(() => {
  fontsReady = true;
}, 15000);

window.__ready = () => fontsReady;
window.__frame = (t, fps = 30) => {
  frame(t, fps, 3);
  return cv.toDataURL('image/jpeg', 0.95);
};
window.__duration = TOTAL;
window.__gpu = gpuName;
window.__cues = () =>
  SC.flatMap((s) => (s.sfx ?? []).map(([t, name, o]) => ({ t: +(s.t0 + t).toFixed(4), name, ...(o ?? {}) }))).sort((a, b) => a.t - b.t);
window.__scenes = () => SC.map((s) => ({ name: s.name, start: +s.t0.toFixed(3), end: +(s.t0 + s.d).toFixed(3) }));

const au = document.getElementById('au') as HTMLAudioElement;

if (EXPORT) {
  document.body.classList.add('export');
} else {
  au.src = 'music.mp3';
  let playing = false;
  let clock0 = 0;
  let useAudio = true;
  let hideT = 0;
  const ui = document.getElementById('ui')!;
  const pp = document.getElementById('pp')!;
  const fill = document.getElementById('fill') as HTMLElement;
  const tm = document.getElementById('tm')!;
  const info = document.getElementById('info')!;
  document.getElementById('dur')!.textContent = fmtTime(TOTAL);
  const now = () => (useAudio ? au.currentTime : (performance.now() - clock0) / 1000);
  const setT = (t: number) => {
    au.currentTime = clamp(t, 0, TOTAL - 0.01);
    if (!useAudio) clock0 = performance.now() - au.currentTime * 1000;
    if (!playing) draw(au.currentTime);
  };
  const draw = (T: number) => {
    frame(T);
    fill.style.width = `${(T / TOTAL) * 100}%`;
    tm.textContent = fmtTime(T);
    const sc = sceneAt(T);
    info.textContent = `${T.toFixed(2)}s  [${sc.name} +${(T - sc.t0).toFixed(2)}s]`;
  };
  function loop() {
    const T = now();
    draw(T);
    if (T >= TOTAL - 0.05) {
      playing = false;
      pp.textContent = '▶';
    }
    if (playing) requestAnimationFrame(loop);
  }
  function play() {
    playing = true;
    pp.textContent = '❚❚';
    au.play().catch(() => {
      useAudio = false;
      clock0 = performance.now() - au.currentTime * 1000;
    });
    requestAnimationFrame(loop);
  }
  function pause() {
    playing = false;
    pp.textContent = '▶';
    au.pause();
  }
  function poke() {
    ui.classList.remove('hide');
    clearTimeout(hideT);
    hideT = window.setTimeout(() => ui.classList.add('hide'), 2200);
  }
  document.getElementById('go')!.onclick = () => {
    document.getElementById('start')?.remove();
    const t0 = params.get('t');
    if (t0) setT(parseFloat(t0));
    if (au.currentTime >= TOTAL - 0.1) au.currentTime = 0;
    play();
    poke();
  };
  pp.onclick = () => (playing ? pause() : play());
  document.getElementById('bar')!.onclick = (e) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setT(clamp((e.clientX - r.left) / r.width) * TOTAL);
  };
  document.getElementById('fs')!.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  window.addEventListener('mousemove', poke);
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (document.getElementById('start')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      playing ? pause() : play();
    }
    if (e.code === 'KeyF') (document.getElementById('fs') as HTMLElement).click();
    if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') setT(au.currentTime + (e.code === 'ArrowRight' ? 5 : -5) * (e.shiftKey ? 3 : 1));
    if (e.code === 'Period' || e.code === 'Comma') setT(au.currentTime + (e.code === 'Period' ? 1 : -1) / 30);
    if (e.code === 'BracketRight') {
      const s = SC.find((x) => x.t0 > au.currentTime + 0.01);
      if (s) setT(s.t0);
    }
    if (e.code === 'BracketLeft') {
      const prev = SC.filter((x) => x.t0 < au.currentTime - 0.3);
      if (prev.length) setT(prev[prev.length - 1].t0);
    }
    poke();
  });
}
