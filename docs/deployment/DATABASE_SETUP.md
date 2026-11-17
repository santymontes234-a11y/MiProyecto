# Base de datos (PostgreSQL 16 + PostGIS 3.4)

## 1. Cómo se crea

En el primer arranque del contenedor `db` (volumen `ecomove_prod_pgdata` vacío), la imagen oficial
`postgis/postgis:16-3.4` ejecuta:

1. `infrastructure/postgres/init/01-extensions.sql`: `postgis` y `pgcrypto`.
2. `infrastructure/postgres/init-prod/10-app-role.sh`: crea el rol `POSTGRES_USER` **sin superusuario**
   (`NOSUPERUSER NOCREATEDB NOCREATEROLE`, límite de 40 conexiones), lo hace **dueño de la BD** y revoca el
   acceso de `PUBLIC`.

Después, el job `migrate` ejecuta `alembic upgrade head` con el rol de la aplicación (las 10 migraciones,
incluidas las semillas de RBAC y factores de emisión). La API arranca solo si `migrate` termina bien.

| Rol | Superusuario | Lo usa |
|---|---|---|
| `POSTGRES_ADMIN_USER` (p. ej. `ecomove_admin`) | sí | backups, restauración, mantenimiento manual |
| `POSTGRES_USER` (p. ej. `ecomove_app`) | **no** | API y migraciones |

## 2. Configuración segura

- **Sin puertos publicados**: `db` solo está en la red Docker `backend` (`internal: true`, sin salida a Internet).
- Autenticación `scram-sha-256` para conexiones por red; conexión local por socket dentro del contenedor
  (usada por `docker compose exec db ...`).
- Parámetros (en `command:` del compose): `password_encryption=scram-sha-256`,
  `idle_in_transaction_session_timeout=60s`, log de consultas > 1 s, log de esperas de bloqueos,
  memoria configurable (`PG_*`).
- La API recibe las variables `POSTGRES_ADMIN_*` vacías.

## 3. Migraciones

```bash
cd /opt/ecomove
# Las ejecuta deploy.sh automáticamente. A mano:
docker compose -f infrastructure/docker-compose.prod.yml --env-file .env.production run --rm migrate
# Ver la revisión actual
docker compose -f infrastructure/docker-compose.prod.yml --env-file .env.production run --rm migrate current
# Historial
docker compose -f infrastructure/docker-compose.prod.yml --env-file .env.production run --rm migrate history
```

**Nunca** ejecutes `alembic downgrade` en producción sin un backup reciente: algunas migraciones borran datos al
revertirse. Para volver atrás, restaura el backup previo al despliegue (ROLLBACK.md).

Atajo recomendado para todos los comandos de esta página:

```bash
alias dc='docker compose -f /opt/ecomove/infrastructure/docker-compose.prod.yml --env-file /opt/ecomove/.env.production'
```

## 4. Datos iniciales

- La BD de producción arranca **sin datos de demostración** (`db/geo/900_demo_seed.sql` está excluido de la imagen).
- Ciclovías y POIs desde OpenStreetMap (necesita Internet; usa el servicio `api`, que sí tiene salida):

  ```bash
  dc run --rm --no-deps api python -m app.services.geo_analytics.osm_import --dry-run   # simula
  dc run --rm --no-deps api python -m app.services.geo_analytics.osm_import             # importa
  ```

- Zonas y censo INEGI (archivos descargados a mano, ver `docs/report/DATASETS.md`):

  ```bash
  dc run --rm --no-deps -v /ruta/inegi:/data:ro api \
    python -m app.services.geo_analytics.inegi_import --mg /data/conjunto_de_datos \
    --censo /data/conjunto_de_datos_ageb_urbana_22_cpv2020.csv
  ```

Ambos importadores son idempotentes. Datos © OpenStreetMap contributors (ODbL) e INEGI.

## 5. Tareas de mantenimiento

```bash
# Consola SQL como administrador
dc exec db psql -U "$(grep ^POSTGRES_ADMIN_USER= .env.production | cut -d= -f2)" -d ecomove
# Tamaño de la BD y conexiones
dc exec db psql -U ecomove_admin -d ecomove -c "SELECT pg_size_pretty(pg_database_size('ecomove'));"
dc exec db psql -U ecomove_admin -d ecomove -c "SELECT usename, state, count(*) FROM pg_stat_activity GROUP BY 1,2;"
```

**Cambiar la contraseña del rol de la aplicación** (la del `.env` no se aplica sola a un volumen existente):

```bash
NEW="$(infrastructure/scripts/generate_secrets.sh --print)"
dc exec db psql -U ecomove_admin -d ecomove -c "ALTER ROLE ecomove_app PASSWORD '$NEW';"
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NEW/" .env.production
dc up -d --force-recreate api
```

(Igual para el administrador con `ALTER ROLE ecomove_admin` y `POSTGRES_ADMIN_PASSWORD`.)

**Actualizar PostgreSQL de versión mayor** (16 → 17): no basta cambiar la imagen. Haz backup, crea un volumen
nuevo con la versión nueva y restaura (`restore.sh`). PostGIS menor (3.4.x) se actualiza al cambiar la imagen y
ejecutar `ALTER EXTENSION postgis UPDATE;`.

## 6. Verificado en local

Con `deploy.sh` sobre una copia local: el rol `ecomove_app` tiene `rolsuper = f`, las 10 migraciones se aplican
sin superusuario, la API inicia sesión con el SUPER_ADMIN creado por bootstrap y `db` no tiene salida a Internet.
