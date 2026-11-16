# Consultas PostGIS del módulo geo

SQL en `apps/api/db/geo/`. Probado en PostgreSQL 16 + PostGIS 3.4 sobre el esquema migrado con
Alembic (`tests/geo/`). Propuesta de contrato: `docs/proposals/2026-11-15-geo-analytics.md`.

## 1. Archivos y orden

| Archivo | Contenido | ¿Migración? |
|---|---|---|
| `001_schema.sql` | esquema `geo`, `mobility_zones`, tablas `demo_*`, `geo.rebuild_adapters()` (vistas `v_*` + índices de expresión) | Sí |
| `002_functions.sql` | funciones de consulta | Sí |
| `003_aggregates.sql` | `geo.mv_daily_stats` + `geo.refresh_aggregates()` | Sí |
| `900_demo_seed.sql` | `geo.seed_demo(n)`, `geo.clear_demo()` — **datos sintéticos** | **No** (solo dev/tests) |

`geo.rebuild_adapters()` es idempotente (`CREATE OR REPLACE VIEW`). Vuelve a ejecutarla si cambia
el esquema de `trips`, `cycleways` o `pois`.

## 2. Diseño

- **Una sola fuente de viajes:** `geo.v_trips` = `public.trips` ∪ `geo.demo_trips` con `is_demo`.
  Origen y destino = `ST_StartPoint/ST_EndPoint(route)`. `is_completed` filtra `status = COMPLETED`.
- **Cálculo métrico en UTM 14N (EPSG:32614)** mediante índices GiST de expresión con la misma expresión
  que la vista, para que el planner los use a través del `UNION ALL`.
- Las ramas de `v_trips` **no tienen `WHERE`**: PostgreSQL solo "aplana" ramas sin condiciones propias,
  y solo entonces empuja los filtros y joins parametrizados a cada índice. Por eso el estado se filtra en
  `trips_filtered`.
- `geo.trips_filtered(from, to, modes, demo)` es SQL de una sentencia (`STABLE`), así que el planner la
  expande en línea.
- **Dataset excluyente:** `p_demo = false` solo datos oficiales; `true` solo DEMO.
- **k-anonimato:** parámetro `p_min_users` en toda agregación espacial.
- Validaciones con `RAISE ... ERRCODE`: `22023` → 400, `54000` → 400 `GRID_TOO_LARGE`, `P0002` → 404.

## 3. Funciones

| Función | Pregunta que responde |
|---|---|
| `distance_m(lon1, lat1, lon2, lat2)` | Distancia geodésica entre puntos |
| `trips_in_zone(zone, relation, …, limit, offset)` | Viajes con O, D, ambos o ruta dentro de una zona (paginado, `total_count`) |
| `trips_by_zone(kind, …, k)` | Agrupación por áreas: orígenes, destinos, internos, usuarios, densidad, CO₂ |
| `od_flows(kind, …, k, limit)` | Matriz O–D entre zonas (líneas de deseo) |
| `trips_crossing(geom, buffer, …)` | Intersección de rutas con una línea o polígono (longitud dentro) |
| `route_overlap(a, b, tol)` | Intersección entre dos rutas: cruces y tramo compartido |
| `bike_lane_coverage(buffer, …)` | % de km recorridos sobre ciclovías por modo (buffer unido y subdividido) |
| `grid_counts(bbox, cell, metric, shape, …, k)` | Conteo por cuadrícula cuadrada/hexagonal de O, D o rutas |
| `point_density(bbox, cell, point, …, k)` | Mapa de calor agregado (O(n), sin geometrías de celda) |
| `mobility_corridors(bbox, cell, q, …, k, min_cells)` | Celdas con densidad de rutas ≥ cuantil, agrupadas por contigüidad (`ST_ClusterDBSCAN`) |
| `priority_inputs(bbox, cell, …)` | Observaciones para el índice de prioridad |
| `mv_daily_stats` | Series, horas pico y reparto modal sin recorrer `trips` |

## 4. Rendimiento medido (referencia, no SLA)

Contenedor local, 25 030 viajes, bbox de unos 12 × 13 km:

| Consulta | Tiempo |
|---|---|
| viajes de un modo con origen en una zona | < 1 ms (índice GiST de expresión) |
| `trips_by_zone` (16 zonas) | ~0.7 s |
| `grid_counts` por rutas, 500 m | ~2.7 s |
| `priority_inputs`, 500 m | ~2.7–3.8 s |
| `mobility_corridors`, 300 m | ~7.9 s |

El coste de las funciones sobre rutas viene de recalcular `ST_Transform(route)` en cada comprobación.
Con la columna almacenada `trips.route_utm` (propuesta §5) y un refresco programado de celdas
precalculadas, se reduce de forma notable. Hasta entonces: rutas solo ADMIN, bbox ≤ 0.5° y caché HTTP
por consulta.

## 5. Datos

- **Reales:** solo los que lleguen por la app (`public.trips`) y capas con fuente autorizada
  (`cycleways.osm_id`, `pois`, `mobility_zones.source`, p. ej. el Marco Geoestadístico del INEGI).
  No se incluye ninguna estadística de Querétaro inventada.
- **DEMO:** `geo.seed_demo()` genera zonas en rejilla, tres ciclovías rectas, estaciones aleatorias y
  viajes entre cinco polos ficticios. Todo lleva `DEMO` en nombre o `source`, vive en tablas aisladas y
  solo se consulta con `dataset=demo`.
