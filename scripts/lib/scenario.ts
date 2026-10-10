/**
 * The contract of a capture scenario (scripts/capture.ts): a module that says which page to open and what to do on it.
 *
 *   import type { Scenario } from '../../../scripts/lib/scenario';
 *   export default { url: 'https://example.com', async run(act) { await act.click('text=Sign in'); await act.wait(800); } } satisfies Scenario;
 *
 * Every action moves the real mouse (so the recorded cursor path is the one the viewer sees), and the page records
 * pointer and key events on its own clock, the clock of the screencast frames.
 */
import type { Page } from 'playwright-core';

export interface Act {
  page: Page;
  /** Glide the mouse to the element's centre over `ms` (default 600), then click it. */
  click(selector: string, o?: { ms?: number }): Promise<void>;
  /** Glide the mouse to (x, y) in viewport CSS pixels over `ms` (default 600). */
  move(x: number, y: number, o?: { ms?: number }): Promise<void>;
  /** Click into the element, then type `text` a key at a time (`delay` ms apart, default 70). */
  type(selector: string, text: string, o?: { delay?: number }): Promise<void>;
  /** Scroll the page by dy pixels with the mouse wheel, in small steps. */
  scroll(dy: number): Promise<void>;
  wait(ms: number): Promise<void>;
  /** A labelled moment (it lands in the asset's events as type "mark"). */
  mark(label: string): void;
}

export interface Scenario {
  /** The page to open (http(s):// or file://). */
  url: string;
  /** Viewport in CSS pixels (default 1920x1080, device pixel ratio 1: frames are taken at that size). */
  viewport?: { width: number; height: number };
  run(act: Act): Promise<void>;
}
