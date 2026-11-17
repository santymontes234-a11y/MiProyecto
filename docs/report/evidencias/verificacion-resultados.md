# Verificación en base de datos de las operaciones CRUD

Salida real de `psql` sobre la base efímera usada para generar las capturas (tests/e2e/run-local.sh evidence). Datos ficticios.

**POI · antes de crear**

```sql
SELECT id, name, category, is_active FROM pois WHERE name LIKE 'Ciclopuerto Ejemplo%';
```

```text
id | name | category | is_active 
----+------+----------+-----------
(0 rows)
```

**POI · después de crear (INSERT)**

```sql
SELECT p.id, p.name, p.category, b.capacity AS capacidad, ST_AsText(p.location) AS ubicacion, p.is_active, p.created_at FROM pois p LEFT JOIN bike_stations b ON b.poi_id = p.id WHERE p.name = 'Ciclopuerto Ejemplo Alameda';
```

```text
id                  |            name             |   category   | capacidad |         ubicacion          | is_active |          created_at           
--------------------------------------+-----------------------------+--------------+-----------+----------------------------+-----------+-------------------------------
 b8f2417a-9dc6-4840-b836-725b7f782483 | Ciclopuerto Ejemplo Alameda | BIKE_PARKING |        20 | POINT(-100.38998 20.58876) | t         | 2026-11-17 13:33:53.406265+00
(1 row)
```

**POI · después de editar (UPDATE)**

```sql
SELECT p.id, p.name, b.capacity AS capacidad, p.is_active, p.created_at, p.updated_at FROM pois p LEFT JOIN bike_stations b ON b.poi_id = p.id WHERE p.name LIKE 'Ciclopuerto Ejemplo%';
```

```text
id                  |                  name                  | capacidad | is_active |          created_at           |          updated_at           
--------------------------------------+----------------------------------------+-----------+-----------+-------------------------------+-------------------------------
 b8f2417a-9dc6-4840-b836-725b7f782483 | Ciclopuerto Ejemplo Alameda (ampliado) |        35 | t         | 2026-11-17 13:33:53.406265+00 | 2026-11-17 13:34:37.267303+00
(1 row)
```

**POI · después de eliminar (borrado lógico: is_active = false)**

```sql
SELECT id, name, is_active, updated_at FROM pois WHERE name LIKE 'Ciclopuerto Ejemplo%';
```

```text
id                  |                  name                  | is_active |          updated_at           
--------------------------------------+----------------------------------------+-----------+-------------------------------
 b8f2417a-9dc6-4840-b836-725b7f782483 | Ciclopuerto Ejemplo Alameda (ampliado) | f         | 2026-11-17 13:34:39.733076+00
(1 row)
```

**Auditoría de las operaciones sobre el POI**

```sql
SELECT action, entity_type, created_at FROM audit_logs WHERE entity_type = 'poi' ORDER BY created_at;
```

```text
action    | entity_type |          created_at           
-------------+-------------+-------------------------------
 POI_CREATED | poi         | 2026-11-17 13:33:53.406265+00
 POI_UPDATED | poi         | 2026-11-17 13:34:37.267303+00
 POI_DELETED | poi         | 2026-11-17 13:34:39.733076+00
(3 rows)
```

**Viajes · antes de registrar**

```sql
SELECT count(*) AS viajes FROM trips t JOIN users u ON u.id = t.user_id WHERE u.email = 'ana.ejemplo@ejemplo.mx';
```

```text
viajes 
--------
      0
(1 row)
```

**Viajes · después de registrar (INSERT; distancia y CO₂ calculados en el servidor)**

```sql
SELECT t.id, t.mode, round(t.distance_m) AS distancia_m, t.duration_s, round(t.co2_saved_g::numeric, 1) AS co2_evitado_g, t.emission_factor_g_per_km FROM trips t JOIN users u ON u.id = t.user_id WHERE u.email = 'ana.ejemplo@ejemplo.mx' ORDER BY t.started_at DESC;
```

```text
id                  |  mode   | distancia_m | duration_s | co2_evitado_g | emission_factor_g_per_km 
--------------------------------------+---------+-------------+------------+---------------+--------------------------
 f6fe8ed9-b27d-42a8-8d59-16b222f4729e | BICYCLE |        1950 |       1080 |         339.4 |                        0
 0c70bfe0-b73e-4401-8e2c-ab285d8425db | BUS     |        3811 |       1500 |         404.0 |                       68
 573199d6-4db5-4fc5-a6c0-827f11a1640b | WALK    |         700 |        900 |         121.7 |                        0
(3 rows)
```

**Viajes · antes de editar**

```sql
SELECT id, mode, status, round(distance_m) AS distancia_m, round(co2_saved_g::numeric, 1) AS co2_evitado_g, round(co2_emitted_g::numeric, 1) AS co2_emitido_g, points AS puntos, updated_at FROM trips WHERE id = 'f6fe8ed9-b27d-42a8-8d59-16b222f4729e';
```

```text
id                  |  mode   |  status   | distancia_m | co2_evitado_g | co2_emitido_g | puntos |          updated_at          
--------------------------------------+---------+-----------+-------------+---------------+---------------+--------+------------------------------
 f6fe8ed9-b27d-42a8-8d59-16b222f4729e | BICYCLE | COMPLETED |        1950 |         339.4 |           0.0 |      3 | 2026-11-17 13:34:41.33247+00
(1 row)
```

**Viajes · después de editar (UPDATE; CO₂ y puntos recalculados en el servidor)**

```sql
SELECT id, mode, status, round(distance_m) AS distancia_m, round(co2_saved_g::numeric, 1) AS co2_evitado_g, round(co2_emitted_g::numeric, 1) AS co2_emitido_g, points AS puntos, updated_at FROM trips WHERE id = 'f6fe8ed9-b27d-42a8-8d59-16b222f4729e';
```

```text
id                  | mode |  status   | distancia_m | co2_evitado_g | co2_emitido_g | puntos |          updated_at           
--------------------------------------+------+-----------+-------------+---------------+---------------+--------+-------------------------------
 f6fe8ed9-b27d-42a8-8d59-16b222f4729e | BUS  | COMPLETED |        1950 |         206.7 |         132.6 |      2 | 2026-11-17 13:34:45.685983+00
(1 row)
```

**Viajes · después de eliminar (DELETE)**

```sql
SELECT count(*) AS existe FROM trips WHERE id = 'f6fe8ed9-b27d-42a8-8d59-16b222f4729e';
```

```text
existe 
--------
      0
(1 row)
```

**Viajes restantes del usuario**

```sql
SELECT t.mode, round(t.distance_m) AS distancia_m FROM trips t JOIN users u ON u.id = t.user_id WHERE u.email = 'ana.ejemplo@ejemplo.mx' ORDER BY t.started_at DESC;
```

```text
mode | distancia_m 
------+-------------
 BUS  |        3811
 WALK |         700
(2 rows)
```
