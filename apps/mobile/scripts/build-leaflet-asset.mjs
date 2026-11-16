// Empaqueta Leaflet (JS + CSS) como strings TS para el WebView del mapa (ADR-005: sin CDN).
// Se ejecuta en postinstall; el archivo generado no se versiona.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const dist = dirname(require.resolve('leaflet/dist/leaflet.js'));
const pkg = JSON.parse(readFileSync(join(dist, '..', 'package.json'), 'utf8'));
const js = readFileSync(join(dist, 'leaflet.js'), 'utf8');
const css = readFileSync(join(dist, 'leaflet.css'), 'utf8');

const out = join(here, '..', 'src', 'components', 'map', 'leaflet-assets.generated.ts');
writeFileSync(
  out,
  `// ARCHIVO GENERADO por scripts/build-leaflet-asset.mjs — no editar.\n` +
    `// Leaflet ${pkg.version} — BSD-2-Clause © Volodymyr Agafonkin, CloudMade y colaboradores.\n` +
    `export const LEAFLET_VERSION = ${JSON.stringify(pkg.version)};\n` +
    `export const LEAFLET_JS = ${JSON.stringify(js)};\n` +
    `export const LEAFLET_CSS = ${JSON.stringify(css)};\n`,
);
console.log(`[leaflet] ${pkg.version} → ${out} (${Math.round((js.length + css.length) / 1024)} KB)`);
