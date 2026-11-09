/** Comparing what a narration line was meant to say with what speech recognition heard (scripts/hear.ts). */

/** Below this share of matching characters the audio is not the line; the lowest real line so far is 0.718 (full of product names, which a recogniser spells its own way). */
export const WRONG_BELOW = 0.5;

const DIGIT: Record<string, string> = { 0: '〇', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九' };

/** What the ear cannot tell apart or a recogniser writes either way: case, digits, punctuation, 他/她/它, 的/得/地. */
export function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[0-9]/g, (d) => DIGIT[d])
    .replace(/零/g, '〇')
    .replace(/[他她]/g, '它')
    .replace(/[得地]/g, '的')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

/** 1 when the two say the same after normalize(), falling to 0 with the edit distance over the longer one. */
export function similarity(meant: string, heard: string): number {
  const a = normalize(meant), b = normalize(heard);
  const longer = Math.max(a.length, b.length);
  return longer ? 1 - distance(a, b) / longer : 1;
}

/** speech transcribe-batch --jsonl: file stem -> text. Other output lines (progress) are not JSON objects and are skipped. */
export function parseTranscripts(jsonl: string): Map<string, string> {
  const heard = new Map<string, string>();
  for (const line of jsonl.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const r = JSON.parse(line) as { file?: unknown; text?: unknown };
      if (typeof r.file === 'string' && typeof r.text === 'string') heard.set(r.file.replace(/\\/g, '/').split('/').pop()!.replace(/\.[^.]+$/, ''), r.text);
    } catch { /* not a result line */ }
  }
  return heard;
}

export interface Heard { id: string; read: string; heard: string | null; score: number; level: 'same' | 'differs' | 'wrong' | 'missing' }

/** One verdict per line of the lock, in the lock's order. A line with no transcript is missing, never a pass. */
export function compareLines(lines: Record<string, { read?: string; text: string }>, heard: Map<string, string>): Heard[] {
  return Object.entries(lines).map(([id, l]) => {
    const read = l.read ?? l.text, got = heard.get(id);
    if (got === undefined) return { id, read, heard: null, score: 0, level: 'missing' };
    const score = similarity(read, got);
    return { id, read, heard: got, score, level: score === 1 ? 'same' : score < WRONG_BELOW ? 'wrong' : 'differs' };
  });
}
