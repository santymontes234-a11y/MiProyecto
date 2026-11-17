# Sistema de diseño — EcoMove Querétaro

> Fuente de tokens: `packages/shared/src/design/tokens.ts` (TypeScript, sin dependencias).
> Web los consume como variables CSS (`toCssVariables()`); mobile como objetos para `StyleSheet`.
> Propiedad: agente **design**.

## 0. Identidad

| Elemento | Valor |
|---|---|
| Nombre | **EcoMove Querétaro** (corto: EcoMove) |
| Eslogan | «Cada viaje cuenta.» |
| Descriptor | Movilidad sostenible medida en CO₂ evitado. |
| Logo | Hoja que se convierte en trayecto, sobre cuadrado redondeado verde: `docs/brand/logo.svg` (fuente única; en código `LOGO_SVG` y `BRAND` de `@ecomove/shared`) |
| Colores | Paleta del usuario (§2): verde `#16A34A`, verde oscuro `#14532D`, verde claro `#DCFCE7`, turquesa `#0D9488`, azul `#2563EB`, amarillo `#EAB308` |
| Tipografía | Inter (interfaz). El informe académico usa una de las permitidas (Arial). |

Los íconos de Android (adaptive icon, splash) y el favicon web se generan desde `docs/brand/logo.svg`.

## 1. Principios

1. **Verde con propósito:** el verde comunica ahorro de CO₂, no decoración.
2. **Legible en exteriores:** contraste AA mínimo (4.5:1 texto normal); la app se usa bajo el sol.
3. **Dato primero:** cifras grandes y unidades claras (`1.2 kg CO₂ evitados`).
4. **Paridad Android/Web:** mismos tokens, mismos nombres de componente, misma semántica.

## 2. Tokens

### Color (semánticos; nunca usar la paleta cruda en componentes)

Paleta definida por el usuario el 2026-11-15: verde `#16A34A`, verde oscuro `#14532D`, verde claro
`#DCFCE7`, turquesa `#0D9488`, azul `#2563EB`, amarillo `#EAB308`, fondo claro `#FFFFFF` y fondo
oscuro `#111827`. Los neutros, `danger` y los colores de superficie se derivan de ella.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `bg` | `#FFFFFF` | `#111827` | Fondo de pantalla |
| `surface` | `#FFFFFF` | `#1F2937` | Tarjetas, hojas |
| `surfaceMuted` | `#F3F4F6` | `#374151` | Campos, chips inactivos |
| `border` | `#E5E7EB` | `#374151` | Bordes, divisores |
| `text` | `#111827` | `#F9FAFB` | Texto principal |
| `textMuted` | `#4B5563` | `#9CA3AF` | Texto secundario |
| `primary` | `#16A34A` | `#16A34A` | Rellenos de acción principal, iconos, CO₂ evitado |
| `primaryStrong` | `#14532D` | `#DCFCE7` | **Texto** verde de tamaño normal, enlaces |
| `primarySoft` | `#DCFCE7` | `#14532D` | Fondos de chips/banners positivos |
| `onPrimary` | `#FFFFFF` | `#FFFFFF` | Texto sobre `primary` (solo ≥ 18 px bold) |
| `accent` | `#0D9488` | `#0D9488` | Acento, micromovilidad |
| `secondary` | `#2563EB` | `#2563EB` | Transporte público, información |
| `warning` | `#EAB308` | `#EAB308` | **Solo relleno** (con `onWarning` encima) |
| `onWarning` | `#111827` | `#111827` | Texto sobre `warning` |
| `danger` | `#DC2626` | `#F87171` | Errores, CO₂ emitido |
| `success` | `#16A34A` | `#16A34A` | Confirmaciones |

**Reglas de contraste:** `primary` sobre blanco ≈ 3.3:1. Se permite solo en rellenos, iconos y
texto grande (≥ 18 px en bold). El texto verde normal usa `primaryStrong` (≈ 9:1). El amarillo
nunca se usa como color de texto sobre fondo claro. Las etiquetas de `Button` primario son de
18 px y bold.

