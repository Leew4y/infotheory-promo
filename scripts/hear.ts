/**
 * Transcribe a film's committed narration and compare it with the text each line was meant to say:
 *
 *   bun scripts/hear.ts --film <id>        (just hear <id>)
 *
 * The recordings cannot be listened to by an agent; this is the nearest measurement. It uses the local `speech` tool
 * (Apple silicon: brew install speech; Qwen3-ASR 0.6B, about 680 MB on the first run, into .cache/asr/) on
 * films/<id>/narration/<id>.flac, and compares with each line's `read` in the lock after dropping what the ear cannot
 * tell apart (punctuation, digits against Chinese numerals, 他/她/它, 的/得/地).
 *
 * It gives evidence, and a person judges. A recogniser also makes mistakes, and writes a name its own way (Clay as 克莱),
 * so most lines reported as differing are fine: listen to those it names. Writes out/<id>/hear.md (the lines that differ,
 * worst first) and out/<id>/hear.json (every line).
 * - differs   the transcript is not the line: listen to it (reported, exit 0).
 * - wrong     under WRONG_BELOW of the characters match: this audio is not this line (exit 1).
 * - missing   a line of the lock has no audio or no transcript (exit 1); no line is ever passed unheard.
 * Exit code 0: nothing wrong or missing; 1: some line is; 2: the tool could not run (no lock, no speech tool).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { requireFilm } from './film-arg';
import { compareLines, parseTranscripts, WRONG_BELOW } from './lib/hear';

const ROOT = path.resolve(import.meta.dir, '..');
const FILM = requireFilm(Bun.argv.slice(2));
const stop = (m: string): never => { console.error(`hear: ${m}`); process.exit(2); };
const LOCK = path.join(ROOT, 'films', FILM, 'narration.lock.json'), AUDIO = path.join(ROOT, 'films', FILM, 'narration');
if (!existsSync(LOCK)) stop(`films/${FILM} has no narration.lock.json: nothing to hear`);
if (!Bun.which('speech')) stop('the speech tool is missing (Apple silicon only): brew install speech');
const lines: Record<string, { read?: string; text: string }> = JSON.parse(readFileSync(LOCK, 'utf8')).lines ?? {};
const ids = Object.keys(lines);
if (!ids.length) stop(`films/${FILM}/narration.lock.json has no lines`);

const CACHE = path.join(ROOT, '.cache', 'asr');
if (!existsSync(CACHE)) console.log('first run: the speech tool downloads its model (about 680 MB) into .cache/asr/');
const said = ids.map((id) => lines[id].read ?? lines[id].text).join('');
const language = (said.match(/\p{Script=Han}/gu)?.length ?? 0) * 2 >= said.length ? 'chinese' : 'english';
const p = Bun.spawn(['speech', 'transcribe-batch', AUDIO, '--language', language, '--extensions', 'flac', '--jsonl'], {
  stdout: 'pipe', stderr: 'pipe', env: { ...process.env, QWEN3_ASR_CACHE_DIR: CACHE },
});
const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
if (code !== 0) stop(`speech transcribe-batch failed (${code}): ${err.trim().split('\n').slice(-2).join(' ')}`);

const results = compareLines(lines, parseTranscripts(out));
const by = (level: string) => results.filter((r) => r.level === level);
const worst = results.filter((r) => r.level !== 'same').sort((a, b) => a.score - b.score);
const DIR = path.join(ROOT, 'out', FILM);
mkdirSync(DIR, { recursive: true });
writeFileSync(path.join(DIR, 'hear.json'), JSON.stringify({ film: FILM, language, wrongBelow: WRONG_BELOW, lines: results }, null, 1) + '\n');
writeFileSync(path.join(DIR, 'hear.md'), [
  `# ${FILM}: narration heard back`, '',
  `${results.length} lines: ${by('same').length} same, ${by('differs').length} differ, ${by('wrong').length} wrong, ${by('missing').length} missing. Machine transcription: listen before changing anything.`, '',
  ...worst.flatMap((r) => [`## ${r.id} (${r.level}, ${r.score.toFixed(3)})`, `- meant: ${r.read}`, `- heard: ${r.heard ?? '(nothing)'}`, '']),
].join('\n'));
for (const r of worst) console.log(`${r.level.padEnd(8)}${r.score.toFixed(3)} ${r.id}\n  meant: ${r.read}\n  heard: ${r.heard ?? '(nothing)'}`);
const bad = by('wrong').length + by('missing').length;
console.log(`${bad ? 'FAIL' : 'PASS'} hear ${FILM}: ${results.length} lines, ${by('same').length} same, ${by('differs').length} differ, ${by('wrong').length} wrong, ${by('missing').length} missing -> out/${FILM}/hear.md`);
process.exit(bad ? 1 : 0);
