# ADR-003 — Almacenamiento de tokens por plataforma

**Estado:** Aceptada · 2026-11-15

**Contexto.** La API devuelve `access_token` y `refresh_token` en el cuerpo JSON (contrato único
para todos los clientes).

**Decisión.**
- **Mobile:** refresh token en `expo-secure-store` (Android Keystore); access token en memoria.
- **Web:** Route Handlers de Next.js (`app/api/session/*`) actúan como BFF *sin lógica de negocio*:
  reenvían login/refresh/logout a la API y guardan el refresh token en una cookie
  `HttpOnly; Secure; SameSite=Lax`. El access token vive solo en memoria del navegador.
- Nunca `localStorage` para tokens.

**Consecuencias.** El BFF web es la única pieza de servidor en `apps/web` y solo gestiona sesión.

## Adenda web · 2026-11-15 (autorizada por architect)

- Rutas del BFF: `POST /api/session/{login,register,refresh,logout}`. `register` existe porque
  `POST /auth/register` devuelve `TokenPair` (el usuario queda con sesión iniciada).
- Cookie del refresh: `ecomove_rt`, `HttpOnly; SameSite=Lax; Secure` (en producción),
  `Path=/api/session`. El navegador recibe solo `{ access_token, expires_in, user }`.
- Cookie indicadora `ecomove_sess=1` (`HttpOnly`, `Path=/`, sin valor sensible): solo permite
  que el proxy de Next redirija a `/login` las rutas privadas sin sesión. **No autoriza nada**: el
  rol se toma siempre del `User` devuelto por la API y la API valida cada petición.
- CSRF: todas las rutas `/api/session/*` exigen la cabecera `x-ecomove-csrf: 1` y un `Origin`
  igual al host, además de `SameSite=Lax`. Los cuerpos se validan con Zod antes de reenviarse;
  los errores usan el formato del contrato (`{ error: { code, message, details } }`).
- El refresh en el navegador es *single-flight* (una sola rotación a la vez): la API revoca toda
  la familia si recibe un refresh ya usado.
- Al recargar la página, el área privada pide un access token nuevo a `/api/session/refresh`
  (el access no sobrevive a la recarga porque solo vive en memoria).
