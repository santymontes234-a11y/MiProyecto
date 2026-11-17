#!/usr/bin/env bash
# Ejecuta las baterías E2E (API y web) contra un stack AISLADO y efímero:
#   - PostGIS desechable en 127.0.0.1:$QA_DB_PORT (contenedor propio, se borra al salir)
#   - API (uvicorn de apps/api/.venv) en 127.0.0.1:$QA_API_PORT
#   - Web (next start, requiere `next build` previo) en 127.0.0.1:$QA_WEB_PORT
# Todos los secretos son aleatorios y solo existen durante la ejecución. Nunca usa .env real.
#
# Uso:  tests/e2e/run-local.sh [api|web|all|evidence] [args extra de pytest]
#   evidence: regenera las capturas y la verificación SQL de docs/report/evidencias/
#   E2E_RUN_RATE_LIMIT=1 tests/e2e/run-local.sh api -k rate_limit
set -euo pipefail

MODE="${1:-all}"; shift || true
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
QA_DB_PORT="${QA_DB_PORT:-54391}"
QA_API_PORT="${QA_API_PORT:-8099}"
QA_WEB_PORT="${QA_WEB_PORT:-3099}"
CONTAINER="ecomove-qa-e2e-$$"
WORK="$(mktemp -d)"
PIDS=()

cleanup() {
  # Cada servidor corre en su propio grupo de procesos (setsid): se mata el grupo entero
  # para no dejar hijos huérfanos (next-server, workers de uvicorn).
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill -- "-$p" 2>/dev/null || kill "$p" 2>/dev/null || true; done
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

rand() { python3 -c "import secrets;print(secrets.token_urlsafe($1))"; }
wait_http() { for _ in $(seq 1 90); do curl -fsS -o /dev/null "$1" && return 0; sleep 1; done; echo "No responde: $1" >&2; return 1; }

DB_PW="$(rand 24)"
export DATABASE_URL_OVERRIDE="postgresql+psycopg://qa:${DB_PW}@127.0.0.1:${QA_DB_PORT}/qa"
export JWT_SECRET_KEY="$(rand 64)"
export API_ENV=development
export CORS_ORIGINS="http://localhost:${QA_WEB_PORT},http://localhost:3000"
export BOOTSTRAP_SUPER_ADMIN_EMAIL="qa-superadmin@example.com"
export BOOTSTRAP_SUPER_ADMIN_PASSWORD="Qa$(rand 16)9"
export E2E_SUPERADMIN_EMAIL="$BOOTSTRAP_SUPER_ADMIN_EMAIL"
export E2E_SUPERADMIN_PASSWORD="$BOOTSTRAP_SUPER_ADMIN_PASSWORD"
export E2E_API_BASE_URL="http://127.0.0.1:${QA_API_PORT}/api/v1"
export E2E_WEB_URL="http://localhost:${QA_WEB_PORT}"
export E2E_ALLOWED_ORIGIN="http://localhost:${QA_WEB_PORT}"
export E2E_REQUIRE_API=1
# NEXT_PUBLIC_API_BASE_URL queda incrustada en el build (def. localhost:8000). Playwright redirige
# esas llamadas del navegador a la API aislada sin reconstruir la web (ver tests/e2e/web/specs/fixtures.ts).
export E2E_BROWSER_API_FROM="${E2E_BROWSER_API_FROM:-http://localhost:8000/api/v1}"

echo "› PostGIS desechable ($CONTAINER)"
docker run -d --rm --name "$CONTAINER" -e POSTGRES_DB=qa -e POSTGRES_USER=qa -e POSTGRES_PASSWORD="$DB_PW" \
  -p "127.0.0.1:${QA_DB_PORT}:5432" postgis/postgis:16-3.4 >/dev/null
for _ in $(seq 1 60); do docker exec "$CONTAINER" pg_isready -U qa -d qa >/dev/null 2>&1 && break; sleep 1; done
sleep 2

echo "› Migraciones (upgrade head)"
# La imagen de PostGIS reinicia el servidor tras el initdb: pg_isready puede dar un falso positivo.
ok=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if (cd "$ROOT/apps/api" && .venv/bin/alembic upgrade head >"$WORK/alembic.log" 2>&1); then ok=1; break; fi
  grep -q "OperationalError" "$WORK/alembic.log" || break
  sleep 2
done
[ "$ok" = 1 ] || { cat "$WORK/alembic.log"; exit 1; }

echo "› API en :$QA_API_PORT"
(cd "$ROOT/apps/api" && exec setsid .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "$QA_API_PORT" --no-server-header) \
  >"$WORK/api.log" 2>&1 &
PIDS+=($!)
wait_http "$E2E_API_BASE_URL/health"

STATUS=0
if [ "$MODE" = "api" ] || [ "$MODE" = "all" ]; then
  echo "› Batería API (tests/e2e/api)"
  VENV="$WORK/venv"; python3 -m venv "$VENV"; "$VENV/bin/pip" install -q -r "$ROOT/tests/e2e/api/requirements.txt"
  "$VENV/bin/pytest" -c "$ROOT/tests/e2e/api/pytest.ini" "$ROOT/tests/e2e/api" -p no:cacheprovider -q "$@" || STATUS=1
fi

if [ "$MODE" = "evidence" ]; then
  export E2E_EVIDENCE_DIR="$ROOT/docs/report/evidencias"
  export E2E_DB_CONTAINER="$CONTAINER"
fi

if [ "$MODE" = "web" ] || [ "$MODE" = "all" ] || [ "$MODE" = "evidence" ]; then
  echo "› Web en :$QA_WEB_PORT (next start)"
  [ -d "$ROOT/apps/web/.next" ] || { echo "Falta 'next build' en apps/web" >&2; exit 1; }
  (cd "$ROOT/apps/web" && API_INTERNAL_BASE_URL="$E2E_API_BASE_URL" NEXT_PUBLIC_API_BASE_URL="$E2E_API_BASE_URL" \
     NEXT_TELEMETRY_DISABLED=1 exec setsid npx next start -H 127.0.0.1 -p "$QA_WEB_PORT") >"$WORK/web.log" 2>&1 &
  PIDS+=($!)
  wait_http "$E2E_WEB_URL/"
  echo "› Batería web (tests/e2e/web, Playwright)"
  (cd "$ROOT/tests/e2e/web" && [ -d node_modules ] || npm install --no-audit --no-fund >/dev/null)
  if [ "$MODE" = "evidence" ]; then
    (cd "$ROOT/tests/e2e/web" && npx playwright test specs/evidencias.spec.ts) || STATUS=1
  else
    (cd "$ROOT/tests/e2e/web" && npx playwright test) || STATUS=1
  fi
fi

if [ "$STATUS" -ne 0 ]; then
  echo "── Últimas líneas del log de la API ──"; tail -40 "$WORK/api.log"
fi
# Comprobación de logs: sin JWT ni contraseñas en claro.
if grep -qE 'eyJ[A-Za-z0-9_-]{10,}\.' "$WORK/api.log" || grep -qF "$BOOTSTRAP_SUPER_ADMIN_PASSWORD" "$WORK/api.log"; then
  echo "✗ El log de la API contiene tokens o contraseñas" >&2; STATUS=1
else
  echo "✓ Logs de la API sin tokens ni contraseñas"
fi
exit "$STATUS"
