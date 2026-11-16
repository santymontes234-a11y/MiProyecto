# Metodología de CO₂ — analítica geoespacial

> Ámbito: cómo `/admin/analytics/*` presenta las emisiones. El **cálculo por viaje** es único y vive en
> `app/services/co2.py` (ADR-002, ARCHITECTURE.md §6). Este documento no lo modifica.

## 1. Qué es una estimación aquí

Todas las cifras de CO₂ son **estimaciones** obtenidas multiplicando distancias por factores de
emisión promedio. No se mide nada: no hay sensores, telemetría de vehículos ni consumo real.
Por eso cada respuesta lleva `meta.is_estimate = true` y las interfaces deben mostrarlas redondeadas
y con la leyenda "estimado".

## 2. Unidades

| Magnitud | Unidad | Campo |
|---|---|---|
| Emisiones | gramos de CO₂ (g) | `*_g` |
| Distancia | metros (`*_m`) o pasajero-km (`passenger_km`) | |
| Factor | g CO₂ por pasajero-km | `emission_factors.grams_per_km`, `trips.emission_factor_g_per_km` |

Los factores de `emission_factors` son **por pasajero-km** (DATABASE.md §4). Un viaje registrado
representa a una persona, así que su distancia equivale a pasajero-km.

## 3. Origen de los datos

1. Al crear un viaje, `services/co2.py` guarda `emission_factor_g_per_km` (el factor vigente del
   modo), `co2_emitted_g = km × factor(modo)` y `co2_saved_g = max(0, km × (factor(CAR) − factor(modo)))`.
2. La analítica **suma esos valores guardados**. Nunca vuelve a leer los factores vigentes, así que los
   históricos no cambian cuando SUPER_ADMIN actualiza un factor.

## 4. Cuatro magnitudes diferenciadas

| Magnitud | Definición | Notas |
|---|---|---|
| **Emisión del auto de referencia** (`reference_car_g`) | `co2_emitted_g + co2_saved_g` | Igual a `km × factor(CAR)` del momento del viaje. Es exacta mientras factor(modo) ≤ factor(CAR). Si un factor lo supera, `co2_saved_g` se recorta a 0 y este valor se subestima: se cuenta en `clamped_trips` |
| **Emisión del medio elegido** (`mode_g`) | `co2_emitted_g` | Atribuida a quien viaja |
| **Emisiones evitadas** (`avoided_g`) | `co2_saved_g` | ≥ 0 por contrato. Contrafactual: *si el viaje se hubiera hecho en auto* |
| **Emisión por pasajero** (`per_passenger_km_g`) | `mode_g / passenger_km` | Coincide con el factor promedio aplicado |
| *Estimación del vehículo* (`vehicle_g_estimate`) | `mode_g × ocupación supuesta` | Solo modos privados (CAR, MOTORCYCLE, CARPOOL, E_SCOOTER). `null` en transporte colectivo: el autobús circula con o sin la persona usuaria, así que su emisión total no es atribuible |

## 5. Supuestos configurables

`app/services/geo_analytics/config/co2_assumptions.json` (versionado, **sin factores de emisión**):

- `vehicle_occupancy`: CAR = 1 y CARPOOL = 3, coherentes con las notas de los factores semilla
  ("automóvil gasolina, 1 ocupante"; "automóvil / 3 ocupantes"). Si SUPER_ADMIN cambia esos factores,
  hay que revisar estas ocupaciones.
- `baseline_occupancy_scenarios` (1.0, 1.2, 1.5): análisis de **sensibilidad** del contrafactual. El
  factor de CAR supone un ocupante; si el auto alternativo llevara *o* personas, cada pasajero-km
  emitiría `reference_car_g / o`, y lo evitado sería `max(0, reference_car_g / o − mode_g)`. Son
  escenarios, no estadísticas de ocupación de Querétaro.

## 6. Limitaciones y sesgos conocidos

- **Contrafactual fuerte:** se asume que todo viaje sostenible sustituye a un viaje en auto. Quien
  ya caminaba o no tiene auto no "evita" emisiones reales; la cifra es un máximo teórico, y por eso se
  incluyen los escenarios de sensibilidad.
- **Solo operación (tank-to-wheel o red eléctrica):** no incluye fabricación de vehículos e
  infraestructura ni combustible upstream, salvo que los factores cargados digan lo contrario.
- **Factores promedio:** no distinguen tecnología vehicular, congestión, pendiente ni ocupación real
  del autobús.
- **Distancia:** sale de la traza GPS (`ST_Length(route::geography)`); los errores de GPS se propagan.
- **Representatividad:** solo cuenta a quienes usan la app; no es un inventario de emisiones de la
  ciudad.

## 7. Cómo comunicarlo

- Decir "CO₂ evitado **estimado**", con unidades (kg o t) y redondeo razonable (≤ 3 cifras significativas).
- Mostrar el periodo, el dataset (`official`/`demo`) y la nota de supuestos (`/admin/analytics/co2-methodology`).
- Nunca presentar datos `dataset=demo` como resultados.
