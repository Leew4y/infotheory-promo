import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { confined } from './scripts/lib/confine';

const root = fileURLToPath(new URL('.', import.meta.url));

// One page shell (index.html, a single 1920x1080 canvas) for every film: FILM picks the entry films/<FILM>/main.ts.
// `just dev <film>` / `just build <film>` set it. The build goes to dist/<film>/. The dev server serves exactly one
// file from the film's outputs, its preview audio (see previewAudio below), at /music.mp3;
// nothing else under out/ is exposed. Its media frames (screen captures) are served from .cache/captures/<film>/ at /media/.
const FILM = process.env.FILM ?? '';
const films = readdirSync(path.join(root, 'films')).filter((n) => /^[a-z0-9][a-z0-9-]*$/.test(n) && existsSync(path.join(root, 'films', n, 'main.ts')));
if (!films.includes(FILM)) throw new Error(`FILM=${JSON.stringify(FILM)} is not a film (films/<id>/main.ts): one of ${films.join(', ')}`);
// The preview's audio, chosen per request: the final mix (music + narration, just mix) while it was made from the
// current narration lock, else the score. (The export also checks the placements and the frame count; the preview cannot
// without the page, so a mix made before a timing change still plays here.)
const OUT = path.join(root, 'out', FILM);
const LOCK = path.join(root, 'films', FILM, 'narration.lock.json');
function previewAudio(): string {
  try {
    const meta = JSON.parse(readFileSync(path.join(OUT, 'master.json'), 'utf8'));
    const lock = existsSync(LOCK) ? createHash('sha256').update(readFileSync(LOCK)).digest('hex') : 'none';
    if (meta.lock === lock && existsSync(path.join(OUT, 'master.mp3'))) return path.join(OUT, 'master.mp3');
  } catch { /* no mix yet */ }
  return path.join(OUT, 'music.mp3');
}

export default defineConfig({
  root,
  publicDir: false,
  plugins: [{
    name: 'film-entry',
    transformIndexHtml: { order: 'pre', handler: (html) => html.replace('%FILM_ENTRY%', `/films/${FILM}/main.ts`) },
    configureServer(server) {
      // the film's media frames (screen captures), .cache/captures/<film>/, at /media/; nothing outside that directory
      // (real paths, links resolved: scripts/lib/confine.ts)
      const MEDIA = path.join(root, '.cache', 'captures', FILM);
      server.middlewares.use('/media', (req, res) => {
        let rel: string;
        try { rel = decodeURIComponent((req.url ?? '/').split('?')[0]); } catch { res.statusCode = 400; res.end(); return; }
        const file = confined(MEDIA, rel);
        if (!file) { res.statusCode = 404; res.end(); return; }
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(file).on('error', () => { if (!res.headersSent) res.statusCode = 404; res.end(); }).pipe(res);
      });
      server.middlewares.use('/music.mp3', (req, res) => {
        const MUSIC = previewAudio();
        if (!existsSync(MUSIC)) { res.statusCode = 404; res.end(`no ${path.relative(root, MUSIC)}: run just music ${FILM}`); return; }
        // byte ranges, so the player can seek
        const size = statSync(MUSIC).size;
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
        let a = 0, b = size - 1;
        if (m && (m[1] || m[2])) {
          a = m[1] ? +m[1] : Math.max(0, size - +m[2]);
          b = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
          if (a > b || a >= size) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${size}`); res.end(); return; }
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${a}-${b}/${size}`);
        }
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', String(b - a + 1));
        createReadStream(MUSIC, { start: a, end: b }).on('error', () => { if (!res.headersSent) res.statusCode = 500; res.end(); }).pipe(res);
      });
    },
  }],
  server: { host: '127.0.0.1', port: 5174, open: false, fs: { deny: ['**/out/**', '**/dist/**', '**/.cache/**', '.env', '.env.*'] } },
  build: { outDir: path.join(root, 'dist', FILM), emptyOutDir: true, target: 'es2022', sourcemap: false },
});
