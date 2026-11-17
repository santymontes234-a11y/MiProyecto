import { LEAFLET_CSS, LEAFLET_JS } from './leaflet-assets.generated';

/**
 * Documento HTML del mapa: Leaflet embebido (sin CDN) y puente postMessage.
 * Solo los tiles (CARTO Voyager / Dark Matter, datos OSM) salen a la red (ARCHITECTURE §2, ADR-005).
 */
const BRIDGE = String.raw`
(function () {
  var map, tiles, layers = {}, theme = null, tileUrls = null;
  function post(msg) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
  function ll(c) { return [c[1], c[0]]; }
  function group(name) {
    if (!layers[name]) { layers[name] = L.layerGroup().addTo(map); }
    return layers[name];
  }
  function markerColor(m) {
    if (m.color) return m.color;
    if (!theme) return '#16A34A';
    return m.kind === 'origin' ? theme.origin : m.kind === 'destination' ? theme.destination : m.kind === 'user' ? theme.user : theme.primary;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function makeIcon(m) {
    var color = markerColor(m);
    if (m.kind === 'user') {
      return L.divIcon({ className: 'eco-icon', html: '<div class="halo"></div><div class="dot" style="background:' + color + '"></div>', iconSize: [36, 36], iconAnchor: [18, 18] });
    }
    if (m.kind === 'poi') {
      return L.divIcon({ className: 'eco-icon', html: '<div class="poi" style="background:' + color + '"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });
    }
    var inner = m.kind === 'origin' ? 'A' : m.kind === 'destination' ? 'B' : '';
    var html = '<div class="pin" style="background:' + color + '"><span>' + inner + '</span></div><div class="pin-shadow"></div>';
    return L.divIcon({ className: 'eco-icon', html: html, iconSize: [34, 44], iconAnchor: [17, 42], tooltipAnchor: [0, -38] });
  }
  function emitMove() {
    var b = map.getBounds(), c = map.getCenter();
    post({ type: 'moveend', zoom: map.getZoom(), center: [c.lng, c.lat],
      bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] });
  }
  function applyTheme(t) {
    var changed = !theme || theme.dark !== t.dark;
    theme = t;
    document.body.classList.toggle('dark', !!t.dark);
    if (changed && tiles && tileUrls) tiles.setUrl(t.dark ? tileUrls.dark : tileUrls.light);
  }
  var handlers = {
    init: function (m) {
      tileUrls = { light: m.tileUrl, dark: m.tileUrlDark || m.tileUrl };
      applyTheme(m.theme);
      map = L.map('map', { zoomControl: false, attributionControl: true, preferCanvas: false, zoomSnap: 0.5 }).setView(ll(m.center), m.zoom);
      L.control.zoom({ position: 'bottomright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
      map.attributionControl.setPrefix(false);
      tiles = L.tileLayer(m.theme.dark ? tileUrls.dark : tileUrls.light, { maxZoom: 20, subdomains: 'abcd', detectRetina: false, attribution: m.attribution, crossOrigin: true }).addTo(map);
      tiles.on('tileerror', function () { post({ type: 'error', message: 'tiles' }); });
      map.on('click', function (e) { post({ type: 'tap', coord: [e.latlng.lng, e.latlng.lat] }); });
      map.on('moveend', emitMove);
      emitMove();
    },
    setView: function (m) { map.setView(ll(m.center), m.zoom || map.getZoom(), { animate: true }); },
    fitBounds: function (m) {
      if (!m.coords.length) return;
      if (m.coords.length === 1) { map.setView(ll(m.coords[0]), 16, { animate: true }); return; }
      map.fitBounds(L.latLngBounds(m.coords.map(ll)), { padding: [m.padding || 48, m.padding || 48], animate: true });
    },
    setMarkers: function (m) {
      var g = group('markers-' + m.layer); g.clearLayers();
      m.markers.forEach(function (mk) {
        var marker = L.marker(ll(mk.coord), { icon: makeIcon(mk), keyboard: true, title: mk.label || '', zIndexOffset: mk.kind === 'poi' ? 0 : 1000 });
        if (mk.label) marker.bindTooltip(escapeHtml(mk.label), { direction: 'top', offset: mk.kind === 'poi' ? [0, -10] : [0, -4] });
        marker.on('click', function (e) { L.DomEvent.stopPropagation(e); post({ type: 'markerPress', id: mk.id, layer: m.layer }); });
        g.addLayer(marker);
      });
    },
    setLines: function (m) {
      var g = group('lines-' + m.layer); g.clearLayers();
      var isRoute = m.layer === 'route';
      m.lines.forEach(function (ln) {
        var latlngs = ln.coords.map(ll), w = ln.weight || 4;
        if (isRoute) {
          // Borde (casing) estilo navegador: línea ancha clara/oscura debajo de la ruta.
          g.addLayer(L.polyline(latlngs, { color: theme && theme.dark ? '#0B1220' : '#FFFFFF', weight: w + 5, opacity: 0.95,
            lineCap: 'round', lineJoin: 'round', interactive: false }));
        }
        g.addLayer(L.polyline(latlngs, { color: ln.color, weight: isRoute ? w + 1 : w, opacity: isRoute ? 1 : 0.85,
          dashArray: ln.dashed ? (isRoute ? '2 10' : '8 8') : null, lineCap: 'round', lineJoin: 'round', interactive: false }));
      });
    },
    setTheme: function (m) { applyTheme(m.theme); }
  };
  function onMessage(ev) {
    try {
      var msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
      if (!msg || !handlers[msg.type]) return;
      if (msg.type !== 'init' && !map) return;
      handlers[msg.type](msg);
    } catch (err) { post({ type: 'error', message: String(err && err.message || err) }); }
  }
  window.addEventListener('message', onMessage);
  document.addEventListener('message', onMessage);
  post({ type: 'ready' });
})();
`;

