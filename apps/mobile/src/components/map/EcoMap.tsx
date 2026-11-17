import { map as mapTokens, type BBox, type Position } from '@ecomove/shared';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';

import { AppText } from '@/components/ui';
import { config } from '@/lib/config';
import { useTheme } from '@/theme/ThemeProvider';
import { MAP_HTML } from './map-html';
import { parseFromWeb, type MapLine, type MapMarker, type MapThemeColors, type ToWebMessage } from './map-protocol';

// Los tipos de react-native-webview usan `P = undefined`, que con TS 6 reduce las props a `never`.
// Instanciar con `object` restaura WebViewProps sin cambiar el comportamiento.
const Web = WebView<object>;
type WebInstance = WebView<object>;

export interface EcoMapHandle {
  setView: (center: Position, zoom?: number) => void;
  fitBounds: (coords: Position[], padding?: number) => void;
}

export interface EcoMapProps {
  initialCenter?: Position;
  initialZoom?: number;
  tripMarkers?: MapMarker[];
  poiMarkers?: MapMarker[];
  userMarker?: MapMarker | null;
  routeLines?: MapLine[];
  cyclewayLines?: MapLine[];
  /** Si cambia, el mapa encuadra estas coordenadas. */
  fitTo?: Position[] | null;
  onTap?: (coord: Position) => void;
  onMoveEnd?: (bbox: BBox, zoom: number, center: Position) => void;
  onMarkerPress?: (id: string, layer: string) => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Mapa OpenStreetMap con Leaflet embebido en WebView (ADR-005). */
export const EcoMap = forwardRef<EcoMapHandle, EcoMapProps>(function EcoMap(
  {
    initialCenter = mapTokens.defaultCenter,
    initialZoom = mapTokens.defaultZoom,
    tripMarkers,
    poiMarkers,
    userMarker,
    routeLines,
    cyclewayLines,
    fitTo,
    onTap,
    onMoveEnd,
    onMarkerPress,
    style,
    accessibilityLabel = 'Mapa interactivo de Querétaro',
  },
  ref,
) {
  const theme = useTheme();
  const webRef = useRef<WebInstance>(null);
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);

  const mapTheme = useMemo<MapThemeColors>(
    () => ({
      dark: theme.dark,
      primary: theme.colors.primary,
      origin: theme.colors.primary,
      destination: theme.colors.info,
      user: theme.colors.info,
      surface: theme.colors.surface,
      text: theme.colors.text,
    }),
    [theme],
  );

  const send = useCallback((msg: ToWebMessage) => {
    const payload = JSON.stringify(msg);
    // postMessage se entrega en el listener 'message' del documento.
    webRef.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(payload)}}));true;`);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      setView: (center, zoom) => send({ type: 'setView', center, zoom }),
      fitBounds: (coords, padding) => send({ type: 'fitBounds', coords, padding }),
    }),
    [send],
  );

  // Inicialización una sola vez (centro inicial).
  const initial = useRef({ center: initialCenter, zoom: initialZoom });
  useEffect(() => {
    if (!ready) return;
    send({
      type: 'init',
      center: initial.current.center,
      zoom: initial.current.zoom,
      tileUrl: config.tileUrl,
      tileUrlDark: config.tileUrlDark,
      attribution: config.tileAttribution,
      theme: mapTheme,
    });
    // mapTheme se aplica en su propio efecto; init solo depende de ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, send]);

  useEffect(() => {
    if (ready) send({ type: 'setTheme', theme: mapTheme });
  }, [ready, mapTheme, send]);
  useEffect(() => {
    if (ready) send({ type: 'setMarkers', layer: 'trip', markers: tripMarkers ?? [] });
  }, [ready, tripMarkers, send]);
  useEffect(() => {
    if (ready) send({ type: 'setMarkers', layer: 'pois', markers: poiMarkers ?? [] });
  }, [ready, poiMarkers, send]);
  useEffect(() => {
    if (ready) send({ type: 'setMarkers', layer: 'user', markers: userMarker ? [userMarker] : [] });
  }, [ready, userMarker, send]);
  useEffect(() => {
    if (ready) send({ type: 'setLines', layer: 'route', lines: routeLines ?? [] });
  }, [ready, routeLines, send]);
  useEffect(() => {
    if (ready) send({ type: 'setLines', layer: 'cycleways', lines: cyclewayLines ?? [] });
  }, [ready, cyclewayLines, send]);
  useEffect(() => {
    if (ready && fitTo && fitTo.length) send({ type: 'fitBounds', coords: fitTo });
  }, [ready, fitTo, send]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      const msg = parseFromWeb(e.nativeEvent.data);
      if (!msg) return;
      switch (msg.type) {
        case 'ready':
          setReady(true);
          break;
        case 'tap':
          onTap?.(msg.coord);
          break;
        case 'moveend':
          onMoveEnd?.(msg.bbox, msg.zoom, msg.center);
          break;
        case 'markerPress':
          onMarkerPress?.(msg.id, msg.layer);
          break;
        case 'error':
          if (msg.message === 'tiles') setTileError(true);
          break;
      }
    },
    [onTap, onMoveEnd, onMarkerPress],
  );

  return (
    <View style={[styles.wrap, { backgroundColor: theme.colors.surfaceAlt }, style]} accessible={false} accessibilityLabel={accessibilityLabel}>
      <Web
        ref={webRef}
        source={{ html: MAP_HTML, baseUrl: '' }}
        originWhitelist={['about:*', 'data:*']}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled={false}
        setSupportMultipleWindows={false}
        allowFileAccess={false}
        allowsLinkPreview={false}
        overScrollMode="never"
        style={styles.web}
        onShouldStartLoadWithRequest={(req: WebViewNavigation) => req.url === 'about:blank' || req.url.startsWith('data:')}
        onContentProcessDidTerminate={() => webRef.current?.reload()}
        onRenderProcessGone={() => webRef.current?.reload()}
      />
      {!ready ? (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <AppText variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
            Cargando mapa…
          </AppText>
        </View>
      ) : null}
      {tileError ? (
        <View style={[styles.banner, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} pointerEvents="none">
          <AppText variant="caption" tone="muted">
            Sin conexión: algunas zonas del mapa no se cargaron.
          </AppText>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden' },
  web: { flex: 1, backgroundColor: 'transparent' },
  center: { alignItems: 'center', justifyContent: 'center' },
  banner: { position: 'absolute', top: 8, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
});
