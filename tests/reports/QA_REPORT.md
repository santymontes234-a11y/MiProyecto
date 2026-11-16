# Reporte de QA e integración — EcoMove Querétaro

> Agente QA/seguridad · Revisión **provisional #1** · 2026-11-15 20:30 CST
> Hallazgos de seguridad detallados en [SECURITY_REPORT.md](SECURITY_REPORT.md).

## Estado por componente

| Componente | Typecheck / lint | Tests | Build | Estado |
|---|---|---|---|---|
| `packages/shared` | `tsc` ✅ 0 errores | — (no hay tests) | n/a (fuente TS) | OK |
| `apps/web` | `tsc` ❌ 20 errores | `vitest.config.ts` existe, pero `vitest` no está en `package.json` | ❌ (faltan dependencias) | Bloqueado |
| `apps/mobile` | `tsc` ❌ 4 errores | — | no probado (EAS/Gradle) | En progreso |
| `apps/api` | ruff: 196 × E501 y 9 menores | sin tests propios aún (solo `tests/geo/`) | ❌ no existe `app/main.py` (lo referencia el `Dockerfile`) | En reescritura (no se reporta) |
| Docker Compose | `docker compose config` ✅ | — | requiere `../.env` (esperado) | OK sintácticamente |
| Alembic | cadena `0001 → 0002` lineal ✅ | `upgrade head` desde cero no ejecutado | — | Pendiente |
| CI | no existe `.github/workflows/` | — | — | Falta |

## Incompatibilidades de integración

| ID | Sev. | Dueño | Descripción |
|---|---|---|---|
| INT-01 | ALTA | web | **Tipos propios fuera de `@ecomove/shared`** (`apps/web/src/lib/api/types.ts`, escrito antes de existir el contrato). `Role = "CITIZEN" \| …` frente al contrato `USER`; `TokenPair` sin `user`; `User.zone_name`; enums de modos/reportes propios. Viola AGENTS.md §2.7. Cualquier lógica de UI que compare con `"CITIZEN"` falla con usuarios reales. |
| INT-02 | ALTA | web | Dependencias no declaradas: `lucide-react`, `recharts`, `zod`, `server-only`, `vitest` (+ testing-library). `next build` y `tsc` fallan. No hay script `lint` ni ESLint configurado. |
| INT-03 | ALTA | web | BFF duplicado `/api/session/*` frente a `/api/auth/*`. El cliente compartido documenta `/api/session/refresh` para web; la web nueva usa `/api/bff` + `/api/auth`. (= SEC-01) |
| INT-04 | MEDIA | web | El BFF devuelve errores `{ "detail": … }` en lugar del formato `{ "error": { code, message, details } }` del contrato; `isApiErrorBody` de shared no los reconoce. |
| INT-05 | MEDIA | web | Las rutas protegidas por `proxy.ts` (`/app`, `/admin`) no coinciden con las páginas existentes (`/viajes`, `/admin`, `/mapa`, `/`). Faltan las páginas `/login` y `/registro`. (= SEC-05) |
| INT-06 | MEDIA | web | Variables de entorno: `API_BASE_URL` vs `API_INTERNAL_BASE_URL` vs `NEXT_PUBLIC_API_BASE_URL`. (= SEC-04) |
| INT-07 | MEDIA | backend + database | Dos modelos de datos en paralelo (enum `user_role` frente a tablas `roles`/`permissions`; `transport_modes` frente a `emission_factors`). La migración 0001 no coincide con `DATABASE.md`. (= SEC-08) |
| INT-08 | MEDIA | backend | Códigos de error en minúsculas, fuera del contrato. (= SEC-07) |
| INT-09 | BAJA | mobile | `tsc`: falta el tipo de `process` (`EXPO_PUBLIC_*`; añadir `expo-env.d.ts`/`@types/node`) y hay un tipo de `ref` incompatible en `TextField.tsx:46`. Archivo vacío duplicado `src/lib/secureStorage.ts` junto a `secure-storage.ts`. |
| INT-10 | BAJA | mobile | El perfil EAS `production` no tiene URL de API. (= SEC-06) |
| INT-11 | INFO | architect | La raíz no tiene script `test` ni workflow de CI que ejecute `pytest`, `tsc` y las migraciones desde cero (etapa 5). |

## Tests entregados por QA

`tests/e2e/api/`: batería de caja negra HTTP contra el contrato (114 casos; no importa código de la API).

| Archivo | Cubre |
|---|---|
| `test_auth.py` | registro, normalización de email, duplicados, política de contraseñas, asignación masiva, enumeración, inyección en login, claims JWT, tokens alterados/alg=none, confusión access↔refresh, rotación + reutilización → revocación de familia, independencia de familias, logout, cambio de contraseña (revoca todos los refresh), recuperación (xfail: fuera de contrato) |
| `test_authz_admin.py` | USER/anónimo → /admin, ADMIN → acciones SUPER_ADMIN, escalada vía `PATCH /users/me`, ADMIN no toca a ADMIN/SUPER_ADMIN, nadie se modifica a sí mismo, desactivación y degradación efectivas al instante, auditoría sin secretos, último SUPER_ADMIN, inyección en `q` |
| `test_trips.py` | contrato de `Trip`, CO₂ y distancia calculados en servidor, campos de cliente rechazados, idempotencia, IDOR (leer/borrar/listar), indistinguibilidad ajeno/inexistente, admin sin trazas, validación GeoJSON, 10 001 puntos, cuerpo > 1 MB, inyección en query, estimate |
| `test_map_stats.py` | GeoJSON `[lng,lat]`, bbox obligatorio/grande/malformado/inyección, límites, XSS almacenado servido como JSON con nosniff, borrado lógico de POI, stats propias, k-anonimato de ciudad |
| `test_hardening.py` | contrato de `/health`, cabeceras, formato de error en 404/405/JSON inválido, sin eco de la contraseña en 422, CORS, rate limit y `X-Forwarded-For` falsificado (opt-in) |

### Ejecución

```bash
python -m venv .venv-e2e && .venv-e2e/bin/pip install -r tests/e2e/api/requirements.txt
npm run infra:up   # con .env de desarrollo (valores de prueba)
E2E_SUPERADMIN_EMAIL=… E2E_SUPERADMIN_PASSWORD=… E2E_REQUIRE_API=1 \
  .venv-e2e/bin/pytest -c tests/e2e/api/pytest.ini tests/e2e/api
```

Resultado actual: **114 omitidos** (la API no arranca: `app/main.py` todavía no existe). Lint de la batería: ruff ✅.

## Próxima revisión

Cuando backend y web terminen su turno: `alembic upgrade head` desde cero en PostGIS limpio,
`docker compose up`, la batería E2E completa, `next build`, `tsc` en mobile, ZAP baseline y
Playwright (smoke de login → mis viajes → logout) una vez existan las páginas `/login` y `/viajes`.
