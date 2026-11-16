# Ruteo origen→destino y origen del viaje (`source`)
- **Autor (agente):** mobile
- **Estado:** Aprobada con cambios en API_CONTRACT 1.1.0 (2026-11-16): `/routes?origin=&destination=&mode=` (no `from`/`to`); `route_token` firmado en vez de `route_hash`; `POST /trips/estimate/batch` aprobado; E_SCOOTER usa perfil bicycle y MOTORCYCLE car.
- **Afecta a:** API_CONTRACT §4 (y nuevo §4.1 `/routes`), apps/api, packages/shared, apps/web

## Motivación

La app móvil deja elegir origen y destino en el mapa antes de viajar. Con el contrato v1.0:

- No hay forma de obtener una ruta realista: la previsualización usa la distancia en línea recta,
  que subestima la distancia real entre un 20 % y un 40 % en la traza urbana de Querétaro.
- Los clientes no pueden llamar a OSRM o Nominatim directamente: ARCHITECTURE §2 solo permite tiles OSM.
- No se puede distinguir un viaje grabado con GPS de uno planificado, por lo que v1 prohíbe subir
  viajes sin GPS (decisión del architect, 2026-11-15).

## Cambio propuesto

### (a) `GET /routes` — rol `USER`

Query: `from=lng,lat`, `to=lng,lat`, `mode=TransportMode`.

```jsonc
// 200 RouteResponse
{
  "mode": "BICYCLE",
  "distance_m": 4830,
  "duration_s": 1140,
  "route": { "type": "LineString", "coordinates": [[-100.3899, 20.5888], [-100.3801, 20.5932]] },
  "provider": "osrm"        // informativo
}
```

Errores: `400 BAD_REQUEST` (coordenadas inválidas o fuera de la ZM de Querétaro),
`404 ROUTE_NOT_FOUND`, `503 ROUTING_UNAVAILABLE`.
El backend (o el módulo geoespacial) delega en un OSRM o Valhalla propio con perfiles `foot`,
`bicycle` y `car`. BUS y CARPOOL usan el perfil `car` en v1.

### (b) `source` en `TripCreate`, `Trip` y `TripSummary`

```jsonc
"source": "GPS" | "PLANNED"    // default "GPS" para no romper clientes v1.0
```

- `PLANNED` exige que `route` provenga de `/routes`: el backend guarda `route_hash` y lo valida.
- Las estadísticas oficiales (`/stats/city`, `/admin/stats/overview`) pueden filtrar por `source`.
- Nuevo enum `TripSource` en §0.

### (c) Opcional: estimación por lotes

`POST /trips/estimate/batch` `{ "distance_m": 4830, "modes": ["WALK", "BICYCLE", "BUS", "CARPOOL"] }`
→ `200 TripEstimate[]`. Hoy mobile hace cuatro peticiones en paralelo.

## Impacto en otros agentes

- **backend / geoespacial:** nuevo router `routes`, servicio de ruteo, campo `source` y migración.
- **database:** columna `trips.source` (enum, default `GPS`) y opcionalmente `route_hash`.
- **shared:** tipos `RouteResponse` y `TripSource`, y `client.routes.get()`.
- **web:** mostrar `source` en el detalle del viaje (opcional).
- **mobile:** sustituye la línea recta por la ruta real y habilita «Registrar viaje ya realizado».

## Alternativas consideradas

- Llamar a OSRM o Nominatim públicos desde el cliente: viola ARCHITECTURE §2 y la política de uso de esos servicios.
- Calcular rutas en el dispositivo: aumenta mucho el tamaño del APK y duplica lógica.
