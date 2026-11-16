# Analítica geoespacial `/admin/analytics/*` y zonas de movilidad
- **Autor (agente):** geo (módulo geoespacial y analítico)
- **Estado:** Aprobada e incorporada a API_CONTRACT 1.1.0 (2026-11-16). Cambios: `zone_kind` → `kind`; en `/admin/analytics/distance`, `from`/`to` → `origin`/`destination` (en el contrato `from`/`to` son siempre fechas); `meta.bbox` añadido.
- **Afecta a:** API_CONTRACT (nuevo §7.1 → 1.1.0), DATABASE.md §3 (esquema `geo`), apps/api (servicios ya implementados, router sin montar), packages/shared (tipos), apps/web y apps/mobile (consumo)
- **Relacionada:** `2026-11-15-web-admin-analytics.md` (web). Este documento define las rutas **espaciales e indicadores de movilidad**; la de web define usuarios, reportes, exportaciones y CRUD de zonas. Ambas usan los mismos parámetros comunes (§2).

## Motivación

El contrato v1.0 solo ofrece agregados globales (`/stats/city`, `/admin/stats/overview`). La
administración necesita analizar *dónde* y *cuándo* ocurre la movilidad sostenible: viajes por zona,
flujos origen–destino, mapa de calor, corredores, cobertura de ciclovías y un índice que ayude a
priorizar estudios de infraestructura, todo sin exponer viajes individuales ni mezclar datos DEMO
con oficiales.

## 1. Qué ya está implementado (pendiente de aprobación para exponerse)

| Pieza | Ubicación | Estado |
|---|---|---|
| SQL PostGIS (vistas, funciones, vista materializada) | `apps/api/db/geo/001_schema.sql`, `002_functions.sql`, `003_aggregates.sql` | Probado en PostGIS 16-3.4 sobre el esquema migrado con Alembic |
| Seed DEMO (solo desarrollo y tests, **no es migración**) | `apps/api/db/geo/900_demo_seed.sql` | Escribe solo en `geo.demo_*` |
| Servicios | `apps/api/app/services/geo_analytics/` | Sesión síncrona de SQLAlchemy, sin SQL en routers |
| DTOs | `apps/api/app/schemas/geo_analytics.py` | Propuesta |
| Router | `apps/api/app/routers/geo_analytics.py` | **Sin montar** hasta 1.1.0 |
| Tests | `apps/api/tests/geo/` (21) | Pasan junto con la suite de Backend (93 en total) |
| Metodología | `apps/api/docs/geo/CO2_METHODOLOGY.md`, `PRIORITY_INDEX.md`, `GEO_QUERIES.md` | — |

## 2. Parámetros comunes

| Query | Tipo | Def. | Regla |
|---|---|---|---|
| `from`, `to` | ISO 8601 | últimos 90 días | `[from, to)`, `from < to`, máximo 731 días → `400 DATE_RANGE_INVALID` / `DATE_RANGE_TOO_LARGE` |
| `mode` | `TransportMode`, repetible | todos | |
| `dataset` | `official` \| `demo` | `official` | **Nunca se mezclan.** `demo` consulta solo `geo.demo_*` y zonas DEMO |
| `bbox` | `minLng,minLat,maxLng,maxLat` | — | igual que `/map/*` (máx. 0.5°×0.5°, `400 BBOX_TOO_LARGE`) |
| `cell_m` | número, metros | según ruta | 100–5000. Si la cuadrícula supera las 200 000 celdas → `400 GRID_TOO_LARGE` |

Todas las respuestas incluyen `meta`:

```jsonc
{ "from": "2026-08-17T00:00:00Z", "to": "2026-11-15T00:00:00Z", "modes": null,
  "dataset": "official", "is_demo": false,
  "min_users": 5,            // k-anonimato aplicado (env GEO_MIN_USERS, mínimo 3)
  "is_estimate": true,       // CO₂ y derivados son estimaciones
  "notes": ["..."] }         // con dataset=demo incluye "DATOS DEMO SINTÉTICOS: ..."
```

**Privacidad.** Ninguna celda, zona o flujo con menos de `min_users` usuarios distintos aparece en
la respuesta. El mapa de calor devuelve centroides de celda, nunca coordenadas individuales. Los
indicadores de ciudad aplican el mismo umbral que `/stats/city` (≥ 10 viajes; si no, `suppressed: true`
y ceros).

**Regla DEMO (requisito del architect).** Los datos DEMO viven solo en `geo.demo_trips`,
`geo.demo_bike_lanes`, `geo.demo_stations` y en `geo.mobility_zones` con `source = 'DEMO'`. Nunca se
escriben en `public.*`, así que `/stats/city`, `/stats/me` y `/admin/stats/overview` no pueden verlos.
En `/admin/analytics/*` solo aparecen con `dataset=demo` explícito y con `meta.is_demo = true`.

