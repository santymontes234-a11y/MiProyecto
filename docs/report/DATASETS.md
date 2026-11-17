# Datasets de EcoMove Querétaro

> Requisito R2 del proyecto ABD. Autor: módulo geo. Fecha de revisión: 16 de noviembre de 2026.
> Regla del proyecto: solo se usan datos reales cuando están disponibles y su licencia lo permite.
> Los datos de prueba se marcan como DEMO y nunca se mezclan con los oficiales. No se inventan estadísticas de Querétaro.

## 1. Resumen

| # | Dataset | Institución | Corte de los datos | Licencia | Destino en la BD | Estado |
|---|---|---|---|---|---|---|
| D1 | Marco Geoestadístico 2020, Querétaro (AGEB urbanas y municipios) | INEGI | Censo 2020 (referencia 15/03/2020) | Términos de libre uso de la información del INEGI | `geo.mobility_zones` (`source = 'INEGI-MG-2020'`) | Cargado: 18 municipios y 889 AGEB urbanas |
| D2 | Censo de Población y Vivienda 2020, resultados por AGEB y manzana urbana, Querétaro | INEGI | 15/03/2020 (archivo modificado el 26/07/2021) | Términos de libre uso de la información del INEGI | `geo.zone_census` (`source = 'INEGI-CPV-2020'`) | Cargado: 907 filas (18 municipios y 889 AGEB) |
| D3 | OpenStreetMap: ciclovías y POIs de movilidad de la ZM de Querétaro | Fundación OpenStreetMap y colaboradores | Extracción por Overpass API del 16/11/2026 | ODbL 1.0 | `cycleways`, `pois` (y desde la migración 0006, `transit_stops` y `bike_stations`) | Cargado: 924 ciclovías y 1 037 POIs |
| D4 | Rendimiento real de vehículos ligeros por tipo (Automotive Trends Report) | U.S. EPA | Año modelo 2024 (informe de febrero de 2026) | Dominio público (gobierno de EE. UU.) | `vehicle_types.grams_per_km` (Backend, migraciones 0007 y 0008) | Aplicado en la 0008; ver §5 |
| D5 | Factores de emisión por modo (DATABASE.md §4) | Sin fuente oficial trazable | — | — | `emission_factors` | **Pendiente de fuente oficial**; ver §6 |
| D6 | Encuesta origen-destino o datos de operación del transporte público (IQT / Qrobús) | Gobierno del Estado de Querétaro | — | — | — | **No obtenido**; ver §7 |

## 2. D1. Marco Geoestadístico 2020 (INEGI)

- **Producto:** Marco Geoestadístico, Censo de Población y Vivienda 2020, entidad 22 (Querétaro).
- **URL de descarga:** https://www.inegi.org.mx/contenidos/productos/prod_serv/contenidos/espanol/bvinegi/productos/geografia/marcogeo/889463807469/22_queretaro.zip (65.8 MB; SHA-256 `16a8a4cc798e10dc0f404083293c7ccd2a9b306d7b7228d782f68fe1d08f5238`).
- **Capas usadas:** `22mun` (áreas geoestadísticas municipales) y `22a` (AGEB urbanas). Los archivos vienen en shapefile, con la proyección MEXICO_ITRF_2008_LCC (EPSG:6372) y la codificación ISO-8859-1.
- **Campos usados:** `CVEGEO` (clave geoestadística), `CVE_ENT`, `CVE_MUN`, `CVE_LOC`, `CVE_AGEB` y `NOMGEO` (nombre del municipio).
- **Carga:** `python -m app.services.geo_analytics.inegi_import --mg <carpeta> --censo <csv>`:
  - Lee el shapefile sin dependencias externas.
  - Reconstruye cada polígono con `ST_BuildArea`, que respeta los huecos.
  - Lo valida con `ST_MakeValid`, lo transforma a EPSG:4326 y hace un upsert por `code = CVEGEO`.
  - Asigna `kind` = `municipio` o `ageb`. `is_demo` siempre es falso.
  - Resultado: 907 polígonos, todos válidos (`ST_IsValid`).
- **Limitación:** las AGEB rurales (capa `22ar`) no se cargaron, porque el análisis es urbano.

**Referencia (APA 7):**
Instituto Nacional de Estadística y Geografía. (2021). *Marco Geoestadístico. Censo de Población y Vivienda 2020: Querétaro* [Conjunto de datos]. INEGI. https://www.inegi.org.mx/temas/mg/

## 3. D2. Censo de Población y Vivienda 2020 por AGEB urbana (INEGI)

