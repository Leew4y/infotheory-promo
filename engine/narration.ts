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
import { scene, type SceneDef, type Sub } from './scene';

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
export interface LockLine { text: string; read: string; duration: number; sha256: string; key: string }
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
export function useNarration(s: NarrationScript, l: NarrationLock): void {
  const f = film().id;
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
}

/**
 * Time a scene by its narration: its duration (whole frames, never cutting a line or the minimum), the lines as
 * captions, and bind(), to call with the registered scene, which places the lines on the film.
 */
export function narrationTiming(name: string, o: NarrationTiming): { dur: number; subs: Sub[]; bind: (s: SceneDef) => SceneDef } {
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
    subs.push([t, t + dur, line.text, line.en ?? '']);
    t += dur + (i < ids.length - 1 ? (line.pause ?? gap) : 0);
  });
  const dur = Math.ceil(Math.max(o.minDur ?? 0, t + tail) * FPS - 1e-9) / FPS;
  const bind = (s: SceneDef): SceneDef => {
    for (const p of local) {
      starts.set(p.id, p.t);
      placements.push({ id: p.id, t: s.t0 + p.t, dur: p.dur });
    }
    return s;
  };
  return { dur, subs, bind };
}

export interface NarratedOpts extends Omit<SceneDef, 'f0' | 'f1' | 't0' | 'd' | 'dur' | 'subs'>, NarrationTiming {
  /** Extra captions besides the lines (scene seconds). */
  subs?: Sub[];
}

/** Register a page or plate scene timed by its narration. */
export function narratedScene(o: NarratedOpts): SceneDef {
  const { lines, lead, gap, tail, minDur, subs, ...rest } = o;
  const n = narrationTiming(o.name, { lines, lead, gap, tail, minDur });
  return n.bind(scene({ ...rest, dur: n.dur, subs: [...(subs ?? []), ...n.subs] }));
}

/**
 * Place narration lines at fixed times in a registered scene, for a film whose timeline is set by its pictures (the
 * scene keeps its own length and captions): `at` maps line ids to seconds on the scene's clock. Every line must belong
 * to this scene in the script, be placed once, end inside the scene and not overlap the next one; otherwise the film
 * refuses to load (the voice is longer than the picture allows: shorten the line or lengthen the scene).
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
  return s;
}

/** A line's start on its scene's clock (seconds), for animations that land on it. Call it inside draw(). */
export function vo(id: string): number {
  const t = starts.get(id);
  if (t === undefined) throw new Error(`vo("${id}"): the line is not placed in any narrated scene`);
  return t;
}

/** Every placed line (film seconds, for the mix) and the script lines no scene placed. */
export const narrationReport = (): { placements: LinePlacement[]; unplaced: string[] } => ({
  placements: [...placements],
  unplaced: (script?.lines ?? []).map((l) => l.id).filter((id) => !starts.has(id)),
});
