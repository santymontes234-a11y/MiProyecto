# EcoMove Querétaro — App Android (`@ecomove/mobile`)

App de Expo (SDK 58, React Native 0.88, TypeScript estricto, Expo Router) para registrar viajes sostenibles
en la Zona Metropolitana de Querétaro y medir el CO₂ evitado.

> Antes de cambiar código, lee [`docs/AGENTS.md`](../../docs/AGENTS.md), [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md),
> [`docs/API_CONTRACT.md`](../../docs/API_CONTRACT.md) y [`docs/DESIGN_SYSTEM.md`](../../docs/DESIGN_SYSTEM.md).

## Puesta en marcha

Desde la **raíz** del monorepo (un único `package-lock.json`, AGENTS.md §2.8):

```bash
npm install                 # también genera el asset de Leaflet (postinstall)
cp apps/mobile/.env.example apps/mobile/.env
npm run infra:up            # base de datos + API en http://localhost:8000
```

Lanzar la app (forma recomendada, desde la raíz):

```bash
npm run android             # = npm run android -w @ecomove/mobile (requiere Android SDK + emulador/dispositivo)
```

O bien, **dentro de `apps/mobile`**:

```bash
npx expo run:android        # build de desarrollo en emulador o dispositivo
npx expo start              # servidor Metro para un build de desarrollo ya instalado
```

> ⚠️ No ejecutes `npx expo …` ni `eas …` directamente en la raíz del monorepo: Expo trataría la raíz
> como la app y generaría `android/`, `app.json` y dependencias en el `package.json` raíz.

`EXPO_PUBLIC_API_BASE_URL`:

| Entorno | Valor |
|---|---|
| Emulador Android | `http://10.0.2.2:8000/api/v1` (por defecto) |
| Dispositivo físico (misma red) | `http://<IP-LAN-de-tu-PC>:8000/api/v1` |
| Producción | `https://…` (**obligatorio**; el build falla si no es HTTPS) |

> La app usa módulos nativos (`react-native-webview`, `expo-secure-store`, `expo-location`), así que
> necesita un **development build**; Expo Go no basta para todas las funciones.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest (`jest-expo`) + Testing Library |
| `npm run lint` | `expo lint` |
| `npm run doctor` | `expo-doctor` |
| `npm run build:apk` | APK interno vía EAS (perfil `preview`, API de la LAN) |
| `npm run build:apk:prod-api` | APK con la configuración de producción (perfil `production-apk`, exige API HTTPS) |
| `npm run build:aab` | AAB para Play Store vía EAS (perfil `production`, exige API HTTPS) |

### Generar APK / AAB (EAS, en la nube)

Se ejecuta **dentro de `apps/mobile`**. El monorepo se sube sin git (`EAS_NO_VCS=1`) desde la raíz
(`EAS_PROJECT_ROOT=../..`), y el `.easignore` de la raíz decide qué se sube: nunca el `.env` raíz ni `node_modules`,
pero **sí** `apps/mobile/.env`.

> El Node que trae Ubuntu no puede leer `app.config.ts`. Por eso los scripts `build:*` ejecutan eas-cli con un
> Node oficial descargado por npx (`npx -y -p node@22.22.1 -p eas-cli@latest -c 'eas build …'`).

1. Configura `apps/mobile/.env` (no se versiona; parte de `.env.example`):

   ```bash
   EXPO_PUBLIC_API_BASE_URL=http://<IP-LAN-de-tu-PC>:8000/api/v1   # ip -4 addr | grep inet
   EXPO_PUBLIC_STADIA_API_KEY=<tu clave de Stadia Maps>
   ```

   - **IP de la LAN:** el teléfono y la PC deben estar en la misma Wi-Fi. La API debe escuchar en la LAN:
     pon `API_PUBLISH_HOST=0.0.0.0` en el `.env` de la raíz y ejecuta `npm run infra:up`. Si cambia la IP, recompila.
   - **Clave de Stadia (mapa):** gratis en stadiamaps.com. Sin clave, la app usa `tile.openstreetmap.org`, que
     **bloquea** las peticiones del WebView (no envía Referer), así que el mapa sale con el aviso «Access blocked».
     La clave queda dentro del APK (es pública por diseño de Stadia); restríngela desde su panel.
