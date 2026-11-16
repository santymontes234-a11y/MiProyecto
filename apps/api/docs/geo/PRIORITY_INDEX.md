# Índice de prioridad de infraestructura (IPI)

> Implementación: `app/services/geo_analytics/priority_index.py` (puntaje) +
> `geo.priority_inputs` en `db/geo/002_functions.sql` (observaciones por celda).
> Ruta propuesta: `GET /admin/analytics/infrastructure-priority`.

## 1. Propósito y alcance

El IPI **ordena celdas candidatas a un estudio técnico** de ciclovías, estaciones de bici/scooter,
paradas de transporte público o infraestructura peatonal. **No determina necesidades.** Una decisión
de infraestructura requiere aforos, seguridad vial, uso del suelo, topografía, participación
ciudadana y viabilidad presupuestal, que este índice no contiene.

## 2. Datos de entrada (por celda cuadrada de `cell_m`, UTM 14N)

| Entrada | Fuente |
|---|---|
| `users`, `trip_ends` | Usuarios distintos y extremos (O + D) de viajes COMPLETED en la celda |
| `bike_like_*`, `walk_*`, `bus_*` | Por modo: extremos (`*_ends`) y rutas que cruzan la celda (`*_route_trips`) |
| `short_car_ends` | Extremos de viajes CAR/MOTORCYCLE < 5 km (demanda potencial; opcional) |
| `dist_bike_lane_m`, `dist_bike_station_m`, `dist_bus_stop_m` | Distancia del centroide a la infraestructura registrada más cercana (`cycleways`, `pois`), búsqueda acotada a 3000 m |

`NULL` en una distancia significa **que la capa está vacía** (no hay datos), no que la
infraestructura esté lejos. En ese caso el componente se excluye y los pesos se renormalizan.

## 3. Cálculo

1. **Normalización de demanda:** rango percentil dentro del área analizada (robusto a valores
   extremos; los empates toman el punto medio). El índice es **relativo** al bbox y al periodo.
2. **Brecha de cobertura:** `0` si `d ≤ ok_m`; `1` si `d ≥ far_m`; lineal entre ambos.
3. **Puntaje:** `score = 100 × Σ wᵢ·cᵢ / Σ wᵢ` sobre los componentes disponibles. Cada celda incluye
   la contribución de cada componente, que suma el puntaje (explicabilidad).
4. **Confianza** por usuarios distintos: `< min_users_for_score` (10) o `< min_trip_ends_for_score` (20)
   → `insuficiente` (sin puntaje); `< 25` baja; `< 75` media; resto alta.
5. **Etiqueta:**
   - `candidata_prioritaria_para_estudio`: score ≥ 70 **y** confianza media o alta;
   - `candidata_para_evaluar`: score ≥ 40;
   - `sin_senal_prioritaria`: resto. Su explicación dice siempre que *un puntaje bajo no implica que la
     infraestructura no sea necesaria*;
   - `datos_insuficientes`: muestra pequeña. No se concluye nada en ningún sentido.

### Pesos por defecto

| Perfil | Componentes (peso) | Brecha `ok_m → far_m` |
|---|---|---|
| `bike_lane` | rutas bici/scooter 0.40 · extremos bici/scooter 0.15 · autos cortos 0.15 · brecha ciclovía 0.30 | 300 → 1500 m |
| `bike_station` | extremos bici/scooter 0.45 · extremos bus 0.15 · autos cortos 0.10 · brecha estación 0.30 | 300 → 1000 m |
| `bus_stop` | extremos bus 0.40 · extremos a pie 0.15 · autos cortos 0.10 · brecha parada 0.35 | 400 → 1200 m |
| `pedestrian` | rutas a pie 0.45 · extremos a pie 0.25 · extremos bus 0.30 | — (no hay capa de banquetas) |

Los umbrales de distancia son **puntos de partida de diseño**, no normas oficiales; ajústalos con el
área de planeación.

## 4. Configuración

`GEO_PRIORITY_CONFIG_PATH` apunta a un JSON que sobrescribe valores por defecto:

```json
{ "version": "ipi-qro-2027.1", "min_users_for_score": 15, "confidence_users": [30, 100],
  "high_score": 75, "medium_score": 45,
  "profiles": { "bike_lane": { "weights": { "short_car": 0 },
                               "gap": { "lane_gap": { "ok_m": 250, "far_m": 1200 } } } } }
```

Validación: pesos ≥ 0; `0 ≤ ok_m < far_m ≤ 3000`. La respuesta expone `config_version` y los pesos
efectivos para que cada resultado sea reproducible.

## 5. Por qué "pocos viajes" no eleva la prioridad

- La demanda pesa entre el 65 % y el 70 % del puntaje (100 % en el perfil peatonal) y suma de forma
  positiva: menos viajes ⇒ menos puntos.
- La brecha de cobertura sola aporta como máximo su peso (30–35 puntos), por debajo del umbral de
  "candidata para evaluar" (40). Una celda sin demanda observada no puede ser prioritaria.
- Con muestra pequeña no hay puntaje (`datos_insuficientes`).

## 6. Sesgos y limitaciones

| Sesgo | Efecto | Mitigación |
|---|---|---|
| **Demanda suprimida** | Donde no hay ciclovía, poca gente se atreve a pedalear: la demanda observada subestima la potencial | Componente opcional de autos cortos; la etiqueta baja nunca se presenta como "no se necesita" |
| **Adopción de la app** | Sobrerrepresenta a personas con smartphone, jóvenes y zonas de mayor ingreso | Mostrar `sample` y `confidence`; cruzar con encuestas origen-destino |
| **Infraestructura incompleta** | Si `cycleways` o `pois` no están completos, la brecha se exagera | Fuente y fecha de cada capa; capa vacía = componente no disponible |
| **Relatividad** | El percentil compara solo dentro del bbox y el periodo | No comparar puntajes entre consultas distintas |
| **Celdas arbitrarias (MAUP)** | El tamaño de celda cambia los resultados | Probar varios `cell_m`; confirmar en zonas administrativas |
| **Privacidad** | Celdas con pocos usuarios podrían reidentificar personas | k-anonimato (`GEO_MIN_USERS`) y umbral de muestra |
| **Sin variables de seguridad, pendiente o red vial** | El índice ignora factores clave | Declarado en `notes` de cada perfil |
