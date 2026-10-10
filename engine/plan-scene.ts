/** Drawing adapter kept separate so the plan contracts can run without a browser. */
import { film } from './film';
import { demoScene, type DemoOpts } from './demo';
import { narratedScene } from './narration';
import { scene, type SceneDef } from './scene';
import { planCapture, plannedScene, recordPlanScene } from './plan';

export interface PlanDraw extends Pick<SceneDef, 'draw' | 'cam' | 'mb' | 'grade' | 'fade'> {
  overlay?: DemoOpts['overlay'];
}

export function planScene(id: string, o: PlanDraw): SceneDef {
  const p = plannedScene(id);
  const { draw, cam, mb, grade, fade, overlay } = o;
  const common = { name: id, chapter: p.chapter, ch: p.chapter === undefined ? undefined : p.title, mb, grade, fade };
  const timing = { minDur: p.minDur, lead: p.lead, gap: p.gap, tail: p.tail };
  if (p.kind === 'demo') {
    const c = p.capture!;
    const s = demoScene({
      ...common, asset: planCapture(c.asset), edit: c.edit, camera: c.camera, title: c.title,
      dur: p.dur, narration: p.lines ? timing : undefined, subs: p.captions,
      overlay: (lt, d, at) => { draw(lt, d, s.t0 + lt); overlay?.(lt, d, at); },
    });
    // Rendering options belong to the scene; all content and timing came from the plan.
    if (cam) s.cam = cam;
    s.fade = fade;
    return recordPlanScene(s);
  }
  if (overlay) throw new Error(`film ${film().id}, scene ${id}: overlay is only for a demo`);
  const opts = { ...common, kind: p.kind, draw, cam };
  return recordPlanScene(p.lines
    ? narratedScene({ ...opts, ...timing })
    : scene({ ...opts, dur: p.dur!, subs: p.captions ?? [] }));
}