- **Producto:** *Principales resultados por AGEB y manzana urbana del Censo de Población y Vivienda 2020*, Querétaro (identificador MEX-INEGI.ESD2.01-CPV-2020).
- **URL de descarga:** https://www.inegi.org.mx/contenidos/programas/ccpv/2020/datosabiertos/ageb_manzana/ageb_mza_urbana_22_cpv2020_csv.zip (4.5 MB; SHA-256 `74c373a5cbf4cb3dd52f4d0b0b1f8e221c3f124a63ff188d5c81dffb178828b4`).
- **Fecha de referencia:** 15 de marzo de 2020. El conjunto se modificó por última vez el 26 de julio de 2021.
- **Campos usados:**

  | Campo | Significado |
  |---|---|
  | `POBTOT` | Población total |
  | `TVIVPARHAB` | Viviendas particulares habitadas |
  | `VPH_AUTOM` | Viviendas con automóvil o camioneta |
  | `VPH_MOTO` | Viviendas con motocicleta o motoneta |
  | `VPH_BICI` | Viviendas con bicicleta como medio de transporte |

- **Filas cargadas:** los totales por AGEB (`MZA = 000`, `AGEB ≠ 0000`) y por municipio (`LOC = 0000`, `AGEB = 0000`). La clave de unión es `ENTIDAD‖MUN‖LOC‖AGEB` = `CVEGEO`.
- **Confidencialidad:** el INEGI publica «*» o «N/D» en celdas protegidas por el principio de confidencialidad. Se cargan como NULL, nunca como 0.
- **Control de calidad:** la suma de `POBTOT` de los 18 municipios es 2 368 467, igual al total estatal que publica el propio archivo.
- **Tabla:** `geo.zone_census` (`db/geo/004_census.sql`). La crea la migración 0008 de Backend (copia congelada en `alembic/sql/0008_zone_census.sql`).

**Referencia (APA 7):**
Instituto Nacional de Estadística y Geografía. (2021). *Principales resultados por AGEB y manzana urbana del Censo de Población y Vivienda 2020: Querétaro* [Conjunto de datos]. INEGI. https://www.inegi.org.mx/programas/ccpv/2020/#Datos_abiertos

## 4. D3. OpenStreetMap (Overpass API)

