import './film';
import './scenes/index';
import plan from './film-plan.json';
import { boot, type FontManifest } from '../../engine';

const manifests = import.meta.glob('./fonts/*/manifest.json', { import: 'default', eager: true }) as Record<string, FontManifest>;
const files = import.meta.glob('./fonts/*/*.woff2', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const fontUrls = Object.fromEntries(Object.entries(files).map(([k, v]) => [k.replace('./fonts/', ''), v]));
boot({ title: { name: plan.scenes[0].title?.[0] ?? plan.film }, fonts: Object.values(manifests), fontUrls });