## 3. Rutas (todas rol `ADMIN`)

| Método | Ruta | Query extra | Respuesta |
|---|---|---|---|
| GET | `/admin/analytics/summary` | — | `AnalyticsSummary` |
| GET | `/admin/analytics/modes` | — | `{ items: ModeCo2Breakdown[], meta }` (medios más usados + CO₂ por medio) |
| GET | `/admin/analytics/peak-hours` | `by_weekday?=false` | `{ items: PeakHour[], suppressed, timezone, meta }` |
| GET | `/admin/analytics/timeseries` | `granularity=day\|week\|month` (def. `month`) | `AnalyticsTimeSeries` |
| GET | `/admin/analytics/co2-methodology` | — | supuestos y unidades (sin factores) |
| GET | `/admin/analytics/zones` | `zone_kind?` | `FeatureCollection` de zonas (MultiPolygon) con conteos |
| GET | `/admin/analytics/zones/{zone_id}/trips` | `relation=origin\|destination\|both\|any`, `page`, `page_size` | `Paginated<ZoneTrip>` sin trazas ni `user_id` · `404 ZONE_NOT_FOUND` |
| GET | `/admin/analytics/od-flows` | `zone_kind?`, `limit≤500` | `FeatureCollection` de líneas de deseo (LineString) |
| GET | `/admin/analytics/grid` | `bbox`, `cell_m=500`, `metric=origin\|destination\|route`, `shape=hex\|square` | `FeatureCollection` de celdas |
| GET | `/admin/analytics/heatmap` | `bbox`, `cell_m=250`, `point=origin\|destination\|both` | `HeatmapResponse` |
| GET | `/admin/analytics/corridors` | `bbox`, `cell_m=300`, `quantile=0.9`, `min_cells=3` | `FeatureCollection` de corredores (Polygon/MultiPolygon) |
| GET | `/admin/analytics/bike-lane-coverage` | `buffer_m=15` | `{ buffer_m, items: BikeLaneCoverageItem[], meta }` |
| POST | `/admin/analytics/route-crossings` | `page`, `page_size` · body `{ geometry, buffer_m≤500 }` | `Paginated<RouteCrossing>` |
| GET | `/admin/analytics/route-overlap` | `trip_a`, `trip_b`, `tolerance_m=15` | `RouteOverlap` · `404 TRIP_NOT_FOUND` |
| GET | `/admin/analytics/distance` | `from=lng,lat`, `to=lng,lat` | `{ distance_m, method: "geodesic" }` |
| GET | `/admin/analytics/infrastructure-priority` | `bbox`, `infra=bike_lane\|bike_station\|bus_stop\|pedestrian`, `cell_m=500` | `PriorityResponse` |

Los listados paginados usan la convención del contrato (`page`, `page_size ≤ 100`,
`{items,total,page,page_size}`) más `meta`.

**Correspondencia con la propuesta de web:** `timeseries`, `peak-hours`, `zones`, `od-flows` y `heatmap`
son las mismas rutas con los campos de esta propuesta (`trips_count`, `co2_saved_g`, `active_users`,
`cell_m`, `dataset`). Web aporta `users-growth`, `infrastructure` (conteos), CRUD `/admin/zones`,
`/admin/reports`, `/admin/trips` y `/admin/exports/*`.

## 4. Esquemas (resumen; definición ejecutable en `app/schemas/geo_analytics.py`)

