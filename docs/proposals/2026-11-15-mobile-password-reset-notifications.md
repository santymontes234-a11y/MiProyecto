# Recuperación de contraseña y notificaciones in-app
- **Autor (agente):** mobile
- **Estado:** Aprobada e incorporada a API_CONTRACT 1.1.0 (2026-11-16): (a) reset unificado con backend; (b) notificaciones in-app con `unread_count`. Push fuera.
- **Afecta a:** API_CONTRACT §2, §3 y nuevo §9 `/notifications`, apps/api, database, SECURITY.md, packages/shared, apps/web

## Motivación

La app móvil tiene las pantallas «Recuperar contraseña» y «Notificaciones». Hoy la primera explica
que la función aún no está disponible, y la segunda solo gestiona preferencias locales.

## Cambio propuesto

### (a) Recuperación de contraseña (público)

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| POST | `/auth/password-reset/request` | `{ "email": "ana@example.com" }` | `202` **siempre**, exista o no la cuenta (no revela usuarios) |
| POST | `/auth/password-reset/confirm` | `{ "token": "...", "new_password": "..." }` | `204` y revoca todos los refresh |

- El token es de un solo uso, caduca en 30 min y se guarda en la base solo como hash.
  Se entrega por correo con un enlace `ecomove://reset-password?token=...` y su equivalente web.
- Rate limit por IP y por email (`429 RATE_LIMITED`).
- Errores de `confirm`: `400 RESET_TOKEN_INVALID` (caducado, usado o inexistente) y `422 VALIDATION_ERROR`.

### (b) Notificaciones in-app (rol `USER`)

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/notifications` | `page, page_size, unread_only?` → `Paginated<Notification>` |
| POST | `/notifications/{id}/read` | `204` |
| POST | `/notifications/read-all` | `204` |

```jsonc
// Notification
{ "id": "uuid", "type": "ACHIEVEMENT_UNLOCKED" | "WEEKLY_SUMMARY" | "SYSTEM",
  "title": "¡Nuevo logro!", "body": "Desbloqueaste «Primer pedaleo»",
  "data": { "achievement_code": "FIRST_BIKE_TRIP" }, "read_at": null, "created_at": "..." }
```

Push (Expo Notifications / FCM) queda fuera de esta propuesta: requiere `POST /devices` y
credenciales FCM, y se tratará en una propuesta aparte.

## Impacto en otros agentes

- **backend:** servicio de correo (SMTP configurable por `.env`) y routers nuevos.
- **database:** tablas `password_reset_tokens` y `notifications`.
- **shared / web:** tipos y cliente; página web «restablecer contraseña».

## Alternativas consideradas

- Que soporte restablezca contraseñas manualmente: no escala y expone datos personales.
