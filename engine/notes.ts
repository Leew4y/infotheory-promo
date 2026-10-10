/**
 * Notes the engine records while a film registers: things that are allowed but worth a person's look (a recorded click
 * that an edit cuts away). scripts/validate.ts reports them as warnings, through the page's __notes() hook.
 */
export interface Note { code: string; path: string; message: string }

const notes: Note[] = [];
export function note(code: string, path: string, message: string): void {
  notes.push({ code, path, message });
}
export const allNotes = (): Note[] => [...notes];