const STYLE = `
html, body, #map { height: 100%; margin: 0; padding: 0; background: #F2EFE9; }
body.dark, body.dark #map { background: #0E1626; }
.leaflet-container { font-family: -apple-system, Roboto, sans-serif; -webkit-tap-highlight-color: transparent; }
.eco-icon { background: transparent; border: none; }
.pin { position: absolute; left: 2px; top: 0; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
  border: 3px solid #FFFFFF; box-shadow: -1px 3px 8px rgba(0,0,0,.35); box-sizing: border-box; display: flex; align-items: center; justify-content: center; }
.pin span { transform: rotate(45deg); color: #FFFFFF; font: 700 13px/1 sans-serif; }
.pin-shadow { position: absolute; left: 11px; top: 38px; width: 12px; height: 5px; border-radius: 50%; background: rgba(0,0,0,.25); filter: blur(1px); }
.poi { width: 14px; height: 14px; margin: 3px; border-radius: 50%; border: 2px solid #FFFFFF; box-shadow: 0 1px 4px rgba(0,0,0,.35); box-sizing: content-box; }
.dot { position: absolute; left: 9px; top: 9px; width: 18px; height: 18px; border-radius: 50%; border: 3px solid #FFFFFF;
  box-shadow: 0 1px 5px rgba(0,0,0,.4); box-sizing: border-box; }
.halo { position: absolute; left: 0; top: 0; width: 36px; height: 36px; border-radius: 50%; background: rgba(37,99,235,.18); animation: halo 2s infinite; }
@keyframes halo { 0% { transform: scale(.6); opacity: 1; } 100% { transform: scale(1.3); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .halo { animation: none; } }
.leaflet-control-attribution { font-size: 10px; background: rgba(255,255,255,.8) !important; border-radius: 6px 0 0 0; }
.leaflet-bar { border: none !important; border-radius: 12px !important; box-shadow: 0 2px 8px rgba(0,0,0,.25) !important; overflow: hidden; }
.leaflet-bar a { width: 44px !important; height: 44px !important; line-height: 44px !important; font-size: 22px !important; color: #111827; background: #FFFFFF; }
.leaflet-bottom.leaflet-right .leaflet-control-zoom { margin-bottom: 28px; margin-right: 12px; }
.leaflet-tooltip { border: none; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.25); font-weight: 600; }
body.dark .leaflet-control-attribution { background: rgba(17,24,39,.8) !important; color: #D1D5DB; }
body.dark .leaflet-control-attribution a { color: #93C5FD; }
body.dark .leaflet-bar a { background: #1F2937; color: #F9FAFB; border-bottom-color: #374151; }
body.dark .leaflet-tooltip { background: #1F2937; color: #F9FAFB; }
`;

export const MAP_HTML = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<style>${LEAFLET_CSS}</style>
<style>${STYLE}</style>
</head><body>
<div id="map" role="application" aria-label="Mapa de Querétaro"></div>
<script>${LEAFLET_JS}</script>
<script>${BRIDGE}</script>
</body></html>`;
