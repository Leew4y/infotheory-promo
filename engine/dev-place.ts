/**
 * Where `just dev` opens (only the dev server's page: engine/boot.ts). A reload comes back to the same moment of the same
 * scene, so a scene edited earlier in the film does not move what is being looked at. The URL says where to open:
 * ?scene=<name>, ?t=<seconds>, ?loop=1 (and play that scene over and over).
 */
export interface Place { search: string; scene: string; lt: number; loop: boolean; playing: boolean }
interface Span { name: string; t0: number; d: number }
export interface Start { t: number; loop: boolean; playing: boolean; error?: string }

/** The start for a page opened with `search`; `saved` counts only if it was left under the same URL. */
export function startPlace(scenes: readonly Span[], total: number, search: string, saved: Place | null): Start {
  const fit = (t: number) => Math.min(Math.max(t, 0), Math.max(total - 0.01, 0));
  const inScene = (name: string, lt: number): number | null => {
    const s = scenes.find((x) => x.name === name);
    return s ? fit(s.t0 + Math.min(Math.max(lt, 0), Math.max(s.d - 1 / 60, 0))) : null;
  };
  if (saved && saved.search === search) {
    const t = inScene(saved.scene, saved.lt);
    if (t !== null) return { t, loop: saved.loop, playing: saved.playing };
  }
  const p = new URLSearchParams(search), loop = p.get('loop') === '1';
  const name = p.get('scene');
  if (name !== null) {
    const t = inScene(name, 0);
    if (t === null) return { t: 0, loop: false, playing: false, error: `?scene=${name}: no such scene (${scenes.map((s) => s.name).join(', ')})` };
    return { t, loop, playing: loop };
  }
  const t = Number(p.get('t'));
  return { t: p.has('t') && Number.isFinite(t) ? fit(t) : 0, loop, playing: loop };
}
