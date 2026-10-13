/**
 * Narration: a film's spoken lines, timed sentence by sentence.
 *
 * The script (films/<film>/narration.json) lists lines with a stable id, the scene they belong to, the text (Chinese,
 * shown in the captions), an optional English line for the captions and an optional reading for the voice (numbers,
 * versions, amounts written out as they are to be said). scripts/narrate.ts synthesizes each line into
 * films/<film>/narration/<id>.flac (committed: synthesis samples, so a line cannot be made again identically) and
 * writes the lock films/<film>/narration.lock.json: per line the text and reading it was made from, the audio's
 * duration (speech only: silence trimmed) and sha256. The timeline depends only on the lock.
 *
 * Timing (Develata's decision, 2026-10-09: sentence level, no word alignment): a narrated scene lasts lead + its
 * lines with their gaps + tail, at least its own minimum (footage that must be shown in full), rounded up to whole
 * frames; its captions are the lines; vo(id) is a line's start on its scene's clock, the anchor for animations that
 * must land on a sentence. The page reports every line's placement (film seconds) for the final mix (audio/mix.py).
 * Every script line is placed exactly once (validate reports the rest).
 */
import { film, FPS } from './film';
import { scene, type SceneDef, type Sfx, type Sub } from './scene';

export interface NarrationLine {
  /** Stable id: lowercase letters, digits, hyphens. The audio file and anchors use it. */
  id: string;
  /** The scene that speaks it (narratedScene / demoScene name). */
  scene: string;
  text: string;
  en?: string;
  /** What the voice says, when it differs from the text (e.g. "v2.1" -> "v二点一"). */
  read?: string;
  /** Seconds after this line before the next one (default: the scene's gap). */
  pause?: number;
}
export interface NarrationScript { voice: string; lines: NarrationLine[] }
export interface LockLine {
  text: string; read: string; duration: number; sha256: string; key: string;
  /** The speech between pauses, seconds from the line's start (scripts/narrate.ts); captions follow it. */
  spans?: [number, number][];
}
export interface NarrationLock { film: string; backend: string; model: string; voice: string; lines: Record<string, LockLine> }
/** Where a line plays: film seconds. */
export interface LinePlacement { id: string; t: number; dur: number }

export const LINE_ID = /^[a-z0-9][a-z0-9-]*$/;
let script: NarrationScript | null = null;
let lock: NarrationLock | null = null;
const placements: LinePlacement[] = [];
/** Scene-local start of each placed line. */
const starts = new Map<string, number>();

/**
 * Install the film's narration (in film.ts, after defineFilm, before the scenes). The lock must be the film's and the
 * script's voice, and hold every line, made from the same text and reading, with a positive duration; otherwise the
 * film refuses to load (run just narrate <film>).
 */
export function checkNarrationLock(s: NarrationScript, l: NarrationLock, f: string): void {
  if (!l || !l.lines || typeof l.lines !== 'object') throw new Error('narration: malformed lock (run just narrate)');
  if (l.film !== f) throw new Error(`narration: the lock is film "${l.film}"'s, not "${f}"'s`);
  if (l.voice !== s.voice) throw new Error(`narration: the lock was made with voice "${l.voice}", the script asks for "${s.voice}" (run just narrate)`);
  const ids = new Set<string>();
  for (const line of s.lines) {
    if (!LINE_ID.test(line.id)) throw new Error(`narration: line id "${line.id}": lowercase letters, digits, hyphens`);
    if (ids.has(line.id)) throw new Error(`narration: line id "${line.id}" appears twice`);
    ids.add(line.id);
    const e = l.lines[line.id];
    if (!e) throw new Error(`narration: line "${line.id}" has no audio in the lock (run just narrate)`);
    if (e.text !== line.text || e.read !== (line.read ?? line.text)) throw new Error(`narration: line "${line.id}" changed since it was synthesized (run just narrate)`);
    if (!(Number.isFinite(e.duration) && e.duration > 0)) throw new Error(`narration: line "${line.id}" has duration ${e.duration} in the lock`);
    if (line.pause !== undefined && !(Number.isFinite(line.pause) && line.pause >= 0)) throw new Error(`narration: line "${line.id}": pause must be >= 0`);
  }
}

export function useNarration(s: NarrationScript, l: NarrationLock): void {
  checkNarrationLock(s, l, film().id);
  script = s;
  lock = l;
}

