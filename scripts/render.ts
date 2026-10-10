/** Resolve an edit from the built page, then delegate encoding, verification and publication to export.ts. */
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { requireFilm } from './film-arg';
import { ROOT } from './plan-schema';

const argv = Bun.argv.slice(2);
const usage = (m: string): never => { console.error(m); process.exit(2); };
let o;
try {
  o = parseArgs({ args: argv, options: {
    film: { type: 'string' }, scene: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' },
    draft: { type: 'boolean' }, style: { type: 'string' },
  } }).values;
} catch (e) { usage((e as Error).message); }
const opts = o!, id = requireFilm(argv);
if (opts.scene ? opts.from !== undefined || opts.to !== undefined : opts.from === undefined || opts.to === undefined)
  usage('render: give --scene <id> or --from <seconds> --to <seconds>');
const dir = path.join(ROOT, 'out', id, 'render');
mkdirSync(dir, { recursive: true });
const timeline = path.join(dir, `.timeline-${process.pid}-${crypto.randomUUID()}.json`);
const styleArgs = opts.style ? ['--style', opts.style] : [];
// Child stdout goes to stderr: this command's stdout is exactly one JSON summary on success.
const run = async (args: string[]) => {
  const p = Bun.spawn([process.execPath, path.join(ROOT, 'scripts/export.ts'), '--film', id, ...styleArgs, ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'inherit' });
  for await (const chunk of p.stdout) process.stderr.write(chunk);
  return await p.exited;
};
try {
  let code = await run(['--timeline', timeline]);
  if (code) process.exitCode = code;
  else {
    const tl: { fps: number; frames: number; style: string; scenes: { name: string; f0: number; f1: number }[] } = JSON.parse(readFileSync(timeline, 'utf8'));
    const s = opts.scene ? tl.scenes.find((s) => s.name === opts.scene) : undefined;
    if (opts.scene && !s) throw Object.assign(new Error(`scene "${opts.scene}" is not in ${id}'s timeline`), { exit: 2 });
    const from = s ? s.f0 : Math.round(Number(opts.from) * tl.fps);
    const to = s ? s.f1 : Math.min(Math.round(Number(opts.to) * tl.fps), tl.frames);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from)
      throw Object.assign(new Error('render: empty or invalid range'), { exit: 2 });
    // Use the frame range for filenames: round-trip seconds may have many decimal places.
    const name = opts.scene ? opts.scene.replace(/[^a-zA-Z0-9-]/g, '-') : `${from}-${to}`;
    const out = path.join(dir, `${name}${opts.draft ? '-draft' : ''}.mp4`);
    code = await run(['--from', String(from / tl.fps), '--to', String(to / tl.fps), '--noaudio', '--out', out, ...(opts.draft ? ['--draft'] : [])]);
    process.exitCode = code;
    if (!code) console.log(JSON.stringify({ out, ...(opts.scene ? { scene: opts.scene } : {}), from: from / tl.fps, to: to / tl.fps, frames: to - from, seconds: (to - from) / tl.fps, fps: tl.fps, draft: !!opts.draft, style: tl.style }));
  }
} catch (e) { console.error((e as Error).message); process.exitCode = (e as { exit?: number }).exit ?? 1; }
finally { rmSync(timeline, { force: true }); }
