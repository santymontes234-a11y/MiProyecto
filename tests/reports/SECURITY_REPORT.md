# Reporte de seguridad — EcoMove Querétaro

> Agente QA/seguridad · Revisión **provisional #1** · 2026-11-15 20:30 CST
> Alcance: snapshot del repositorio mientras backend, web, mobile y database seguían escribiendo.
> Por indicación del architect, los errores de import de `apps/api` (reescritura en curso) **no** se
> reportan todavía. Ningún archivo de producción de otra área fue modificado (AGENTS.md §2.6).

## Escala

| Severidad | Criterio |
|---|---|
| CRÍTICA | Explotable sin autenticación, compromete cuentas o datos de muchos usuarios |
| ALTA | Explotable con condiciones razonables o rompe un control de seguridad documentado |
| MEDIA | Debilita la defensa en profundidad o incumple SECURITY.md sin explotación directa |
| BAJA / INFO | Higiene, deuda técnica, riesgo aceptado |

## Hallazgos abiertos

| ID | Sev. | Área (dueño) | Hallazgo | Recomendación |
|---|---|---|---|---|
| SEC-01 | ALTA | web | **Login CSRF / BFF duplicado.** Conviven dos BFF de sesión: `app/api/session/*` (`lib/bff.ts`, cookie `ecomove_rt`) y `app/api/auth/*` + `app/api/bff/[...path]` + `proxy.ts` (cookies `em_at`/`em_rt`). `POST /api/session/login` y `/api/session/refresh` **no validan Origin ni la cabecera CSRF** (`isCsrfSafe`), y `request.json()` sin `catch` responde 500 con JSON inválido. Un sitio externo puede iniciar sesión a la víctima con la cuenta del atacante (los viajes GPS de la víctima acabarían en la cuenta del atacante). | Dejar un solo BFF. Si se conserva `/api/session/*`, aplicar `isCsrfSafe` y validar el body con zod. Eliminar el otro tras acordarlo con el architect. |
| SEC-02 | MEDIA | web + architect | El access token se guarda en la cookie HttpOnly `em_at`, lo que contradice ADR-003 ("access token solo en memoria"). No es menos seguro (es inaccesible a JS), pero cambia el modelo de amenaza: la autenticación pasa a depender de cookies y, por tanto, del CSRF en **todas** las rutas del BFF. | Registrar un ADR-006 o volver a ADR-003. Si se queda: test que exija `isCsrfSafe` en cada handler mutante. |
| SEC-03 | MEDIA | web | Sin **CSP ni cabeceras de seguridad** en `next.config.ts` (SECURITY.md §4 exige CSP restrictiva con tiles OSM en `img-src`). | `headers()` en `next.config.ts`: CSP (`default-src 'self'; img-src 'self' data: https://tile.openstreetmap.org`…), `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`. |
| SEC-04 | MEDIA | web | Variables de entorno incoherentes: `env.server.ts` y `proxy.ts` usan `API_BASE_URL`; `lib/bff.ts` y `apps/web/.env.example` usan `API_INTERNAL_BASE_URL`. En producción `serverEnv.apiBaseUrl` lanza una excepción (variable no documentada) y `proxy.ts` cae silenciosamente a `http://localhost:8000`. | Una sola variable, documentada en `.env.example`. Sin valores por defecto en producción. |
| SEC-05 | MEDIA | web | `proxy.ts` protege `/app` y `/admin`, pero el área privada real es `/viajes` (grupo `(private)`) y las páginas `/app`, `/login` y `/registro` no existen. La API sigue autorizando (no hay fuga de datos), pero la UI privada se renderiza sin sesión y los redirects terminan en 404. | Alinear el matcher con las rutas reales. Prueba E2E de redirección. |
| SEC-06 | MEDIA | mobile | El perfil `production` de `eas.json` no define `EXPO_PUBLIC_API_BASE_URL`, así que el build de producción usa el valor por defecto `http://10.0.2.2:8000` (HTTP en claro). `config.ts` solo emite `console.warn`. | Definir la URL HTTPS en el perfil `production` y lanzar un error (no un warn) si `!__DEV__ && http://`. |
| SEC-07 | MEDIA | backend (diseño) | Códigos de error en minúsculas (`invalid_token`, `account_inactive`, `session_revoked`, `rate_limited`) fuera del contrato (`TOKEN_INVALID`, `USER_INACTIVE`, `RATE_LIMITED`). Un usuario inactivo recibe 401, cuando el contrato dice `403 USER_INACTIVE`. El 429 del middleware añade `request_id` fuera de `error` y omite `details`. Los clientes que ramifican por `code` fallarán. | Usar los códigos del contrato §0. Cubierto por `tests/e2e/api` (`assert_error` exige UPPER_SNAKE_CASE). |
| SEC-08 | MEDIA | database + architect | Esquema divergente: la migración `0001` crea `roles`, `permissions`, `role_permissions`, `transport_modes`, `achievements`, `reports` y `user_tokens`, mientras que `DATABASE.md` define el enum `user_role` y `emission_factors` por modo. Conviven `models/user.py` (enum) y `models/rbac.py` (tabla). Si el rol pasa a ser FK editable, hace falta revisar la escalada de privilegios a nivel de BD (quién escribe en `role_permissions`). | Decidir con la propuesta `backend-auth-account-admin-extensions` §8 antes de cerrar la etapa 1. |
| SEC-09 | MEDIA | devops/backend | El `Dockerfile` instala `.[dev]` (pytest, ruff, mypy) en la imagen de ejecución, y `pip install … \|\| true` oculta fallos de instalación. `alembic upgrade head` en el `CMD` entra en carrera con varias réplicas. | Multi-stage: instalar solo dependencias de runtime, sin `\|\| true`, y migrar en un job separado. |
| SEC-10 | BAJA | backend | El rate limit es en memoria por proceso (documentado en `rate_limit.py`). Con N réplicas, el límite efectivo es N×. | Usar Redis antes de escalar horizontalmente (ARCHITECTURE §10). |
| SEC-11 | BAJA | shared | `client.parse()` hace `JSON.parse` sin `try`: un 502 en HTML del proxy lanza `SyntaxError` en vez de `ApiError`, y mobile trata ese error como "transitorio" (correcto por casualidad), pero web no. | Envolver en `try` y lanzar `ApiError(status, 'INTERNAL_ERROR')`. |
| SEC-12 | BAJA | deps | `npm audit`: 3 avisos moderados (`minimatch` vía `@expo/fingerprint`, tooling de build, GHSA-g3hv-75wg-m249). La corrección propuesta degrada Expo a la v52 (rompe). | Riesgo aceptado (solo dev/build); revisar en la próxima versión de Expo. |
| SEC-13 | INFO | backend | bandit: B101 (`assert`) en `schemas/catalog.py:12`; se elimina con `python -O`. | Sustituir por `raise`. |
| SEC-14 | INFO | todos | Recuperación de contraseña fuera del contrato 1.0.0 (propuesta pendiente); mobile ya tiene la pantalla `(auth)/forgot-password.tsx`. | No exponer la pantalla hasta que se apruebe el contrato. Prueba `xfail` preparada. |