/** How a scene is timed by its narration. */
export interface NarrationTiming {
  /** The lines this scene speaks, in order (default: every script line whose scene is this scene's name). */
  lines?: string[];
  /** Seconds before the first line (default .6), between lines (.35, unless a line sets its own pause), after the last (.8). */
  lead?: number;
  gap?: number;
  tail?: number;
  /** The scene lasts at least this long (e.g. footage that must play in full). */
  minDur?: number;
  /**
   * Captions as phrases of at most this many character widths (splitCaption), each shown from where it is spoken
   * (syncSubs); a line's `en` goes with its first phrase. Default: one caption per line, for the whole line.
   */
  split?: number;
  /** Lines shown verbatim as display text (true: every line, as on a plate): they get no caption, the page is it. */
  shown?: string[] | true;
}

/** Width of caption text in CJK character widths: a Latin letter, digit or space counts half. */
export const captionWidth = (s: string): number => [...s].reduce((w, c) => w + (c.charCodeAt(0) < 128 ? 0.5 : 1), 0);
/** Punctuation a caption does not end on (Chinese subtitle practice: the break is the pause). */
const SOFT_END = /[，。；、：,.;:]+$/;
/**
 * A caption split into phrases of at most `max` widths (captionWidth). Pieces end after Chinese punctuation or a dash;
 * a piece still too wide is cut into near-equal parts (never inside a Latin word, a number or a quotation); consecutive pieces are
 * then grouped into the fewest captions, the most even in width. A caption's trailing comma, full stop, semicolon or
 * colon is dropped (Chinese subtitle practice: the break is the pause). Pre: max >= 4. Post: every caption fits
 * (unless a single unbreakable word does not), and the captions joined are the text less those trailing marks.
 */
export function splitCaption(text: string, max: number): string[] {
  const fit = (s: string) => captionWidth(s.replace(SOFT_END, ''));
  const pieces = text.match(/[^，。；：？！、—]*(?:[，。；：？！、]|—+|$)/g)!.filter((p) => p.trim()).flatMap((p) => {
    const w = fit(p);
    if (w <= max) return [p];
    const n = Math.ceil(w / max), units = p.match(/"[^"]*"|“[^”]*”|《[^》]*》|[A-Za-z0-9.%]+\s?|\s|./gu)!, parts: string[] = [];
    let cur = '';
    for (const u of units) {
      if (cur && parts.length < n - 1 && captionWidth(cur + u) > w / n + 0.25) { parts.push(cur); cur = ''; }
      cur += u;
    }
    return [...parts, cur];
  });
  // fewest captions, then the least sum of squared slack (dynamic programming over the pieces)
  const best: { cost: number; from: number }[] = [{ cost: 0, from: -1 }];
  for (let i = 1; i <= pieces.length; i++) {
    best[i] = { cost: Infinity, from: i - 1 };
    for (let j = i - 1; j >= 0; j--) {
      const w = fit(pieces.slice(j, i).join(''));
      if (w > max && j < i - 1) break;
      const c = best[j].cost + 1e4 + (max - Math.min(w, max)) ** 2;
      if (c < best[i].cost) best[i] = { cost: c, from: j };
    }
  }
  const out: string[] = [];
  for (let i = pieces.length; i > 0; i = best[i].from) out.unshift(pieces.slice(best[i].from, i).join(''));
  return out.map((p) => p.trim().replace(SOFT_END, '')).filter(Boolean);
}

/**
 * Time a scene by its narration: its duration (whole frames, never cutting a line or the minimum), the lines as
 * captions, and bind(), to call with the registered scene, which places the lines on the film.
 */
