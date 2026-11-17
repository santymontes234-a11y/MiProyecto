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
 e2166748-de9a-40c2-b807-4cdd5e72212c | Ciclopuerto Ejemplo Alameda | BIKE_PARKING |        20 | POINT(-100.38998 20.58876) | t         | 2026-11-17 02:23:42.773969+00
(1 row)
```

**POI · después de editar (UPDATE)**

```sql
SELECT p.id, p.name, b.capacity AS capacidad, p.is_active, p.created_at, p.updated_at FROM pois p LEFT JOIN bike_stations b ON b.poi_id = p.id WHERE p.name LIKE 'Ciclopuerto Ejemplo%';
```

```text
id                  |                  name                  | capacidad | is_active |          created_at           |          updated_at           
--------------------------------------+----------------------------------------+-----------+-----------+-------------------------------+-------------------------------
 e2166748-de9a-40c2-b807-4cdd5e72212c | Ciclopuerto Ejemplo Alameda (ampliado) |        35 | t         | 2026-11-17 02:23:42.773969+00 | 2026-11-17 02:23:48.304487+00
(1 row)
```

**POI · después de eliminar (borrado lógico: is_active = false)**

```sql
SELECT id, name, is_active, updated_at FROM pois WHERE name LIKE 'Ciclopuerto Ejemplo%';
```

```text
id                  |                  name                  | is_active |          updated_at           
--------------------------------------+----------------------------------------+-----------+-------------------------------
 e2166748-de9a-40c2-b807-4cdd5e72212c | Ciclopuerto Ejemplo Alameda (ampliado) | f         | 2026-11-17 02:23:50.637166+00
(1 row)
```

**Auditoría de las operaciones sobre el POI**

```sql
SELECT action, entity_type, created_at FROM audit_logs WHERE entity_type = 'poi' ORDER BY created_at;
```

```text
action    | entity_type |          created_at           
-------------+-------------+-------------------------------
 POI_CREATED | poi         | 2026-11-17 02:23:42.773969+00
 POI_UPDATED | poi         | 2026-11-17 02:23:48.304487+00
 POI_DELETED | poi         | 2026-11-17 02:23:50.637166+00
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
 f674f132-b44e-4698-9a81-3c12fad2de3a | BICYCLE |        1950 |       1080 |         374.5 |                        0
 70a0d130-ef78-4157-9489-9941dc75aa57 | BUS     |        3811 |       1500 |         472.6 |                       68
 1569cb43-dba3-49b5-a341-6178e29a63b9 | WALK    |         700 |        900 |         134.3 |                        0
(3 rows)
```

**Viajes · después de eliminar (DELETE)**

```sql
SELECT count(*) AS existe FROM trips WHERE id = 'f674f132-b44e-4698-9a81-3c12fad2de3a';
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