2. Compila:

   ```bash
   npx -y -p node@22.22.1 -p eas-cli@latest -c 'eas login'   # solo la primera vez (proyecto ya vinculado: @santy32)
   npm run build:apk                                          # APK de pruebas (perfil preview)
   ```

   Al terminar, EAS muestra el enlace y un QR para instalar el APK.

**Producción (AAB o APK con API HTTPS):** define la URL en el entorno `production` de EAS y compila.

```bash
npx -y -p node@22.22.1 -p eas-cli@latest -c 'eas env:create --name EXPO_PUBLIC_API_BASE_URL --value https://api.tu-dominio.mx/api/v1 --environment production --visibility plaintext'
npm run build:aab            # o npm run build:apk:prod-api
```

Las variables del entorno de EAS (`environment` en `eas.json`) tienen prioridad sobre `apps/mobile/.env`.

`app.config.ts` activa `usesCleartextTraffic` solo en `development` y `preview` (SECURITY.md §4) y
**aborta** el build `production` si la URL de la API no usa HTTPS.

## Arquitectura

```
src/
  app/                    Expo Router (cada archivo es una pantalla)
    _layout.tsx           Providers, fuentes, splash y guardas (Stack.Protected)
    (auth)/               Onboarding, login, registro, recuperación
    (app)/                Área privada (solo con sesión)
      (tabs)/             Inicio · Mapa · Historial · Estadísticas · Perfil
      trip/               plan → mode → confirm → tracking → result
      trips/[id].tsx      Detalle de viaje
    privacy.tsx           Aviso de privacidad (público)
  components/
    ui/                   Primitivos del DS: Button, TextField, Card, StatTile, Skeleton, Toast, ConfirmDialog…
    map/                  EcoMap (Leaflet en WebView) + protocolo tipado
    trips/                ModeBadge, TripCard, Co2Comparison, BarChart, Banner
  features/               Lógica por dominio: auth/, trips/, stats/, map/, onboarding/
  lib/                    api.ts, session.ts, secure-storage.ts, location.ts, geo.ts, errors.ts, validation.ts
  theme/                  Adaptador de tokens de @ecomove/shared + ThemeProvider (claro/oscuro/sistema)
```

- **Contrato:** todos los tipos y el cliente HTTP vienen de `@ecomove/shared`; la app no redeclara tipos del contrato.
- **Lógica fuera de la UI:** pantallas en `app/`, hooks de datos (React Query) en `features/`, y utilidades puras y probadas en `lib/`.

### Autenticación (ADR-003)

- `access_token` **solo en memoria**; `refresh_token` en `expo-secure-store` (Android Keystore,
  `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`). Nunca se guardan contraseñas.
- Renovación **single-flight** (`lib/session.ts`): proactiva si el access caduca en < 30 s y reactiva
  ante un 401, gracias al cliente de shared. Siempre se guarda el refresh rotado; reutilizar uno viejo revoca la familia.
- Un error de red en el refresh **no** cierra la sesión: el splash ofrece «Reintentar». Un 401/403 en el refresh sí la cierra y lleva a login con aviso.
- Las rutas privadas están protegidas con `Stack.Protected`; al perder la sesión se limpia la caché de React Query.

### Mapa (ADR-005)

[`docs/adr/ADR-005-mobile-map-leaflet-webview.md`](../../docs/adr/ADR-005-mobile-map-leaflet-webview.md):
Leaflet 1.9 va **empaquetado** en el bundle (`scripts/build-leaflet-asset.mjs`, sin CDN) dentro de
`react-native-webview`, con una CSP estricta. Solo los tiles (Stadia, datos OSM) salen a la red, con la atribución visible.

- Mensajería RN ⇄ WebView tipada y validada (`components/map/map-protocol.ts`).
- Capas `/map/pois` y `/map/cycleways` por bbox (acotado a 0.5° y ajustado a una rejilla para la caché) desde zoom 12.
- Ciclovías protegidas con línea sólida y no protegidas punteada (DS §4). En modo oscuro se usan los tiles oscuros de Stadia (sin clave, se invierten por CSS).
- Las trazas largas se simplifican (Douglas-Peucker) antes de dibujarlas.

### Viajes y CO₂ (ADR-002, ADR-004)

1. **Origen y destino** se eligen tocando el mapa o con «Usar mi ubicación».
2. **Transporte:** bicicleta, transporte público, caminata o carpooling. La estimación de cada modo viene de
   `POST /trips/estimate` con `distance_m` en línea recta, indicada en la UI como aproximada.
