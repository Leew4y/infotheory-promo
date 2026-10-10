// Film entry: the film's grid and style first, then its scenes, then the shared player / export hooks.
import './film';
import './scenes/index';
import { boot, type FontManifest } from '../../engine';

// one font bundle per style (just fonts <film> writes fonts/<style>/); boot() loads the active style's
const manifests = import.meta.glob('./fonts/*/manifest.json', { import: 'default', eager: true }) as Record<string, FontManifest>;
const files = import.meta.glob('./fonts/*/*.woff2', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const fontUrls = Object.fromEntries(Object.entries(files).map(([k, v]) => [k.replace('./fonts/', ''), v]));

boot({ title: { name: '对数学，人类应从历史中得到教训', tagline: '当机器开始解题，我们是否再次误解了数学？' }, fonts: Object.values(manifests), fontUrls });
