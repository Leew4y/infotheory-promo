/**
 * Style packages. A style owns everything about how a film looks: the palette (semantic names), fonts, the page
 * background, the full-frame plate background, the page grid and its typographic blocks, the chapter label and
 * caption overlays, the colour grade, and the default motion (fades, camera drift).
 *
 * The engine and the scenes only see the active style through this module. A film installs its style with
 * useStyle() in its film.ts, before any scene module runs: `C`, `F`, `M` and `COL` are filled in place there,
 * so values a scene captures at registration (e.g. a fade colour) already come from the active style.
 */
import type { Grade } from './gl';

export interface Palette {
  /** Page paper and its darker tone. */
  bg: string;
  bg2: string;
  /** Ink: main and secondary. */
  fg: string;
  fg2: string;
  /** Labels, notes, axis text. */
  muted: string;
  /** Hairlines and rules. */
  rule: string;
  /** The single strong accent, and its lighter form. */
  accent: string;
  accent2: string;
  /** Two quiet secondary colours for diagrams. */
  alt: string;
  alt2: string;
  /** Text on full-frame plates. */
  fgOnDark: string;
  mutedOnDark: string;
}

export interface Fonts {
  /** CJK body and headings. */
  body: string;
  /** Latin text, captions' English line, small caps labels. */
  latin: string;
  math: string;
  mono: string;
}

/** Parameters of the full-frame plate background; each style interprets them (the dawn style: time of day, sun height). */
export interface PlateParams {
  time?: number;
  light?: number;
  sun?: number;
}

export interface SubLine {
  a: number;
  b: number;
  zh: string;
  en: string;
  plate: boolean;
}

export interface StylePackage {
  id: string;
  palette: Palette;
  fonts: Fonts;
  /** Grade for pages; plates merge plateGrade over it; a scene's own grade merges last. */
  grade: Grade;
  plateGrade: Partial<Grade>;
  /** Base fill under each scene kind, and the default colour a scene fades through. */
  fills: { page: string; plate: string };
  motion: {
    /** Default scene fade-in / fade-out, seconds. */
    fadeIn: number;
    fadeOut: number;
    /** Default page camera: slow push-in by this fraction over the scene. */
    drift: number;
  };
  layout: {
    /** Left/right margin and the x of the right (diagram) column. */
    margin: number;
    column: number;
  };
  background(): void;
  plate(u: PlateParams): void;
  /** The chapter's one-line thesis with its English line. */
  statement(zh: string, en: string, lt: number, t0?: number, y?: number, size?: number): void;
  /** A typeset list row: key, title, note. */
  row(key: string, title: string, note: string, x: number, y: number, a: number, keyW?: number): void;
  /** Chapter label and page number overlay on chapter pages. */
  chapterLabel(lt: number, d: number, n: number, ch: [string, string], chapters: number): void;
  /** Bilingual captions overlay at film time T. */
  captions(T: number, subs: SubLine[]): void;
}

export const C = {} as Palette;
export const F = {} as Fonts;
export let M = 0;
export let COL = 0;
let active: StylePackage | null = null;

export function useStyle(s: StylePackage): void {
  active = s;
  Object.assign(C, s.palette);
  Object.assign(F, s.fonts);
  M = s.layout.margin;
  COL = s.layout.column;
}

export function style(): StylePackage {
  if (!active) throw new Error('no style installed: call useStyle() in the film module before its scenes');
  return active;
}

export const background = (): void => style().background();
export const plate = (u: PlateParams): void => style().plate(u);
export const statement: StylePackage['statement'] = (...a) => style().statement(...a);
export const row: StylePackage['row'] = (...a) => style().row(...a);
