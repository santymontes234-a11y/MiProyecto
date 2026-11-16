# Seguridad — EcoMove Querétaro

> Propiedad del agente **architect**. Implementación: `apps/api/app/core/security.py`,
> `apps/api/app/services/auth.py`, `apps/api/app/core/deps.py`.

## 1. Autenticación (JWT)

| Parámetro | Valor |
|---|---|
| Algoritmo | HS256 (`JWT_SECRET_KEY` ≥ 64 bytes aleatorios, solo por variable de entorno) |
| Access token | 15 min. Claims: `sub` (user id), `role`, `type="access"`, `iat`, `exp`, `jti` |
| Refresh token | 30 días. Claims: `sub`, `type="refresh"`, `jti`, `fam` (familia), `iat`, `exp` |
| Almacenamiento servidor | Tabla `refresh_tokens`: solo el **hash SHA-256** del token, `family_id`, `expires_at`, `revoked_at`, `replaced_by_id` |

### Rotación y detección de reutilización

1. `POST /auth/refresh` valida firma, `type=refresh`, existencia del hash y que no esté revocado.
2. Emite un nuevo par; el refresh anterior queda `revoked_at=now`, `replaced_by_id=<nuevo>`.
3. Si llega un refresh **ya revocado** → se revoca **toda la familia** (`family_id`) y se responde
   `401 TOKEN_INVALID`: indica robo probable.
4. `POST /auth/logout` revoca el refresh enviado. Cambio de contraseña o desactivación del usuario
   revocan todos los refresh del usuario.

### Contraseñas

- Hash **Argon2id** (`argon2-cffi`, `PasswordHasher` con parámetros por defecto; `check_needs_rehash`
  al iniciar sesión para actualizar parámetros). Decisión del usuario, 2026-11-15; sustituye a bcrypt.
  No hay hashes heredados, así que no hace falta verificar bcrypt.
- Política: ≥ 8 caracteres, al menos una letra y un número, máx. 128.
- Respuesta de login genérica (`INVALID_CREDENTIALS`) sin revelar si el email existe.
- Verificación contra un hash ficticio cuando el usuario no existe (tiempo de respuesta constante).

### Contrato 1.1 — cuenta

- **Bloqueo:** 5 fallos seguidos → 15 min (`429` + `Retry-After`); límite adicional por email
  (10/15 min) aplicado también a emails inexistentes.
- **`token_version`** en `users`, incluido como claim en el access token: `logout-all`, cambio o
  restablecimiento de contraseña y desactivación lo incrementan, invalidando al instante los access
  tokens ya emitidos.
- **Tokens de un solo uso** (reset 30 min, verificación 48 h): ≥ 256 bits, solo hash SHA-256 en BD,
  un solo uso; pedir uno nuevo invalida el anterior. Respuestas `202` uniformes.
- **`route_token`** (`/routes`): HMAC-SHA256 con clave propia (`ROUTE_TOKEN_SECRET`) sobre
  `(geometría normalizada, mode, exp)`; caduca a las 24 h.
- **Correo:** SMTP por variables de entorno; en desarrollo, Mailpit. Nunca se registran tokens en logs.

## 2. Autorización (RBAC)

| Rol | Nivel | Capacidades |
|---|---|---|
| `USER` | 1 | Su perfil, sus viajes, sus estadísticas, mapa y estadísticas públicas |
| `ADMIN` | 2 | + listar/activar/desactivar usuarios `USER`, gestionar POIs, ver resumen global y factores |
| `SUPER_ADMIN` | 3 | + cambiar roles, editar factores de emisión, ver auditoría |

- La autorización se aplica **siempre en el backend** con las dependencias
  `get_current_user`, `require_role(Role.ADMIN)`, `require_role(Role.SUPER_ADMIN)`.
- Los clientes ocultan UI por rol solo como conveniencia.
- Recursos propios (viajes): el filtro `user_id = current_user.id` va en la consulta; acceso ajeno
  devuelve `404` (no `403`) para no revelar existencia.
- El rol del token se revalida contra la BD en cada petición (un usuario degradado o desactivado
  pierde permisos de inmediato, sin esperar a que expire el access token).
- Primer SUPER_ADMIN: creado al arrancar desde `BOOTSTRAP_SUPER_ADMIN_*` solo si no existe ninguno.

## 3. Protección de la API

- CORS: lista blanca `CORS_ORIGINS`; nunca `*` con credenciales.
- Rate limiting (etapa 4, en proxy o `slowapi`): `/auth/*` 10 req/min/IP; resto 120 req/min/usuario.
- Límites de entrada: cuerpo ≤ 1 MB; trazas ≤ 10 000 puntos; `bbox` ≤ 0.5°×0.5°; `page_size` ≤ 100.
- Validación estricta con Pydantic (`extra="forbid"` en entradas).
- SQL solo mediante SQLAlchemy con parámetros enlazados; nada de SQL concatenado.
- Errores 500 sin trazas al cliente; detalle solo en logs.
- Cabeceras (proxy en producción): HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`.

## 4. Clientes

- Mobile: refresh token en `expo-secure-store`; access en memoria; HTTPS obligatorio en producción
  (`usesCleartextTraffic` solo en builds de desarrollo).
- Web: refresh en cookie `HttpOnly; Secure; SameSite=Lax` gestionada por el BFF de sesión
  (ADR-003); sin tokens en `localStorage`; CSP restrictiva (tiles OSM en `img-src`).

## 5. Secretos y datos personales

- Ningún secreto en el repositorio. `.env` está en `.gitignore`; solo `.env.example` con `change-me`.
- En producción: gestor de secretos del proveedor (Docker secrets / variables del orquestador).
- Las trazas GPS son datos personales sensibles (LFPDPPP, México): solo el dueño y procesos de
  agregación anónima las leen; los administradores ven agregados, **nunca trazas individuales**.
- Borrado de cuenta (`DELETE /users/me`, 1.1): elimina trazas, tokens, logros, preferencias y
  notificaciones; los reportes ciudadanos quedan sin `reporter_id`. Exportación: `GET /users/me/export`.
- **Ranking:** solo usuarios con `ranking_opt_in = true` (por defecto `false`), con `display_name`
  generado (nombre + inicial). Nunca email ni nombre completo.
- **Analítica y reportes:** k-anonimato (`min_users` ≥ 3 por celda/zona/flujo; ≥ 10 viajes en
  indicadores de ciudad), sin trazas ni `user_id`; datos DEMO nunca mezclados con oficiales.
- **Reportes ciudadanos:** el listado admin no expone email ni nombre; la ubicación es la que el
  ciudadano elige reportar (no su posición GPS automática).
- Logs sin contraseñas, tokens ni coordenadas.

## 6. Auditoría

Toda acción administrativa que modifica datos escribe en `audit_logs` (actor, acción, entidad,
payload sin secretos). Solo SUPER_ADMIN puede consultarla.