export function narrationTiming(name: string, o: NarrationTiming): { dur: number; subs: Sub[]; at: (id: string) => number; bind: (s: SceneDef) => SceneDef } {
  if (!script || !lock) throw new Error(`scene "${name}": no narration installed (useNarration in film.ts)`);
  const ids = o.lines ?? script.lines.filter((l) => l.scene === name).map((l) => l.id);
  if (!ids.length) throw new Error(`scene "${name}": no narration lines (none in the script has scene "${name}")`);
  // every check before the scene registers: a refused scene must not change the timeline
  for (const [i, id] of ids.entries()) {
    if (ids.indexOf(id) !== i) throw new Error(`scene "${name}": narration line "${id}" is listed twice`);
    if (starts.has(id)) throw new Error(`scene "${name}": narration line "${id}" is already placed in another scene`);
  }
  const lead = o.lead ?? 0.6, gap = o.gap ?? 0.35, tail = o.tail ?? 0.8;
  for (const [k, v] of Object.entries({ lead, gap, tail, minDur: o.minDur ?? 0 })) if (!(Number.isFinite(v) && v >= 0)) throw new Error(`scene "${name}": ${k} must be >= 0 (got ${v})`);
  let t = lead;
  const subs: Sub[] = [];
  const local: LinePlacement[] = [];
  ids.forEach((id, i) => {
    const line = script!.lines.find((l) => l.id === id);
    if (!line) throw new Error(`scene "${name}": no line "${id}" in the script`);
    const dur = lock!.lines[id].duration;
    local.push({ id, t, dur });
    if (o.shown === true || o.shown?.includes(id)) { /* the display text is the caption */ }
    else if (o.split === undefined) subs.push([t, t + dur, line.text, line.en ?? '']);
    else splitCaption(line.text, o.split).forEach((p, k, all) => subs.push([t + (dur * k) / all.length, t + (dur * (k + 1)) / all.length, p, k ? '' : line.en ?? '']));
    t += dur + (i < ids.length - 1 ? (line.pause ?? gap) : 0);
  });
  const dur = Math.ceil(Math.max(o.minDur ?? 0, t + tail) * FPS - 1e-9) / FPS;
  if (o.split !== undefined) {
    if (!(Number.isFinite(o.split) && o.split >= 4)) throw new Error(`scene "${name}": split must be >= 4 (got ${o.split})`);
    const said = local.map((p) => ({ t: p.t, dur: p.dur, text: lock!.lines[p.id].text, read: lock!.lines[p.id].read, spans: lock!.lines[p.id].spans }));
    subs.splice(0, subs.length, ...syncSubs(subs, said, dur));
  }
  const bind = (s: SceneDef): SceneDef => {
    for (const p of local) {
      starts.set(p.id, p.t);
      placements.push({ id: p.id, t: s.t0 + p.t, dur: p.dur });
    }
    return s;
  };
  const at = (id: string): number => {
    const p = local.find((x) => x.id === id);
    if (!p) throw new Error(`scene "${name}": line "${id}" is not one of its lines`);
    return p.t;
  };
  return { dur, subs, at, bind };
}

export interface NarratedOpts extends Omit<SceneDef, 'f0' | 'f1' | 't0' | 'd' | 'dur' | 'subs' | 'sfx'>, NarrationTiming {
  /** Extra captions besides the lines (scene seconds). */
  subs?: Sub[];
  /** Sound cues (scene seconds), or a function of `at(id)`, a line's start in this scene, for cues that land on a line. */
  sfx?: Sfx[] | ((at: (id: string) => number) => Sfx[]);
}

/** Register a page or plate scene timed by its narration. */
export function narratedScene(o: NarratedOpts): SceneDef {
  const { lines, lead, gap, tail, minDur, split, shown, subs, sfx, ...rest } = o;
  const n = narrationTiming(o.name, { lines, lead, gap, tail, minDur, split, shown });
  return n.bind(scene({ ...rest, dur: n.dur, subs: [...(subs ?? []), ...n.subs], sfx: typeof sfx === 'function' ? sfx(n.at) : sfx }));
}

/**
 * Place narration lines at fixed times in a registered scene, for a film whose timeline is set by its pictures (the
 * scene keeps its own length and captions): `at` maps line ids to seconds on the scene's clock. Every line must belong
 * to this scene in the script, be placed once, end inside the scene and not overlap the next one; otherwise the film
 * refuses to load (the voice is longer than the picture allows: shorten the line or lengthen the scene).
 * The scene's own captions then follow the voice (syncSubs): a caption belongs to the placed line it overlaps most,
 * and a line's captions are retimed to where its phrases are spoken.
 */
