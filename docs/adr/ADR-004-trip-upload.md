# ADR-004 — Viajes registrados en el dispositivo y subidos completos

**Estado:** Aceptada · 2026-11-15

**Contexto.** La conectividad móvil es intermitente; enviar puntos GPS en streaming complica la API.

**Decisión.** La app mobile acumula la traza localmente y, al finalizar, envía `POST /trips` con la
geometría completa (`LineString` GeoJSON), `started_at`, `ended_at` y `mode`. El cliente genera un
`client_trip_id` (UUID) que hace la operación idempotente ante reintentos.

**Consecuencias.** La API recalcula distancia y CO₂ en el servidor. Se limita el tamaño de la traza
(máx. 10 000 puntos) para evitar abusos.