```jsonc
// Valores ilustrativos de forma (no son datos de Querétaro)
// ModeCo2Breakdown — desglose explicable, derivado SOLO de valores guardados por viaje
{ "mode": "BUS", "trips_count": 120, "users": 40, "share_of_trips": 0.23,
  "passenger_km": 610.2,
  "reference_car_g": 117158.4,   // co2_emitted_g + co2_saved_g (auto de referencia)
  "mode_g": 41493.6,             // co2_emitted_g
  "avoided_g": 75664.8,          // co2_saved_g (>= 0, contrato v1)
  "per_passenger_km_g": 68.0,
  "vehicle_g_estimate": null,    // null en colectivo; privados = mode_g × ocupación supuesta
  "vehicle_occupancy_assumed": null,
  "clamped_trips": 0,            // viajes con co2_saved_g recortado a 0
  "sensitivity": [ { "baseline_occupancy": 1.0, "avoided_g": 75664.8 },
                   { "baseline_occupancy": 1.5, "avoided_g": 36612.0 } ] }

// AnalyticsSummary
{ "trips_count": 520, "active_users": 130, "distance_m": 2.1e6,
  "sustainable_trips": 470, "sustainable_distance_m": 1.9e6,
  "co2_emitted_g": 9.1e4, "co2_saved_g": 3.2e5,
  "co2": { "trips_count": 520, "passenger_km": 2100, "reference_car_g": 4.1e5,
           "mode_g": 9.1e4, "avoided_g": 3.2e5, "clamped_trips": 0 },
  "by_mode": [ModeCo2Breakdown], "suppressed": false, "meta": {} }

// PeakHour             { "hour": 8, "weekday": 1 | null, "trips_count": 40, "co2_saved_g": 9000 }
// AnalyticsTimePoint   { "period_start": "2026-10-01T06:00:00Z", "trips_count": 0, "distance_m": 0,
//                        "co2_saved_g": 0, "active_users": 0 }   // periodos en America/Mexico_City
// HeatmapResponse      FeatureCollection de Point [lng, lat] (centroides de celda) con
//                      properties { weight, users } + "cell_m": 250, "max_weight": 14, "meta": {}
// Feature (zones)      properties: zone_id, zone_code, zone_name, zone_is_demo, area_km2, origins,
//                      destinations, internal_trips, users, sustainable_distance_m, co2_saved_g,
//                      trip_ends_per_km2
// Feature (grid)       properties: cell_i, cell_j, trips_count, users, co2_saved_g
// Feature (od-flows)   properties: origin_zone_id/name, destination_zone_id/name, trips_count, users,
//                      avg_distance_m
// Feature (corridors)  properties: corridor_id, cells, trips_count, users, max_cell_trips, span_m,
//                      elongation, modes {MODE: trips}
// PriorityResponse     FeatureCollection + infra, profile_label, config_version, components[], notes[];
//                      properties: score 0–100 | null, label, confidence, sample {users, trip_ends},
//                      demand_share, components[{key,label,kind,raw,normalized,weight,contribution,
//                      available}], explanation
```

`label` del índice ∈ `candidata_prioritaria_para_estudio`, `candidata_para_evaluar`,
`sin_senal_prioritaria`, `datos_insuficientes`. Nunca se emite "necesita infraestructura".

## 5. Base de datos (DATABASE.md §3 — añadir)

Esquema `geo` (propiedad del módulo geo; SQL integrado por Backend vía Alembic con `op.execute`):

| Objeto | Tipo | Notas |
|---|---|---|
| `geo.mobility_zones` | tabla | `id, code UNIQUE, name, kind ∈ {colonia, ageb, municipio, distrito, custom}, geom MultiPolygon 4326, geom_utm (generada, 32614), area_km2 (generada), source NOT NULL, is_demo` · `CHECK is_demo = (source = 'DEMO')` · GiST |
| `geo.demo_trips`, `geo.demo_bike_lanes`, `geo.demo_stations` | tablas | Solo DEMO; sin FK a users; nombres `DEMO …` |
| `geo.v_trips`, `geo.v_bike_lanes`, `geo.v_stations`, `geo.v_zones` | vistas | `public.trips/cycleways/pois` ∪ DEMO, con `is_demo`, O/D = extremos de `route`, proyecciones UTM 14N |
| `geo.mv_daily_stats` | vista materializada | día local × hora × día de la semana × modo × `is_demo`; `geo.refresh_aggregates()` (job) |
| funciones `geo.*` | SQL/PLpgSQL `STABLE` | ver `apps/api/docs/geo/GEO_QUERIES.md` |

Índices de expresión sobre tablas canónicas (los crea `geo.rebuild_adapters()`):
`trips` GiST `ST_Transform(ST_StartPoint(route),32614)`, `ST_Transform(ST_EndPoint(route),32614)`,
`ST_Transform(route,32614)`, btree `(mode, started_at)`; `cycleways` GiST `ST_Transform(geom,32614)`;
`pois` GiST `ST_Transform(location,32614)`.

**Optimización recomendada (decisión de database/Backend):** columna generada
`trips.route_utm geometry(LineString,32614) GENERATED ALWAYS AS (ST_Transform(route,32614)) STORED`.
Con ~25 000 viajes las funciones sobre rutas por cuadrícula tardan de 0.7 a 8 s porque
`ST_Transform` se recalcula al comprobar cada candidato; con la columna almacenada desaparece ese coste.

Orden de migración: `001_schema.sql` → `002_functions.sql` → `003_aggregates.sql` (en ese orden, en una
migración posterior a `20261116_0230`). `downgrade`: `DROP SCHEMA geo CASCADE` + `DROP INDEX` de los
índices `ix_*_geo_*`.

## 6. CO₂ (ADR-002)

- No hay un segundo motor: `services/co2.py` (Backend) sigue siendo el único cálculo por viaje.
- La analítica **suma** `co2_emitted_g`/`co2_saved_g` guardados; `reference_car_g`, `per_passenger_km_g`,
  `vehicle_g_estimate` y `sensitivity` se derivan de esas sumas y de supuestos de ocupación
  (`app/services/geo_analytics/config/co2_assumptions.json`, sin factores de emisión).