- **Fuente:** OpenStreetMap, consultado con Overpass API (https://overpass-api.de/api/interpreter).
- **Extracción:** 16 de noviembre de 2026, en el bbox (-100.62, 20.40) – (-100.15, 20.85), que abarca la zona metropolitana de Querétaro.
- **Capas:**
  - **Ciclovías:** `highway=cycleway`, `path`/`footway` con `bicycle=designated` y vías con carril `cycleway[:both|:left|:right]`. Se cargaron 924 tramos, unos 276 km, de los cuales 402 tramos son confinados.
  - **POIs:**

    | Categoría | Cantidad |
    |---|---|
    | `BUS_STOP` | 890 |
    | `BIKE_PARKING` | 89 |
    | `BIKE_SHARING` | 41 |
    | `REPAIR_STATION` | 11 |
    | `EV_CHARGER` | 6 |

- **Campos usados:**
  - Geometría.
  - `osm_id` y tipo de objeto.
  - `name`.
  - `ref`: se guarda en `attributes.ref` y nunca en `code` (contrato 1.1.1 §5.1).
  - `capacity`.
  - Etiquetas de segregación de la ciclovía, que alimentan `is_protected`.
- **Carga:** `python -m app.services.geo_analytics.osm_import`:
  - Es idempotente: hace upsert por `osm_id`.
  - Con `--prune` retira lo que ya no está en OSM.
  - No toca los POIs capturados por administradores.
  - Desde la migración 0006, separa los atributos especializados hacia `transit_stops` y `bike_stations`.
- **Atribución obligatoria:** «© OpenStreetMap contributors». La web y el móvil la muestran en el mapa.
- **Sesgos conocidos:**
  - OSM es colaborativo. Su cobertura de paradas y ciclovías es desigual entre zonas y puede no coincidir con el inventario oficial.
  - 890 paradas no equivalen a la red completa de Qrobús, cuya cifra oficial no se obtuvo.
  - Fuera del bbox no hay datos, por eso el análisis se limita a las AGEB contenidas en él.

**Referencia (APA 7):**
OpenStreetMap contributors. (2026). *OpenStreetMap* [Conjunto de datos; extracción del 16 de noviembre de 2026 vía Overpass API]. OpenStreetMap Foundation. https://www.openstreetmap.org. Disponible bajo la Open Database License 1.0.

## 5. D4. Factores por tipo de automóvil (observación O4)

**Fuente verificada:** EPA (2026), *2025 EPA Automotive Trends Report* (EPA-420-R-26-001), tabla de producción y rendimiento por tipo de vehículo (año modelo 2024, rendimiento real estimado, sin vehículos eléctricos ni híbridos enchufables).

**Conversión:**
- g CO₂/km = 8 887 g CO₂ por galón de gasolina ÷ mpg ÷ 1.609 km/mi.
- 8 887 g/galón es el factor de combustión de la gasolina que usa la EPA (2023).

| Tipo EPA (MY 2024) | mpg sin BEV/PHEV | g CO₂/mi | **g CO₂/km** | `vehicle_type` | Valor anterior (0007) |
|---|---|---|---|---|---|
| Sedan/Wagon | 31.7 | 280 | **174** | `SEDAN` | 192 |
| Car SUV | 30.2 | 294 | **183** | `SUV` (crossover compacto) | — |
| Truck SUV | 24.7 | 360 | **224** | `SUV` | 250 |
| Minivan/Van | 25.5 | 349 | **217** | `MINIVAN` | 230 |
| Pickup | 20.3 | 438 | **272** | `PICKUP` | 290 |
| Flota total (con BEV/PHEV) | 27.2 | 327 | 203 | referencia | — |

**Valores que el informe de la EPA no trae por tipo:**
- `COMPACT` (150 g/km) y `HYBRID` (110 g/km) no tienen cifra por tipo en el informe.
- `ELECTRIC` (75 g/km) depende del factor de la red eléctrica mexicana. No se pudo leer en gob.mx el documento vigente de la CRE/SEMARNAT, así que el valor queda **pendiente de verificación**.

Backend aplicó estos valores en la migración 0008: SEDAN 174, SUV 224, MINIVAN 217 y PICKUP 272 g CO₂/km. COMPACT y HYBRID quedan como estimación propia y ELECTRIC, pendiente de verificar (NORMALIZACION.md §6).

**Limitaciones:**
- Son promedios del mercado de EE. UU.: la flota mexicana es distinta en tamaño, antigüedad y mantenimiento.
- No son mediciones del vehículo del usuario.
- EcoMove presenta el CO₂ como **estimación** (ver `apps/api/docs/geo/CO2_METHODOLOGY.md`).

**Referencias (APA 7):**
U.S. Environmental Protection Agency. (2026). *The 2025 EPA automotive trends report: Greenhouse gas emissions, fuel economy, and technology since 1975* (EPA-420-R-26-001). https://www.epa.gov/automotive-trends

U.S. Environmental Protection Agency. (2023). *Greenhouse gas emissions from a typical passenger vehicle* (EPA-420-F-23-014). https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle

> La migración 0007 citaba la edición 2023 (EPA-420-R-23-033); la 0008 la sustituye por la edición vigente.

## 6. D5. Factores de emisión por modo (`emission_factors`)

La tabla tiene estos valores, en g CO₂/km por pasajero:

| Modo | g CO₂/km |
|---|---|
| WALK | 0 |
| BICYCLE | 0 |
| E_SCOOTER | 25 |
| BUS | 68 |
| CARPOOL | 64 |
| MOTORCYCLE | 103 |
| CAR | 192 |

**Estado de la fuente:**
- DATABASE.md §4 los marca como «valores iniciales para desarrollo».
- **No tienen una fuente oficial trazable.** No se encontró, ni se pudo leer, una publicación del INECC o la SEMARNAT con factores por modo para Querétaro.
- Por eso el informe debe presentarlos como supuestos del prototipo, no como datos oficiales.

**Tarea abierta:** sustituir los valores con una fuente citable. Opciones:
- Inventario o factores del INECC.
- Factores del autobús urbano de la operadora.
- `CAR` = sedán EPA (174 g/km), por coherencia con §5.

## 7. Datos no obtenidos

| Dato buscado | Resultado | Consecuencia |
|---|---|---|
| Encuesta origen-destino de la ZM de Querétaro (IQT) | No se encontró una versión descargable con licencia de uso | No hay demanda observada fuera de la app; el índice de prioridad usa solo los viajes registrados en EcoMove |
| Red, paradas y frecuencias oficiales de Qrobús (GTFS) | No se encontró un GTFS público | Las paradas vienen de OSM y pueden estar incompletas |
| Inventario oficial de ciclovías del municipio | No se obtuvo | Las ciclovías vienen de OSM |
| Factor de emisión del Sistema Eléctrico Nacional (CRE/SEMARNAT) vigente | La página de gob.mx consultada no enlaza el documento | El factor de `ELECTRIC` y de `E_SCOOTER` queda pendiente de fuente |

## 8. Datos DEMO

- `geo.seed_demo(n)` genera viajes sintéticos solo en `geo.demo_*` y zonas con `source = 'DEMO'`.
- La API los sirve únicamente con `dataset=demo` y la UI los marca con la insignia DEMO.
- **Ninguna cifra de este documento ni de ANALISIS_DATOS.md proviene de datos DEMO.**
