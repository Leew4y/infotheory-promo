// Film entry: the film's grid and style first, then its scenes, then the shared player / export hooks.
import './film';
import './scenes/index';
import { boot, type FontManifest } from '../../engine';
import fonts from './fonts/manifest.json';

// the bundled URL of each font subset (scripts/fonts.ts writes them and the manifest)
const files = import.meta.glob('./fonts/*.woff2', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const fontUrls = Object.fromEntries(Object.entries(files).map(([k, v]) => [k.replace('./fonts/', ''), v]));

boot({ fonts: fonts as FontManifest, fontUrls });
