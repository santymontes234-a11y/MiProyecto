# Análisis de datos e identificación de la necesidad

> Requisito R3 del proyecto ABD. Autor: módulo geo. Fecha de ejecución: 16 de noviembre de 2026, sobre la BD de desarrollo (PostgreSQL 16 + PostGIS 3.4).
> Solo usa datos oficiales o abiertos (ver DATASETS.md); ninguna cifra viene de datos DEMO.
> El SQL completo de cada tabla está en `apps/api/db/geo/queries/consultas_espaciales.sql`, bloque B. `database/03_consultas.sql` remite a ese archivo porque usa las vistas `geo.v_*`.

## 1. Pregunta y método

**Pregunta:** ¿la población urbana de la zona metropolitana de Querétaro tiene acceso cercano a infraestructura de movilidad sostenible (transporte público y ciclovías)? ¿Dónde se concentra la población sin ese acceso?

**Fuentes:**
- Población y equipamiento de las viviendas: INEGI, Censo 2020, por AGEB urbana y municipio.
- Límites: INEGI, Marco Geoestadístico 2020.
- Paradas y ciclovías: OpenStreetMap, extracción del 16/11/2026.

**Área de estudio:** las 608 AGEB urbanas contenidas por completo en el bbox importado de OSM, (-100.62, 20.40) – (-100.15, 20.85).

**Medición:**
- Las distancias y áreas se calculan en UTM 14N (EPSG:32614).
- Umbrales de acceso, usados como criterios de análisis y no como normas oficiales:
  - 400 m a una parada de autobús, unos 5 minutos a pie.
  - 300 m a una ciclovía.
- La población cubierta se estima por **interpolación areal**: población de la AGEB × fracción de su área dentro del buffer.

## 2. Resultados

### Tabla 1. Control de carga del censo (consulta B1)

| Municipios | Población total |
|---|---|
| 18 | 2 368 467 |

Coincide con el total estatal que publica el INEGI en el mismo archivo.

### Tabla 2. Área de estudio por municipio (consulta B2)

| Municipio | AGEB urbanas | Población urbana | Área (km²) | Densidad (hab/km²) |
|---|---|---|---|---|
| Querétaro | 427 | 996 222 | 167.5 | 5 946 |
| Corregidora | 85 | 192 192 | 38.2 | 5 035 |
| El Marqués | 77 | 177 073 | 33.1 | 5 348 |
| Pedro Escobedo | 14 | 27 934 | 5.8 | 4 858 |
| Huimilpan | 3 | 8 095 | 2.4 | 3 361 |
| Colón | 2 | 6 114 | 1.0 | 5 835 |
| **Total** | **608** | **1 407 630** | 248.0 | 5 676 |

Pedro Escobedo, Huimilpan y Colón solo tienen una parte de su territorio dentro del bbox, así que sus cifras no representan al municipio completo. Se muestran para que el análisis sea transparente, pero las conclusiones se centran en Querétaro, Corregidora y El Marqués.

### Tabla 3. Ciclovías por municipio (consulta B3)

| Municipio | Población urbana (área de estudio) | km de ciclovía | km confinados | km por 10 000 hab |
|---|---|---|---|---|
| Querétaro | 996 222 | 158.4 | 79.8 | 1.59 |
| Corregidora | 192 192 | 23.5 | 16.0 | 1.22 |
| El Marqués | 177 073 | 81.4 | 33.1 | 4.60 |
| Pedro Escobedo | 27 934 | 0.0 | 0.0 | 0.00 |
| Huimilpan | 8 095 | 12.5 | 12.5 | 15.50* |
| Colón | 6 114 | 0.0 | 0.0 | 0.00 |

\* Valor inflado: solo 3 AGEB de Huimilpan entran al área de estudio, mientras que sus ciclovías se miden en toda la parte del municipio que está dentro del bbox. Este valor no debe interpretarse.

### Tabla 4. Población urbana con acceso cercano (consulta B4)