export function placeNarration(s: SceneDef, at: Record<string, number>): SceneDef {
  if (!script || !lock) throw new Error(`scene "${s.name}": no narration installed (useNarration in film.ts)`);
  const ps = Object.entries(at).map(([id, t]) => {
    const line = script!.lines.find((l) => l.id === id);
    if (!line) throw new Error(`scene "${s.name}": no line "${id}" in the script`);
    if (line.scene !== s.name) throw new Error(`scene "${s.name}": line "${id}" belongs to scene "${line.scene}" in the script`);
    if (starts.has(id)) throw new Error(`scene "${s.name}": narration line "${id}" is already placed`);
    if (!(Number.isFinite(t) && t >= 0)) throw new Error(`scene "${s.name}": line "${id}" at ${t}: a time >= 0`);
    return { id, t, dur: lock!.lines[id].duration };
  }).sort((a, b) => a.t - b.t);
  ps.forEach((p, i) => {
    const end = i + 1 < ps.length ? ps[i + 1].t : s.d;
    if (p.t + p.dur > end + 1e-9)
      throw new Error(`scene "${s.name}": line "${p.id}" (${p.dur.toFixed(2)} s from ${p.t} s) runs ${(p.t + p.dur - end).toFixed(2)} s past ${i + 1 < ps.length ? `line "${ps[i + 1].id}"` : 'the end of the scene'}`);
  });
  for (const p of ps) {
    starts.set(p.id, p.t);
    placements.push({ id: p.id, t: s.t0 + p.t, dur: p.dur });
  }
  s.subs = syncSubs(s.subs, ps.map((p) => ({ t: p.t, dur: p.dur, text: lock!.lines[p.id].text, read: lock!.lines[p.id].read, spans: lock!.lines[p.id].spans })), s.d);
  return s;
}

/** Caption or line text reduced to what is said: letters, digits, CJK. */
const bare = (s: string): string => (s.match(/[\p{L}\p{N}]/gu) ?? []).join('');
/** Seconds a line's last caption stays after its speech ends (unless the next line or caption starts sooner). */
export const CAPTION_HOLD = 0.5;
/** How far a phrase boundary may move to reach a pause: this, or 15 % of the line, whichever is longer. */
const SNAP = 0.6;
/** Spoken length of caption text, for placing phrase boundaries: a CJK character counts one, a Latin word two (as
 *  the scripts estimate it), a digit one. */
export const spokenLength = (s: string): number =>
  (s.match(/[㐀-鿿]/g)?.length ?? 0) + 2 * (s.match(/[A-Za-z]+/g)?.length ?? 0) + (s.match(/\d/g)?.length ?? 0);

/**
 * Captions retimed to the voice (scene seconds). Each caption belongs to the line whose text contains it (letters,
 * digits and CJK compared), else to the line it overlaps most (none: unchanged).
 * A line's captions, in order, split its speech where they fall in its reading (readingSplits; else in proportion to
 * their spoken length); each boundary after the first
 * moves to the nearest place where the speech resumes after a pause (the lock's spans) within SNAP, later than the
 * previous one, so a caption appears as its phrase is spoken. The first caption starts with the line; each ends where
 * the next begins; the last stays CAPTION_HOLD after the speech, but not past the next line, the next other caption
 * or the scene's end, and runs on to whichever of those comes next if it would otherwise leave a gap under 0.5 s. Pre: lines do not overlap (placeNarration checks). Post: the owned captions of a line are
 * contiguous, ordered, and cover the line's speech.
 */
/** Weight of one character of what is said: a CJK character a syllable, a Latin letter a quarter of one. */
const weight = (c: string): number => (/[A-Za-z]/.test(c) ? 0.25 : 1);
/**
 * Where each caption starts in a line's reading, as a fraction of its spoken weight (the first need not start the
 * line: words shown only as display text are spoken without a caption): the captions' letters and
 * CJK characters (not digits: the reading writes numbers out) are found in order in the reading; a boundary is the
 * end of the previous caption's last character, or, when that caption ends in digits (read out after it), the start
 * of this caption's first character; the first caption starts at its first character. Null when a caption's characters are not in the reading in order.
 */
export function readingSplits(captions: string[], read: string): number[] | null {
  const r = [...bare(read)];
  const cum = [0];
  for (const c of r) cum.push(cum[cum.length - 1] + weight(c));
  const total = cum[r.length] || 1;
  let at = 0;
  const firsts: number[] = [], lasts: number[] = [];
  for (const cap of captions) {
    const cs = [...bare(cap)].filter((c) => !/\p{N}/u.test(c)); // digits: the reading writes numbers out
    let first = -1;
    for (const c of cs) {
      const k = r.indexOf(c, at);
      if (k < 0) return null;
      if (first < 0) first = k;
      at = k + 1;
    }
    firsts.push(first < 0 ? at : first);
    lasts.push(at);
  }
  return captions.map((_, k) => {
    if (k === 0) return /^\p{N}/u.test(bare(captions[0])) ? 0 : cum[firsts[0]] / total; // leading digits are read first
    const endsInDigit = /\p{N}$/u.test(bare(captions[k - 1]));
    return (endsInDigit ? cum[firsts[k]] : cum[lasts[k - 1]]) / total;
  });
}