3. **Confirmación:** CO₂ del automóvil (`co2_emitted_g + co2_saved_g`), CO₂ del modo y CO₂ evitado.
4. **Viaje en curso:** GPS en primer plano con filtro de ruido (precisión, paso mínimo y saltos). Se puede pausar, terminar o cancelar.
5. **Subida:** `POST /trips` con la traza completa (≤ 10 000 puntos) y un `client_trip_id` UUID que se **reutiliza al reintentar** (idempotencia).
6. **Resultado:** distancia, duración y CO₂ calculados por el servidor.

La app **no calcula CO₂**; la distancia local solo sirve para mostrar el progreso.

## Contrato 1.1.0

- **Rutas reales** (`GET /routes`): se muestran en el plan y en la confirmación. Ante `ROUTING_UNAVAILABLE` o sin red, se usa la línea recta, marcada como aproximada.
- **Estimación por lotes** (`POST /trips/estimate/batch`) con CO₂ y `points_estimate` por modo.
- **«Ya hice este viaje»**: registra un viaje `PLANNED` con la `route` y el `route_token` tal cual los devolvió `/routes`.
- **CRUD de viajes**: crear (GPS o planificado), listar, ver detalle, editar el medio o el estado (`PATCH /trips/{id}`, el servidor recalcula) y eliminar.
- **Viajes pendientes**: si el envío falla por red o por `MODE_INACTIVE`, el viaje se guarda en el teléfono (`expo-file-system`) y se reintenta con el mismo `client_trip_id`.
- **Gamificación**: puntos por viaje, nivel (`/gamification/me`), logros con progreso, ranking con opt-in (`ranking_opt_in`).
- **Notificaciones in-app** con `unread_count` (badge en Inicio) y «marcar todo como leído».
- **Cuenta**: registro con verificación opcional (`isTokenPair`), reset de contraseña y verificación de correo por deep link
  (`ecomove://reset-password?token=…`, `ecomove://verify-email?token=…`).
- **Reportes ciudadanos**: desde el mapa o desde un POI, más la lista «Mis reportes».
- **Identidad**: icono adaptativo, splash y favicon generados desde `docs/brand/logo.svg`; eslogan `BRAND.slogan` en el splash y el login.

## Contrato 1.2.0 (observaciones del usuario)

- **O1 Mapa**: tiles Stadia Alidade Smooth (claro) y Smooth Dark (oscuro) con `EXPO_PUBLIC_STADIA_API_KEY`; pines con sombra, controles de 44 dp y rutas con borde (nota en ADR-005).
- **O2 Búsqueda de lugares** en el plan: `GET /geocode` con debounce de 400 ms, búsquedas recientes en el teléfono y «Usar mi ubicación»; tocar el mapa sigue funcionando.
- **O3 Impacto estimado**: si `/trips/estimate/batch` responde 404, se usa `/trips/estimate` por medio, con un mensaje claro si aun así falla.
- **O4/O5 Vehículo y ocupantes** (CAR/CARPOOL): tipo de vehículo (`/catalog/vehicle-types`) y ocupantes de 1 a 8 (carpooling ≥ 2) en la estimación y el registro; «Ahorraste X frente a ir solo»; vehículo por defecto en Configuración (`Preferences.default_vehicle_type`).

## Accesibilidad y UX

- Roles y etiquetas accesibles en todos los controles, áreas táctiles ≥ 44 dp y errores siempre en texto.
- Contraste AA: el texto verde normal usa `primaryStrong`, y los botones primarios tienen etiqueta de 18 px bold (DS).
- Se respeta «Reducir movimiento» en splash, skeletons y animaciones de entrada.
- Hay skeletons, estados vacíos, errores con reintento, toasts, diálogos de confirmación para acciones destructivas y pull-to-refresh.
- Tema claro, oscuro o del sistema (Configuración). El ancho máximo del contenido es de 720 dp en tablets.

## Limitaciones conocidas

- El registro GPS funciona **solo en primer plano**: el permiso de ubicación en segundo plano se bloqueó a propósito (privacidad).
- Los tiles dependen de Stadia Maps (plan gratuito con límites). Para producción hay que contratar un plan o servir tiles propios (ARCHITECTURE §10).
