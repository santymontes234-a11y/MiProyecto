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
| `npm run build:apk` | APK interno vía EAS (perfil `preview`) |
| `npm run build:aab` | AAB para Play Store vía EAS (perfil `production`) |

### Generar APK / AAB (EAS, en la nube)

Se ejecuta **dentro de `apps/mobile`**. El monorepo se sube sin git (`EAS_NO_VCS=1`) desde la raíz
(`EAS_PROJECT_ROOT=../..`), y el `.easignore` de la raíz decide qué se sube: nunca el `.env` raíz ni `node_modules`.

```bash
npx eas-cli@latest login          # tu cuenta de Expo (solo la primera vez)
npx eas-cli@latest init           # vincula el proyecto con EAS (solo la primera vez)
npm run build:apk                 # APK de pruebas (perfil preview); acepta generar el keystore
```

**APK en un teléfono físico:** el perfil `preview` toma la URL de la API de `apps/mobile/.env`
(`EXPO_PUBLIC_API_BASE_URL=http://<IP-LAN-de-tu-PC>:8000/api/v1`). La API debe aceptar conexiones de la LAN
y el teléfono debe estar en la misma Wi-Fi. Si cambia la IP de tu PC, hay que volver a compilar.

**Producción (AAB):**

```bash
npx eas-cli@latest env:create --name EXPO_PUBLIC_API_BASE_URL --value https://api.tu-dominio.mx/api/v1 --environment production
npm run build:aab
```

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
`react-native-webview`, con una CSP estricta. Solo los tiles OSM salen a la red, con la atribución visible.

- Mensajería RN ⇄ WebView tipada y validada (`components/map/map-protocol.ts`).
- Capas `/map/pois` y `/map/cycleways` por bbox (acotado a 0.5° y ajustado a una rejilla para la caché) desde zoom 12.
- Ciclovías protegidas con línea sólida y no protegidas punteada (DS §4). En modo oscuro, los tiles se invierten por CSS.
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

## Funciones pendientes de contrato

Estas pantallas existen, pero muestran un estado «en preparación», **sin datos simulados ni llamadas**,
hasta que se aprueben sus propuestas:

| Función | Propuesta |
|---|---|
| Ruta real origen→destino y «viaje ya realizado» | [`2026-11-15-mobile-routes-and-trip-source.md`](../../docs/proposals/2026-11-15-mobile-routes-and-trip-source.md) |
| Puntos, logros y ranking individual | [`2026-11-15-mobile-gamification.md`](../../docs/proposals/2026-11-15-mobile-gamification.md) |
| Recuperación de contraseña y bandeja de notificaciones | [`2026-11-15-mobile-password-reset-notifications.md`](../../docs/proposals/2026-11-15-mobile-password-reset-notifications.md) |

Mientras tanto, la pantalla de Ranking muestra el agregado anónimo de la ciudad (`GET /stats/city`).

## Accesibilidad y UX

- Roles y etiquetas accesibles en todos los controles, áreas táctiles ≥ 44 dp y errores siempre en texto.
- Contraste AA: el texto verde normal usa `primaryStrong`, y los botones primarios tienen etiqueta de 18 px bold (DS).
- Se respeta «Reducir movimiento» en splash, skeletons y animaciones de entrada.
- Hay skeletons, estados vacíos, errores con reintento, toasts, diálogos de confirmación para acciones destructivas y pull-to-refresh.
- Tema claro, oscuro o del sistema (Configuración). El ancho máximo del contenido es de 720 dp en tablets.

## Limitaciones conocidas

- El registro GPS funciona **solo en primer plano**: el permiso de ubicación en segundo plano se bloqueó a propósito (privacidad).
- Si la app se cierra durante una subida fallida, el viaje pendiente se pierde: aún no hay cola persistente.
- `tile.openstreetmap.org` solo es apto para desarrollo; hay que migrar a un servidor de tiles propio antes de producción (ARCHITECTURE §10).