- `avoided_g` respeta el contrato (≥ 0). No se exponen rangos low/high ni valores negativos.
- Metodología: [`apps/api/docs/geo/CO2_METHODOLOGY.md`](../../apps/api/docs/geo/CO2_METHODOLOGY.md).

## 7. Clientes (web y Android)

- Todas las respuestas son GeoJSON RFC 7946 (`[lng, lat]`), también el mapa de calor
  (`Point` + `properties.weight`). El cliente convierte al formato de su librería (Leaflet.heat
  espera `[lat, lng, intensidad]`). Sin MVT.
- **Alcance de clientes:** solo `apps/web` (panel admin, ARCHITECTURE §3). La app móvil no tiene vistas
  de administración ni consume `/admin/*` (confirmado por mobile).
- Las geometrías salen con 6 decimales (~0.1 m). Los clientes simplifican al dibujar trazas largas.
- Mientras no se apruebe, web muestra «pendiente de contrato» (acordado con web).

## 8. Tipos para `packages/shared/src/types/api.ts` (architect)

```ts
export type AnalyticsDataset = "official" | "demo";
export interface AnalyticsMeta {
  from: string; to: string; modes: TransportMode[] | null; dataset: AnalyticsDataset;
  is_demo: boolean; min_users: number; is_estimate: boolean; notes: string[];
}
export interface Co2Sensitivity { baseline_occupancy: number; avoided_g: number }
export interface ModeCo2Breakdown {
  mode: TransportMode; trips_count: number; users: number; share_of_trips: number;
  passenger_km: number; reference_car_g: number; mode_g: number; avoided_g: number;
  per_passenger_km_g: number | null; vehicle_g_estimate: number | null;
  vehicle_occupancy_assumed: number | null; clamped_trips: number; sensitivity: Co2Sensitivity[];
}
export interface AnalyticsSummary {
  trips_count: number; active_users: number; distance_m: number; sustainable_trips: number;
  sustainable_distance_m: number; co2_emitted_g: number; co2_saved_g: number;
  co2: { trips_count: number; passenger_km: number; reference_car_g: number; mode_g: number;
         avoided_g: number; clamped_trips: number } | null;
  by_mode: ModeCo2Breakdown[]; suppressed: boolean; meta: AnalyticsMeta;
}
export interface PeakHour { hour: number; weekday: number | null; trips_count: number; co2_saved_g: number }
export interface AnalyticsTimePoint {
  period_start: string; trips_count: number; distance_m: number; co2_saved_g: number; active_users: number;
}
export interface AnalyticsTimeSeries {
  granularity: Granularity; timezone: string; points: AnalyticsTimePoint[]; suppressed: boolean; meta: AnalyticsMeta;
}
export interface AnalyticsFeatureCollection<P> {
  type: "FeatureCollection"; meta: AnalyticsMeta;
  features: { type: "Feature"; id: string | null; geometry: GeoJSON.Geometry; properties: P }[];
}
export interface HeatmapResponse extends AnalyticsFeatureCollection<{ weight: number; users: number }> {
  cell_m: number; max_weight: number;
}
export type PriorityLabel =
  | "candidata_prioritaria_para_estudio" | "candidata_para_evaluar"
  | "sin_senal_prioritaria" | "datos_insuficientes";
```

## 9. Impacto en otros agentes

- **architect:** consolidar §3–§4 en API_CONTRACT 1.1.0 junto con la propuesta de web; tipos §8.
- **backend:** migración Alembic con los tres `.sql`; montar `app/routers/geo_analytics.py`; job de
  `geo.refresh_aggregates()`; valorar `trips.route_utm` (§5).
- **database/backend:** añadir `geo.*` a DATABASE.md §3.
- **web:** consumir GeoJSON con Leaflet; mostrar siempre `meta.notes` y la marca DEMO.
- **mobile:** sin impacto (no consume `/admin/*`).

## 10. Alternativas consideradas

- *Tablas `geo.trips` propias:* descartado (dos fuentes de verdad de viajes).
- *MVT (`ST_AsMVT`):* descartado por ADR-005 (Leaflet sin plugin vectorial); GeoJSON agregado basta
  con k-anonimato y bbox ≤ 0.5°.
- *KNN `<->` para la distancia a infraestructura:* a través de vistas `UNION ALL` provoca el error del
  planner «could not find pathkey item to sort»; se usa `ST_DWithin` acotado a 3000 m.
- *Mezclar DEMO y oficial con `include_demo`:* descartado a petición del architect; `dataset` excluyente.