export function syncSubs(subs: Sub[], lines: { t: number; dur: number; text?: string; read?: string; spans?: [number, number][] }[], end: number): Sub[] {
  const ls = [...lines].sort((a, b) => a.t - b.t);
  const owner = subs.map(([a, b, zh]) => {
    const said = bare(zh);
    const by = said ? ls.findIndex((l) => l.text !== undefined && bare(l.text).includes(said)) : -1;
    if (by >= 0) return by;
    let best = -1, most = 0;
    ls.forEach((l, i) => {
      const o = Math.min(b, l.t + l.dur) - Math.max(a, l.t);
      if (o > most + 1e-9) { most = o; best = i; }
    });
    return best;
  });
  const out = subs.map((x) => [...x] as Sub);
  ls.forEach((l, i) => {
    const mine = subs.map((_, j) => j).filter((j) => owner[j] === i).sort((x, y) => subs[x][0] - subs[y][0]);
    if (!mine.length) return;
    const w = mine.map((j) => Math.max(1, spokenLength(subs[j][2])));
    const total = w.reduce((x, y) => x + y, 0);
    const split = l.read !== undefined ? readingSplits(mine.map((j) => subs[j][2]), l.read) : null;
    const onsets = (l.spans ?? []).slice(1).map(([a]) => l.t + a);
    const tol = Math.max(SNAP, 0.15 * l.dur);
    const at: number[] = [];
    let cum = 0, used = -1;
    for (let k = 0; k < mine.length; k++) {
      if (k > 0) cum += w[k - 1];
      const frac = split ? split[k] : cum / total;
      if (k === 0 && frac < 0.02) { at.push(l.t); continue; } // the line opens with this caption
      const want = l.t + l.dur * frac, after = k > 0 ? at[k - 1] : l.t;
      let pick = -1;
      onsets.forEach((c, m) => { if (m > used && c > after && Math.abs(c - want) <= tol && (pick < 0 || Math.abs(c - want) < Math.abs(onsets[pick] - want))) pick = m; });
      if (pick >= 0) used = pick;
      at.push(pick >= 0 ? onsets[pick] : k > 0 ? Math.max(want, after + 0.3) : want);
    }
    const nextLine = i + 1 < ls.length ? ls[i + 1].t : end;
    const others = subs.map((x, j) => (owner[j] !== i && x[0] > l.t ? x[0] : Infinity));
    const limit = Math.min(nextLine, end, ...others);
    // no sliver of a gap before the next caption (Netflix timing: 2 frames or at least 0.5 s)
    const stop = limit - (l.t + l.dur + CAPTION_HOLD) < 0.5 ? limit : l.t + l.dur + CAPTION_HOLD;
    mine.forEach((j, k) => {
      out[j][0] = +at[k].toFixed(3);
      out[j][1] = +(k + 1 < mine.length ? at[k + 1] : Math.max(stop, at[k] + 0.3)).toFixed(3);
    });
  });
  return out;
}

/** A line's start on its scene's clock (seconds), for animations that land on it. Call it inside draw(). */
export function vo(id: string): number {
  const t = starts.get(id);
  if (t === undefined) throw new Error(`vo("${id}"): the line is not placed in any narrated scene`);
  return t;
}

const partsMemo = new Map<string, number[]>();
/**
 * Where each of `parts` (consecutive pieces of line `id`'s text, in order, e.g. the lines of a display block) starts
 * being spoken, on its scene's clock: the same placement as the captions (readingSplits, snapped to the pauses).
 * For animations that land on a phrase; call it inside draw().
 */
export function voParts(id: string, parts: string[]): number[] {
  const key = JSON.stringify([id, parts]);
  const hit = partsMemo.get(key);
  if (hit) return hit;
  const t = vo(id), e = lock!.lines[id];
  const subs = parts.map((p) => [t, t + e.duration, p, ''] as Sub);
  const at = syncSubs(subs, [{ t, dur: e.duration, text: e.text, read: e.read, spans: e.spans }], Infinity).map((x) => x[0]);
  partsMemo.set(key, at);
  return at;
}

/** Every placed line (film seconds, for the mix) and the script lines no scene placed. */
export const narrationReport = (): { placements: LinePlacement[]; unplaced: string[] } => ({
  placements: [...placements],
  unplaced: (script?.lines ?? []).map((l) => l.id).filter((id) => !starts.has(id)),
});
