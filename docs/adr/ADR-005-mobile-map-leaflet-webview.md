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
