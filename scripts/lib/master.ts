/**
 * Whether a film's final mix (out/<film>/master.wav, described by master.json from audio/mix.py) is still the film's:
 * the export refuses a stale one, and verify must not accept an MP4 made from one.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..', '..');
const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');

export interface Placement { id: string; t: number; dur: number }
export const masterPath = (film: string): string => path.join(ROOT, 'out', film, 'master.wav');

/**
 * The placements' identity: ids with start and duration in whole microseconds (floor(x * 1e6 + 0.5)). Computed here only:
 * export --narration writes it into the placements file, audio/mix.py copies it into master.json.
 */
export const placementsDigest = (ps: Placement[]): string =>
  sha256(ps.map((p) => `${p.id}:${Math.floor(p.t * 1e6 + 0.5)}:${Math.floor(p.dur * 1e6 + 0.5)}`).join('\n'));

/** Why the final mix no longer matches the film (out/<film>/master.json, written by audio/mix.py), or null. */
export function masterStale(film: string, tl: { frames: number; fps: number }, placements: Placement[]): string | null {
  const meta = path.join(ROOT, 'out', film, 'master.json'), master = masterPath(film);
  if (!existsSync(meta)) return 'no master.json';
  const m: { frames: number; fps: number; music: { path: string; external: boolean; sha256: string } | 'none'; lock: string; placements: string; master: string } = JSON.parse(readFileSync(meta, 'utf8'));
  if (m.frames !== tl.frames || m.fps !== tl.fps) return `it was mixed for ${m.frames} frames at ${m.fps} fps, the film has ${tl.frames} at ${tl.fps}`;
  if (!existsSync(master) || sha256(readFileSync(master)) !== m.master) return 'master.wav is not the one master.json describes';
  if (m.music !== 'none') {
    const music = m.music.external ? m.music.path : path.join(ROOT, m.music.path);
    if (!existsSync(music) || sha256(readFileSync(music)) !== m.music.sha256) return 'the music changed';
  }
  const lock = path.join(ROOT, 'films', film, 'narration.lock.json');
  if ((existsSync(lock) ? sha256(readFileSync(lock)) : 'none') !== m.lock) return 'the narration changed';
  if (placementsDigest(placements) !== m.placements) return 'the narration moved in the timeline';
  return null;
}
