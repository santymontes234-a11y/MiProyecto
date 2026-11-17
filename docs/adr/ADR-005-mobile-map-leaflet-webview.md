# ADR-005 — Mapa en mobile: Leaflet empaquetado dentro de WebView

**Estado:** Aceptada · 2026-11-15 (propuesta del agente mobile)

**Contexto.** `react-native-maps` en Android depende del SDK de Google Maps y necesita una API key de
Google. El proyecto exige OpenStreetMap, sin claves ni proveedores de terceros.

**Decisión.** Mobile renderiza el mapa con Leaflet dentro de `react-native-webview`. El JS y el CSS
de Leaflet van **empaquetados en la app** (no se cargan por CDN); solo los tiles de OSM salen a la red.
La comunicación RN ↔ WebView usa `postMessage` con mensajes tipados (capas GeoJSON, centro, eventos
de toque).

**Consecuencias.** Web y mobile usan el mismo motor y el mismo estilo de capas. El rendimiento con
trazas muy largas es menor que con un mapa nativo; se simplifica la geometría antes de dibujarla.
Hay que revisar esta decisión si en el futuro se adopta MapLibre Native.

## Nota 2026-11-16 — Estilo del mapa (observación O1)

El usuario consideró «feo» el estilo de `tile.openstreetmap.org` y pidió algo parecido a Google Maps.
Sin cambiar de motor ni usar Google, mobile cambia de proveedor de tiles raster (datos OSM):

- Con `EXPO_PUBLIC_STADIA_API_KEY`: **Stadia Maps** Alidade Smooth (claro) y Alidade Smooth Dark (oscuro), con
  `?api_key=` porque el WebView con HTML local no envía Referer. Atribución: «© Stadia Maps © OpenMapTiles ©
  OpenStreetMap contributors». La clave vive solo en `apps/mobile/.env` o en variables de EAS.
- Sin clave: `tile.openstreetmap.org` con inversión CSS en oscuro. Ojo: OSM bloquea las peticiones sin Referer
  (devuelve un tile «Access blocked»), así que en el APK la clave es necesaria.
- CARTO se probó y se descartó: desde 2026-11 responde «API KEY REQUIRED».

Además: pines en forma de gota con sombra (A/B), POIs como puntos con borde, ubicación del usuario
con halo, controles de zoom de 44 dp con sombra, y rutas con borde (*casing*) blanco u oscuro bajo la
línea de color. El plan gratuito de Stadia tiene límites; antes de producción hay que contratar un plan
o servir tiles propios (ARCHITECTURE §10).