## Controles verificados (OK)

- **(d) Tokens en cliente:** sin `localStorage`, `sessionStorage` ni `AsyncStorage` en web, mobile y shared. Mobile guarda el refresh en `expo-secure-store` (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`) y el access solo en memoria, con refresh *single-flight* que evita disparar la detección de reutilización.
- **(e) Secretos:** ningún secreto ni JWT literal en el repositorio. `.gitignore` cubre `.env*`, `*.pem` y `*.key`. El compose exige las variables (`:?`) y publica puertos solo en `127.0.0.1`. `config.py` rechaza claves < 32 caracteres y `change-me` en producción.
- **WebView del mapa (mobile):** CSP propia, `escapeHtml` en tooltips, navegación limitada a `about:blank`/`data:` y mensajes serializados con `JSON.stringify`.
- **BFF genérico web:** lista blanca de segmentos (sin path traversal), `auth/*` bloqueado, límite de 1 MB, CSRF por cabecera personalizada + Origin. El redirect `?next=` está saneado contra open redirect.
- **Logs (backend):** formateador JSON con redacción de claves sensibles, JWT y Bearer; access log de uvicorn desactivado (evita registrar querystrings).
- **semgrep** (`p/python`, `p/typescript`, `p/secrets`, `p/jwt`; 261 reglas): 0 hallazgos. **pip-audit:** 0 vulnerabilidades.

## Pendiente de verificar en caliente (requiere API en ejecución)

Batería `tests/e2e/api` (114 casos), lista para ejecutarse en cuanto `/api/v1/health` responda:
rotación de refresh y revocación de familia (a), IDOR → 404 (b), reglas de `/admin` y ≥1 SUPER_ADMIN (c),
límites de bbox, trazas y cuerpo (f), inyección SQL en query/body, enumeración en login, contraseñas
débiles, asignación masiva de `role`, alg=none/firma alterada, CORS y rate limit.

OWASP ZAP: no instalado (requiere Java). Se ejecutará contra el entorno Docker local cuando la API arranque.