| Municipio | Población urbana | A ≤ 400 m de parada | % | A ≤ 300 m de ciclovía | % |
|---|---|---|---|---|---|
| **Área de estudio** | **1 407 630** | **819 611** | **58.2** | **294 062** | **20.9** |
| Querétaro | 996 222 | 662 189 | 66.5 | 226 783 | 22.8 |
| Corregidora | 192 192 | 109 516 | 57.0 | 27 651 | 14.4 |
| El Marqués | 177 073 | 46 753 | 26.4 | 37 805 | 21.4 |
| Pedro Escobedo | 27 934 | 0 | 0.0 | 0 | 0.0 |
| Huimilpan | 8 095 | 1 152 | 14.2 | 1 823 | 22.5 |
| Colón | 6 114 | 0 | 0.0 | 0 | 0.0 |

En Pedro Escobedo y Colón los ceros reflejan probablemente que faltan datos en OSM, no que falte infraestructura. Ver §4.

### Tabla 5. Viviendas con bicicleta, automóvil y motocicleta, total municipal (consulta B5)

| Municipio | Viviendas particulares habitadas | % con bicicleta | % con automóvil | % con motocicleta |
|---|---|---|---|---|
| Querétaro | 305 361 | 15.2 | 62.9 | 8.1 |
| El Marqués | 67 957 | 18.8 | 58.5 | 6.8 |
| Corregidora | 64 356 | 15.9 | 76.6 | 8.5 |
| Pedro Escobedo | 19 072 | 30.0 | 47.0 | 5.3 |
| Huimilpan | 9 905 | 11.5 | 55.9 | 7.0 |

### Tabla 6. AGEB densas sin ciclovía cercana (consulta B7)

| Umbral de densidad (percentil 75) | AGEB densas | Población | AGEB densas sin ciclovía a ≤ 500 m | Población sin ciclovía a ≤ 500 m |
|---|---|---|---|---|
| 11 913 hab/km² | 151 | 481 392 | 97 (64 %) | 287 702 (60 %) |

### Tabla 7. Las 15 AGEB densas más pobladas sin ciclovía a ≤ 500 m (consulta B6)

| CVEGEO | Municipio | Población | hab/km² | m a la parada más cercana |
|---|---|---|---|---|
| 2201400011975 | Querétaro | 9 816 | 15 146 | 0 |
| 2201400012795 | Querétaro | 8 144 | 12 836 | 0 |
| 2201400014414 | Querétaro | 7 030 | 13 992 | 556 |
| 2201400011689 | Querétaro | 6 470 | 15 266 | 0 |
| 2201401053083 | Querétaro | 6 126 | 12 558 | 0 |
| 2201400013647 | Querétaro | 6 082 | 14 930 | 0 |
| 2201400011547 | Querétaro | 6 003 | 21 256 | 0 |
| 2201400013810 | Querétaro | 5 355 | 16 590 | 0 |
| 2200601420532 | Corregidora | 5 341 | 16 403 | 0 |
| 2201400014132 | Querétaro | 5 309 | 18 647 | 254 |
| 2201400013346 | Querétaro | 5 242 | 17 684 | 0 |
| 2201400014147 | Querétaro | 5 137 | 23 375 | 2 |
| 2201400012441 | Querétaro | 4 872 | 11 995 | 0 |
| 2200600010689 | Corregidora | 4 714 | 13 479 | 0 |
| 2201400013350 | Querétaro | 4 704 | 17 789 | 0 |

0 m significa que hay al menos una parada dentro de la AGEB.

### Tabla 8. Demanda observada en EcoMove (consulta B8)

| Viajes oficiales completados | Usuarios | Periodo |
|---|---|---|
| 3 | 2 | 15/11/2026 – 16/11/2026 |

## 3. Interpretación

1. **El transporte público cubre a más de la mitad de la población urbana, pero de forma desigual.**
   - Con paradas de OSM, el 58.2 % de la población urbana del área de estudio vive a ≤ 400 m de una parada.
   - En el municipio de Querétaro la cifra sube a 66.5 %. En El Marqués baja a 26.4 %, aunque su área urbana es igual de densa (5 348 hab/km²).
