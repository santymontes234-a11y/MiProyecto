import { LEAFLET_CSS, LEAFLET_JS } from './leaflet-assets.generated';

/**
 * Documento HTML del mapa: Leaflet embebido (sin CDN) y puente postMessage.
 * Solo los tiles OSM salen a la red (ARCHITECTURE §2, ADR-005).
 */
const BRIDGE = String.raw`
(function () {
  var map, tiles, layers = {}, theme = null;
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
    var size = m.kind === 'poi' ? 22 : 30;
    var inner = m.kind === 'origin' ? 'A' : m.kind === 'destination' ? 'B' : '';
    var html = m.kind === 'user'
      ? '<div class="pulse" style="background:' + color + '"></div>'
      : '<div class="pin" style="width:' + size + 'px;height:' + size + 'px;background:' + color + '">' + inner + '</div>';
    return L.divIcon({ className: 'eco-icon', html: html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  }
  function emitMove() {
    var b = map.getBounds(), c = map.getCenter();
    post({ type: 'moveend', zoom: map.getZoom(), center: [c.lng, c.lat],
      bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] });
  }
  function applyTheme(t) {
    theme = t;
    document.body.classList.toggle('dark', !!t.dark);
  }
  var handlers = {
    init: function (m) {
      applyTheme(m.theme);
      map = L.map('map', { zoomControl: false, attributionControl: true, preferCanvas: true }).setView(ll(m.center), m.zoom);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      map.attributionControl.setPrefix(false);
      tiles = L.tileLayer(m.tileUrl, { maxZoom: 19, attribution: m.attribution, crossOrigin: true }).addTo(map);
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
        if (mk.label) marker.bindTooltip(escapeHtml(mk.label), { direction: 'top', offset: [0, -12] });
        marker.on('click', function (e) { L.DomEvent.stopPropagation(e); post({ type: 'markerPress', id: mk.id, layer: m.layer }); });
        g.addLayer(marker);
      });
    },
    setLines: function (m) {
      var g = group('lines-' + m.layer); g.clearLayers();
      m.lines.forEach(function (ln) {
        g.addLayer(L.polyline(ln.coords.map(ll), { color: ln.color, weight: ln.weight || 4, opacity: 0.9,
          dashArray: ln.dashed ? '8 8' : null, lineCap: 'round', lineJoin: 'round', interactive: false }));
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
html, body, #map { height: 100%; margin: 0; padding: 0; background: #E5E7EB; }
body.dark, body.dark #map { background: #111827; }
body.dark .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9); }
.leaflet-container { font-family: -apple-system, Roboto, sans-serif; -webkit-tap-highlight-color: transparent; }
.eco-icon { background: transparent; border: none; }
.pin { border-radius: 50%; border: 3px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,.35);
  color: #FFFFFF; font: 700 13px/1 sans-serif; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
.pulse { width: 18px; height: 18px; margin: 6px; border-radius: 50%; border: 3px solid #FFFFFF;
  box-shadow: 0 0 0 0 rgba(37,99,235,.6); animation: pulse 2s infinite; box-sizing: border-box; }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(37,99,235,.55); } 70% { box-shadow: 0 0 0 14px rgba(37,99,235,0); } 100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); } }
@media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
.leaflet-control-attribution { font-size: 10px; }
body.dark .leaflet-control-attribution, body.dark .leaflet-bar a { background: #1F2937; color: #F9FAFB; }
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
