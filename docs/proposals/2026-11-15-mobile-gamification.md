# Gamificación: puntos, logros y ranking
- **Autor (agente):** mobile
- **Estado:** Aprobada con cambios en API_CONTRACT 1.1.0 (2026-11-16): puntos por viaje y `points_estimate`; logros vía `/achievements` y `/users/me/achievements` (con `progress`); `/gamification/me` y `/gamification/ranking` (opt-in). Sin `StatsSummary.points_total` (lo cubre `/gamification/me`).
- **Afecta a:** API_CONTRACT §4, §6 y nuevo §8 `/gamification`, apps/api, database, packages/shared, apps/web

## Motivación

El producto pide mostrar los «puntos obtenidos» al registrar un viaje, una pantalla de logros y
recompensas, y un ranking. Hoy la app móvil muestra estas secciones como «en preparación»,
sin datos simulados.

## Cambio propuesto

Los puntos los calcula **solo el backend**, igual que el CO₂ (ADR-002). Regla inicial sugerida:
`points = floor(co2_saved_g / 100)` más bonificaciones por logro. Debe configurarse y versionarse,
como los factores de emisión.

### Campos nuevos

- `TripEstimate.points_estimate: number`
- `Trip.points` y `TripSummary.points: number`
- `StatsSummary.points_total: number` (solo en `/stats/me`)

### Endpoints nuevos (rol `USER`)

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/gamification/me` | `{ "points_total": 1250, "level": 4, "next_level_points": 1500 }` |
| GET | `/gamification/achievements` | `Achievement[]` |
| GET | `/gamification/ranking` | `period=week\|month\|all`, `scope=city` → `Ranking` |

```jsonc
// Achievement
{ "code": "FIRST_BIKE_TRIP", "title": "Primer pedaleo", "description": "Registra tu primer viaje en bici",
  "icon": "bicycle", "unlocked_at": "2026-11-15T18:30:00Z" | null, "progress": 1, "target": 1 }
// Ranking — privacidad: solo display_name (nombre + inicial) y opt-in del usuario
{ "period": "week", "entries": [ { "position": 1, "display_name": "Ana L.", "points": 980, "is_me": false } ],
  "me": { "position": 37, "points": 210 } | null }
```

- Privacidad (LFPDPPP, SECURITY §5): el ranking muestra solo usuarios con
  `ranking_opt_in = true` (nuevo campo en `UserUpdate` y `User`) y nunca su correo.

## Impacto en otros agentes

- **database:** tablas `achievements`, `user_achievements`, columna `trips.points` y `users.ranking_opt_in`.
- **backend:** servicio de puntos y logros, recalculado al crear o borrar viajes.
- **shared / web:** tipos y cliente; secciones equivalentes en el área privada web.

## Alternativas consideradas

- Calcular los puntos en el cliente: rechazado por ADR-002 (cifras divergentes y fáciles de manipular).
