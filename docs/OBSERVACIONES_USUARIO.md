# Observaciones del usuario sobre el APK (2026-11-16)

> Estado: **asignadas el 2026-11-16** (contrato 1.2.0). O3 = 404 de `/trips/estimate/batch` (ruta 1.1 aún no implementada).
> Cuando avise, el architect las asigna (dueño sugerido entre paréntesis).

| # | Observación | Dueño sugerido | Notas para la implementación |
|---|---|---|---|
| O1 | El diseño general de la app gusta; **el mapa se ve feo**. Pide un estilo más parecido a Google Maps. | mobile (+ geo para capas) | Sin Google: mantener OSM (ADR-005), pero cambiar tiles por un estilo vectorial/raster más limpio con atribución (p. ej. CARTO Voyager / Positron, o MapLibre con estilo OSM). Revisar marcadores, colores de capas y controles. Aplicar igual en web por paridad. |
| O2 | **Buscar origen y destino por nombre** (ej. origen «UPQ», destino «Corregidora») en lugar de solo tocar el mapa. | mobile + backend | Geocodificación: Nominatim (OSM) vía backend (endpoint nuevo en API_CONTRACT, con caché y límite de 1 req/s por política de Nominatim), sesgado al bbox de Querétaro; también buscar en `pois` propios. Requiere actualizar el contrato antes de implementar. |
| O4 | Elegir el **tipo de auto** (SUV, sedán, compacto, etc.) para calcular el CO₂. | backend (rol database) + mobile + web | Factores de emisión por tipo de vehículo en `emission_factors` (o tabla `vehicle_types`), con fuente citada en APA. El cálculo sigue solo en el backend (ADR-002). Cambio de contrato: campo opcional `vehicle_type` en estimate/create de viaje y en preferencias del usuario. |
| O5 | Indicar si **vas acompañado** (número de ocupantes) para ver cuánto CO₂ se ahorra al compartir. | backend + mobile + web | Campo opcional `occupants` (1–8) en el viaje. Las emisiones del auto se dividen entre los ocupantes, y el ahorro se compara contra ir solo en el mismo tipo de auto. Revisar la relación con el modo `CARPOOL` existente y actualizar la fórmula en API_CONTRACT y DATABASE. |
| O3 | En **«Impacto estimado»** aparece el error «No encontramos lo que buscabas». | mobile + backend | Probable 404/ruta incorrecta al llamar `POST /trips/estimate` (o parámetros mal formados). Reproducir desde el APK y revisar los logs de la API. |
