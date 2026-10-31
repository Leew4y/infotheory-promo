// Shared by the tongzhou capture scenarios: a pointer that glides in wall-clock time. scripts/lib/scenario.ts `act.move`
// takes ms / 16 steps whatever each step costs, so on a busy screencast a "600 ms" glide may take 2 s. This one spends
// the time it is given (steps are as many as fit), so the marks and the recorded timing of a scenario stay close to
// what it says. It drives page.mouse itself: a scenario uses either this or act.move / act.click, not both.
export function driver(act: any) {
  const page = act.page;
  const vp = page.viewportSize() as { width: number; height: number };
  let mx = vp.width / 2, my = vp.height / 2; // the recorder starts the mouse at the centre
  const glide = async (x: number, y: number, ms = 600) => {
    const x0 = mx, y0 = my, t0 = performance.now();
    for (;;) {
      const u = Math.min(1, (performance.now() - t0) / ms), e = u * u * (3 - 2 * u);
      await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
      if (u >= 1) break;
    }
    mx = x; my = y;
  };
  /** The point `dx` px from the element's left edge (or its centre when dx is omitted), at mid height. */
  const point = async (sel: string, o: { dx?: number; dy?: number } = {}) => {
    const box = await page.locator(sel).first().boundingBox();
    if (!box) throw new Error(`"${sel}" is not visible`);
    return { x: box.x + (o.dx ?? box.width / 2), y: box.y + (o.dy ?? box.height / 2) };
  };
  const over = async (sel: string, o: { ms?: number; dx?: number; dy?: number } = {}) => { const p = await point(sel, o); await glide(p.x, p.y, o.ms); };
  const press = async () => { await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up(); };
  const click = async (sel: string, o: { ms?: number; dx?: number; dy?: number } = {}) => { await over(sel, o); await press(); };
  /** Press at the current position, glide to (x, y), release. */
  const drag = async (x: number, y: number, ms = 800) => { await page.mouse.down(); await glide(x, y, ms); await page.mouse.up(); };
  /** Scroll the document to `y` over `ms` (the wheel would zoom a 3D plot under the pointer instead). */
  const scrollTo = async (y: number, ms = 800) => {
    const y0 = (await page.evaluate(() => scrollY)) as number, t0 = performance.now();
    for (;;) {
      const u = Math.min(1, (performance.now() - t0) / ms), e = u * u * (3 - 2 * u);
      await page.evaluate((v: number) => scrollTo(0, v), y0 + (y - y0) * e);
      if (u >= 1) break;
    }
  };
  /** Scroll an inner scroll area (a panel with its own overflow) to `y` over `ms`. */
  const scrollEl = async (sel: string, y: number, ms = 800) => {
    const loc = page.locator(sel).first();
    const y0 = (await loc.evaluate((e: Element) => e.scrollTop)) as number, t0 = performance.now();
    for (;;) {
      const u = Math.min(1, (performance.now() - t0) / ms), e = u * u * (3 - 2 * u);
      await loc.evaluate((el: Element, v: number) => { el.scrollTop = v; }, y0 + (y - y0) * e);
      if (u >= 1) break;
    }
  };
  return { page, scrollTo, scrollEl, glide, over, click, press, drag, point, wait: act.wait as (ms: number) => Promise<void>, mark: act.mark as (l: string) => void, pos: () => ({ x: mx, y: my }) };
}