2. **La ciclovía cercana es la excepción.**
   - Solo el 20.9 % de la población urbana vive a ≤ 300 m de una ciclovía.
   - Querétaro tiene 1.59 km de ciclovía por cada 10 000 habitantes urbanos, y Corregidora 1.22.
3. **El déficit se concentra en las zonas más densas.**
   - De las 151 AGEB del cuartil más denso (≥ 11 913 hab/km², 481 392 habitantes), 97 no tienen ciclovía a ≤ 500 m. En ellas viven 287 702 personas (60 %).
   - Casi todas tienen parada a menos de 600 m (Tabla 7). Son candidatas naturales a la intermodalidad bicicleta + autobús.
4. **Hay demanda latente de bicicleta y una alta dependencia del automóvil.**
   - Entre el 15 % y el 19 % de las viviendas de Querétaro, Corregidora y El Marqués tienen bicicleta como medio de transporte.
   - Entre el 59 % y el 77 % tienen automóvil.
   - Tener una bicicleta no implica usarla, pero muestra una base de usuarios potenciales.
5. **No hay datos de demanda para priorizar dónde intervenir.**
   - EcoMove tiene solo 3 viajes oficiales registrados.
   - Con esa muestra, el índice de prioridad (`apps/api/docs/geo/PRIORITY_INDEX.md`) marca todas las zonas como `datos_insuficientes`, por diseño: exige al menos 10 usuarios y 20 extremos de viaje por zona.
   - Las Tablas 6 y 7 comparan oferta contra población, no contra viajes. Señalan **candidatas a estudio**, no una necesidad demostrada.

### Necesidad identificada

La zona metropolitana de Querétaro tiene una oferta de ciclovías baja y desigual frente a su población urbana (Tablas 3, 4 y 6), y alta tenencia de automóvil (Tabla 5). Además, no existen datos abiertos de viajes reales: no se encontró una encuesta origen-destino ni un GTFS público (DATASETS.md §7).

Esto justifica un software que:
- registre viajes voluntarios con su modo y su ruta;
- estime el CO₂ evitado;
- agregue esos viajes de forma anónima (k ≥ 5) para que la planeación de ciclovías y paradas se apoye en demanda observada, además de en la población.

Esa es la función de EcoMove Querétaro (ODS 11.2 y 9.1).

## 4. Limitaciones y sesgos

| Limitación | Efecto en los resultados |
|---|---|
| OSM es colaborativo e incompleto, y no se pudo contrastar con inventarios oficiales | La cobertura real puede ser mayor. Los ceros de Pedro Escobedo y Colón son sospechosos. |
| Interpolación areal (población uniforme dentro de cada AGEB) | Sobrestima o subestima la cobertura en AGEB grandes o con zonas sin vivienda (parques, industria). |
| Distancia euclidiana con buffers, no por red peatonal | Sobrestima el acceso cuando hay barreras: vías rápidas, ríos, bardas. |
| Umbrales de 400 m y 300 m elegidos como criterio de análisis | Cambiar el umbral cambia las cifras; no son normas oficiales. |
| Censo de marzo de 2020 contra infraestructura de noviembre de 2026 | Hay seis años de diferencia: la población de zonas en expansión (El Marqués) está subestimada. |
| Solo AGEB urbanas dentro del bbox | El análisis no aplica a zonas rurales ni a municipios fuera de la ZM. |
| La parada de OSM no indica frecuencia ni ruta | Una parada cercana no garantiza un servicio útil. |
| Tres viajes en EcoMove | No hay ninguna conclusión de demanda: el índice de prioridad lo reporta como datos insuficientes. |

## 5. Reproducción

```bash
# 1. Zonas y población (archivos descargados del INEGI; ver DATASETS.md)
python -m app.services.geo_analytics.inegi_import --mg <carpeta>/conjunto_de_datos \
    --censo <carpeta>/conjunto_de_datos_ageb_urbana_22_cpv2020.csv
# 2. Infraestructura
python -m app.services.geo_analytics.osm_import
# 3. Consultas (bloque B)
psql -f apps/api/db/geo/queries/consultas_espaciales.sql
```

La consulta B4 tarda unos 2 minutos en la BD de desarrollo; las demás, menos de 1 segundo.
