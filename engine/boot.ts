/**
 * Page entry shared by all films. Normal load: a player (fonts -> start card -> audio-clocked playback with a scrub bar).
 * ?export=1: no UI; export hooks for scripts/export.ts and the other tools:
 *   __ready()          fonts loaded (throws if a font failed to load)
 *   __fonts()          the film's font manifest (for scripts/validate.ts)
 *   __frame(t, fps)    render time t with motion blur, return a JPEG data URL
 *   __duration         film length in seconds
 *   __film             the film's id
 *   __style            the active style's id (?style=<id>, else the film's first style)
 *   __styles           ids of all the film's styles, the default first
 *   __timeline()       the resolved timeline (frames and seconds per scene), written to timeline.json
 *   __layout(t)        text boxes of the frame at t (for scripts/validate.ts)
 *   __contrast(t)      measured contrast of every fully visible text box of the frame at t (for scripts/validate.ts)
 *   __gpu()            WebGL renderer string
 *   __cues()           the sound-effect cue sheet (the film's score reads it as cues.json)
 *   __scenes()         name, kind, start/end, fade lengths and caption times (film seconds) of every scene
 * A film's main.ts imports its film.ts and scenes, then calls boot().
 */
import { cv, recordText, setCoverage, type TextBox } from './draw';
import { contrastAt, type ContrastBox } from './inspect';
import { frame } from './frame';
import { gpuName } from './gl';
import { SC, sceneAt } from './scene';
import { style, styleIds } from './style';
import { clamp, fmtTime } from './util';
import { film, FPS, FRAMES, TOTAL } from './film';

declare global {
  interface Window {
    __ready: () => boolean;
    __frame: (t: number, fps?: number) => string;
    __duration: number;
    __film: string;
    __style: string;
    __styles: string[];
    __timeline: () => { film: string; fps: number; bpm: number; frames: number; duration: number; scenes: { name: string; kind: string; f0: number; f1: number; start: number; end: number }[] };
    __gpu: () => string;
    __cues: () => { t: number; name: string; [k: string]: number | string }[];
    __scenes: () => { name: string; kind: string; start: number; end: number; fadeIn: number; fadeOut: number; subs: [number, number][] }[];
    __layout: (t: number, fps?: number) => TextBox[];
    __contrast: (t: number, fps?: number) => ContrastBox[];
    __fonts: () => FontManifest;
  }
}

/** One bundled font face: films/<film>/fonts/<style>/manifest.json, written by scripts/fonts.ts. */
export interface FontEntry { family: string; style: string; weight: string; file: string }
export interface FontManifest { film: string; style: string; charset: string; fonts: (FontEntry & { missing: string })[] }

export interface BootOptions {
  /** The page title and the player's start card: name, tagline (one line under it), browser tab title (default: "name · tagline"). */
  title: { name: string; tagline?: string; page?: string };
  /** The film's font manifests, one per style, and the bundled URL of each file, keyed "<style>/<file>" (from import.meta.glob). */
  fonts: FontManifest[];
  fontUrls: Record<string, string>;
  /** Start-card text once fonts are ready. */
  readyText?: string;
}

export function boot(o: BootOptions): void {
  const EXPORT = /[?&]export=1/.test(location.search);
  document.title = o.title.page ?? (o.title.tagline ? `${o.title.name} · ${o.title.tagline}` : o.title.name);
  const h1 = document.getElementById('title'), tag = document.getElementById('tagline');
  if (h1) h1.textContent = o.title.name;
  if (tag) tag.textContent = o.title.tagline ?? '';
  const params = new URLSearchParams(location.search);

  // Fonts: only the active style's bundled subsets for this film, loaded explicitly. A missing bundle or a face that
  // fails to load is an error: __ready() throws, so the tools stop instead of rendering with a system fallback.
  let fontsReady = false;
  let fontError: string | null = null;
  const sid = style().id;
  const manifest = o.fonts.find((m) => m.style === sid && m.film === film().id);
  // with no bundle, nothing loads and the .then below reports it
  const fonts: FontManifest = manifest ?? { film: film().id, style: sid, charset: '', fonts: [] };
  setCoverage(fonts);
  Promise.all(fonts.fonts.map(async (f) => {
    const url = o.fontUrls[`${sid}/${f.file}`];
    if (!url) throw new Error(`font file ${f.file} is in the manifest but not bundled`);
    const face = new FontFace(f.family, `url(${url}) format('woff2')`, { style: f.style, weight: f.weight });
    document.fonts.add(await face.load());
  }))
    .then(() => {
      if (!manifest) throw new Error(`no bundled fonts for film "${film().id}" in style "${sid}" (run: bun scripts/fonts.ts --style ${sid})`);
      fontsReady = true;
      const l = document.getElementById('load');
      if (l) l.textContent = o.readyText ?? '字体已就绪 · 建议全屏观看（F）';
      frame(0);
    })
    .catch((e) => {
      fontError = `fonts failed to load: ${e instanceof Error ? e.message : String(e)}`;
      console.error(fontError);
      const l = document.getElementById('load');
      if (l) l.textContent = fontError;
    });

  window.__ready = () => {
    if (fontError) throw new Error(fontError);
    return fontsReady;
  };
  window.__fonts = () => fonts;
  window.__frame = (t, fps = 30) => {
    frame(t, fps, 3);
    return cv.toDataURL('image/jpeg', 0.95);
  };
  window.__duration = TOTAL;
  window.__film = film().id;
  window.__style = sid;
  window.__styles = styleIds();
  window.__timeline = () => ({
    film: film().id, fps: FPS, bpm: film().bpm, frames: FRAMES, duration: TOTAL,
    scenes: SC.map((s) => ({ name: s.name, kind: s.kind, f0: s.f0, f1: s.f1, start: s.t0, end: s.t0 + s.d })),
  });
  // text boxes of the frame at t (no motion blur), for scripts/validate.ts
  window.__contrast = (t, fps = 30) => contrastAt(t, fps);
  window.__layout = (t, fps = 30) => {
    recordText(true);
    frame(t, fps, 1);
    return recordText(false);
  };
  window.__gpu = gpuName;
  window.__cues = () =>
    SC.flatMap((s) => (s.sfx ?? []).map(([t, name, o]) => ({ t: +(s.t0 + t).toFixed(4), name, ...(o ?? {}) }))).sort((a, b) => a.t - b.t);
  window.__scenes = () => SC.map((s) => ({
    name: s.name, kind: s.kind, start: +s.t0.toFixed(3), end: +(s.t0 + s.d).toFixed(3),
    fadeIn: s.fi ?? style().motion.fadeIn, fadeOut: s.fo ?? style().motion.fadeOut,
    subs: s.subs.map(([a, b]) => [+(s.t0 + a).toFixed(3), +(s.t0 + b).toFixed(3)] as [number, number]),
  }));

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
    // nothing is drawn before the bundled fonts are in: no frame may use a system font
    const draw = (T: number) => {
      if (!fontsReady) return;
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
      if (!fontsReady) return;
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
      if (!fontsReady) return; // the start card stays (with the error, if fonts failed)
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
}
