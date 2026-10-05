/** String-literal scanner for TypeScript sources, used by scripts/fonts.ts to collect a film's characters. */

/**
 * Decoded contents of every string and template literal in `src`, comments skipped. Template literals contribute
 * their text parts; the code inside `${...}` is scanned recursively, so literals nested there are found too.
 * Regular-expression literals are not recognised (their text may be read as code); film text does not live in them.
 */
export function literals(src: string): string[] {
  const out: string[] = [];
  const simple: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' };
  /** Decode the escape at src[j] === '\\'; returns [text, next index]. */
  const esc = (j: number): [string, number] => {
    const c = src[j + 1];
    if (c === 'u' && src[j + 2] === '{') { const k = src.indexOf('}', j + 3); return [String.fromCodePoint(parseInt(src.slice(j + 3, k), 16)), k + 1]; }
    if (c === 'u') return [String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16)), j + 6];
    if (c === 'x') return [String.fromCharCode(parseInt(src.slice(j + 2, j + 4), 16)), j + 4];
    if (c === '\r' || c === '\n') return ['', j + (c === '\r' && src[j + 2] === '\n' ? 3 : 2)];
    return [simple[c] ?? c, j + 2];
  };
  /** Scan code from i until an unmatched `}` (when `inside`) or the end; returns the index after it. */
  const code = (i: number, inside: boolean): number => {
    let depth = 0;
    while (i < src.length) {
      const c = src[i], d = src[i + 1];
      if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && d === '*') { const k = src.indexOf('*/', i + 2); i = k < 0 ? src.length : k + 2; continue; }
      if (c === '"' || c === "'") { i = quoted(i, c); continue; }
      if (c === '`') { i = template(i); continue; }
      if (inside && c === '{') depth++;
      if (inside && c === '}') { if (depth === 0) return i + 1; depth--; }
      i++;
    }
    return i;
  };
  const quoted = (i: number, q: string): number => {
    let s = '', j = i + 1;
    while (j < src.length && src[j] !== q) {
      if (src[j] === '\\') { const [t, k] = esc(j); s += t; j = k; continue; }
      s += src[j++];
    }
    out.push(s);
    return j + 1;
  };
  const template = (i: number): number => {
    let s = '', j = i + 1;
    while (j < src.length && src[j] !== '`') {
      if (src[j] === '\\') { const [t, k] = esc(j); s += t; j = k; continue; }
      if (src[j] === '$' && src[j + 1] === '{') { out.push(s); s = ''; j = code(j + 2, true); continue; }
      s += src[j++];
    }
    out.push(s);
    return j + 1;
  };
  code(0, false);
  return out;
}
