import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

// One page shell (index.html, a single 1920x1080 canvas) for every film: FILM picks the entry films/<FILM>/main.ts.
// `just dev <film>` / `just build <film>` set it. The build goes to dist/<film>/; out/<film>/ (the film's generated
// music.mp3, from `just music <film>`) is served at / in the dev server.
const FILM = process.env.FILM ?? '';
const films = readdirSync(path.join(root, 'films')).filter((n) => existsSync(path.join(root, 'films', n, 'main.ts')));
if (!films.includes(FILM)) throw new Error(`FILM=${JSON.stringify(FILM)} is not a film (films/<id>/main.ts): one of ${films.join(', ')}`);
const OUT = path.join(root, 'out', FILM);
mkdirSync(OUT, { recursive: true });

export default defineConfig({
  root,
  publicDir: OUT,
  plugins: [{
    name: 'film-entry',
    transformIndexHtml: { order: 'pre', handler: (html) => html.replace('%FILM_ENTRY%', `/films/${FILM}/main.ts`) },
  }],
  server: { host: '127.0.0.1', port: 5174, open: false },
  build: { outDir: path.join(root, 'dist', FILM), emptyOutDir: true, target: 'es2022', sourcemap: false, copyPublicDir: false },
});