**Colores por modo de transporte** (`modeColors`), usados en mapas y gráficas:
`WALK #14532D`, `BICYCLE #16A34A`, `E_SCOOTER #0D9488`, `BUS #2563EB`, `CARPOOL #7C3AED`,
`MOTORCYCLE #EAB308`, `CAR #6B7280`.

**Nunca solo color:** `WALK` y `BICYCLE` son dos verdes que se confunden con daltonismo. En gráficas
siempre hay etiqueta directa o leyenda con icono, y una vista de tabla alternativa. En el mapa,
`WALK` se dibuja con línea punteada y `BICYCLE` con línea sólida.

### Espaciado (base 4)

`space.0=0 · 1=4 · 2=8 · 3=12 · 4=16 · 5=20 · 6=24 · 8=32 · 10=40 · 12=48`

### Radios

`radius.sm=6 · md=10 · lg=16 · pill=999`

### Tipografía

Familia: **Inter** (web vía `next/font`, mobile vía `expo-font`); fallback del sistema.

| Token | Tamaño / alto de línea / peso | Uso |
|---|---|---|
| `text.display` | 32/40/700 | Cifra protagonista (CO₂) |
| `text.title` | 22/28/700 | Título de pantalla |
| `text.heading` | 18/24/600 | Título de sección |
| `text.body` | 16/24/400 | Texto general |
| `text.label` | 14/20/500 | Etiquetas, botones |
| `text.caption` | 12/16/400 | Metadatos |

### Elevación

`elevation.0` ninguna · `elevation.1` tarjetas · `elevation.2` hojas/menús. Web: `box-shadow`;
Android: `elevation` nativo.

### Movimiento

`motion.fast=120ms`, `motion.base=200ms`, `easing.standard=cubic-bezier(0.2,0,0,1)`.
Respetar `prefers-reduced-motion` / `AccessibilityInfo.isReduceMotionEnabled`.

## 3. Componentes (mismo nombre y props en web y mobile)

| Componente | Props clave | Notas |
|---|---|---|
| `Button` | `variant: 'primary'\|'secondary'\|'ghost'\|'danger'`, `size: 'sm'\|'md'\|'lg'`, `loading`, `disabled` | Área táctil ≥ 44×44 |
| `TextField` | `label`, `error`, `hint`, `secureTextEntry`/`type` | Error siempre en texto, no solo color |
| `Card` | `padding`, `elevated` | |
| `StatTile` | `label`, `value`, `unit`, `trend?` | Para CO₂, distancia, viajes |
| `ModeBadge` | `mode: TransportMode` | Icono + color de `modeColors` + nombre |
| `TripCard` | `trip: TripSummary` | Usa formateadores de shared |
| `MapView` | `center`, `zoom`, `layers` | Leaflet en web; Leaflet empaquetado dentro de `react-native-webview` en mobile ([ADR-005](adr/ADR-005-mobile-map-leaflet-webview.md)) |
| `EmptyState` | `title`, `description`, `action?` | |
| `Banner` | `tone: 'info'\|'warning'\|'danger'\|'success'` | |

Cada app implementa sus primitivos en `src/components/ui/` con estas props; la paridad se revisa
en la checklist de integración.

## 4. Mapas (OpenStreetMap)

- Tiles: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` solo en desarrollo; atribución visible
  obligatoria: «© OpenStreetMap contributors».
- Centro por defecto: Querétaro `[-100.3899, 20.5888]`, zoom 13.
- Ciclovías: línea de 4 px `modeColors.BICYCLE`; protegidas sólidas, no protegidas punteadas.

## 5. Formato de datos (en `packages/shared/src/format`)

- `formatCo2(g)`: `< 1000 g → "850 g"`, si no `"1.2 kg"`, `≥ 1 000 000 → "1.2 t"`.
- `formatDistance(m)`: `< 1000 → "850 m"`, si no `"4.2 km"`.
- `formatDuration(s)`: `"1 h 05 min"`, `"12 min"`.
- Locale `es-MX`.
- Los nombres de modos de transporte se muestran con `MODE_LABELS` de shared.
