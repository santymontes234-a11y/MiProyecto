# Base de datos de EcoMove Querétaro: scripts SQL (entregable ABD)

| Archivo | Contenido |
|---|---|
| `01_esquema.sql` | DDL completo: PostGIS, esquema `geo`, 25 tablas (23 en `public` y 2 en `geo`), 13 tipos ENUM, PK, FK, UNIQUE, CHECK, índices B-tree y GiST, y `COMMENT ON` (el diccionario de datos). |
| `02_datos_ejemplo.sql` | Catálogos semilla, 12 usuarios ficticios (`@ejemplo.mx`, 3 roles), 71 viajes con todos los medios, logros, notificaciones, reportes ciudadanos, auditoría, una muestra OSM (72 POIs y 40 ciclovías) y los 18 municipios del INEGI con su censo. |
| `04_consultas_espaciales.sql` | 14 consultas espaciales avanzadas del módulo geo (A1–A6 sobre viajes y B1–B8 con INEGI y OSM). Requieren las vistas y funciones `geo.*` de las migraciones, así que se ejecutan sobre la BD de la demo y no sobre `ecomove_abd`. |
| `03_consultas.sql` | 24 consultas comentadas: JOIN de 3 o más tablas, GROUP BY/HAVING, subconsultas, CTE, funciones de ventana, una vista, índices con EXPLAIN, consultas espaciales (ST_DWithin, ST_Within, ST_Intersects) y CRUD dentro de una transacción con ROLLBACK. |

## Ejecución

Requisitos: PostgreSQL 16 y PostGIS 3.4, por ejemplo con la imagen `postgis/postgis:16-3.4` del `docker-compose`. Los scripts deben ejecutarse **en orden, sobre una BD vacía**:

```bash
createdb ecomove_abd
psql -v ON_ERROR_STOP=1 -d ecomove_abd -f database/01_esquema.sql
psql -v ON_ERROR_STOP=1 -d ecomove_abd -f database/02_datos_ejemplo.sql
psql -v ON_ERROR_STOP=1 -d ecomove_abd -f database/03_consultas.sql
```

Con el contenedor del compose:

```bash
docker compose exec -T db createdb -U ecomove ecomove_abd
for f in 01_esquema 02_datos_ejemplo 03_consultas; do docker compose exec -T db psql -v ON_ERROR_STOP=1 -U ecomove -d ecomove_abd < database/$f.sql; done
```

Para `04_consultas_espaciales.sql`, sobre la BD del compose ya migrada e importada (solo lectura; B4 tarda unos 2 minutos):

```bash
docker compose -f infrastructure/docker-compose.yml --env-file .env exec -T db psql -v ON_ERROR_STOP=1 -U ecomove -d ecomove < database/04_consultas_espaciales.sql
```

`03_consultas.sql` se puede repetir: el CRUD se revierte, la vista usa `CREATE OR REPLACE` y el índice, `IF NOT EXISTS`.

## Datos de ejemplo

- **Cuentas:** todas son ficticias y usan la contraseña `EcoMove-Demo-2026`, guardada como hash Argon2id.
  - `sofia.ramirez@ejemplo.mx` (SUPER_ADMIN).
  - `diego.hernandez@ejemplo.mx` y `mariana.lopez@ejemplo.mx` (ADMIN).
  - Las demás son USER.
- **Sesiones y tokens:** se guarda solo el SHA-256 de valores aleatorios ya descartados, así que no sirven para iniciar sesión.
- **Puntos de interés y ciclovías:** muestra real de OpenStreetMap, © OpenStreetMap contributors, bajo licencia ODbL 1.0.
- **Municipios y censo:** INEGI, Marco Geoestadístico y Censo de Población y Vivienda 2020. Los polígonos están simplificados a unos 300 m.
- **Líneas de transporte (`L01`–`L05`) y códigos oficiales de parada (`QRO-…`, `QB-…`):** son ficticios.
- **Cálculo de viajes:** la distancia, el CO₂ y los puntos se calculan en el propio script con los factores de las tablas, con la misma fórmula que el backend (contrato §4.2 y §4.3).

## Relación con las migraciones

La fuente de verdad del esquema son las migraciones Alembic (`apps/api/alembic/versions`, 0001–0010). La API las aplica al arrancar.

`01_esquema.sql` se generó con `pg_dump --schema-only` desde una BD recién migrada, con estas exclusiones:

- `alembic_version`;
- las tablas sintéticas `geo.demo_*`;
- las funciones y vistas analíticas del módulo geo.

Si cambia el esquema, se regenera así:

```bash
pg_dump -s --no-owner --no-privileges -n public -T public.alembic_version <bd>
pg_dump -s --no-owner --no-privileges -t geo.mobility_zones -t geo.zone_census <bd>
```

Documentación relacionada:

- [`docs/report/NORMALIZACION.md`](../docs/report/NORMALIZACION.md): normalización y dependencias funcionales.
- [`docs/report/DICCIONARIO_DATOS.md`](../docs/report/DICCIONARIO_DATOS.md): diccionario de datos.
- [`docs/report/diagramas/`](../docs/report/diagramas/): MER y EER.
