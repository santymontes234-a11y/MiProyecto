-- Se ejecuta solo al crear el volumen por primera vez. Las migraciones Alembic también
-- crean estas extensiones de forma idempotente (DATABASE.md §6).
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
