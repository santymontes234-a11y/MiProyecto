# Justificación de la alineación con los ODS y objetivo del software

> Requisitos R1 y R4 del proyecto ABD. Autor: sesión **reporte**. Fecha: 17 de noviembre de 2026.
> Las cifras provienen de `ANALISIS_DATOS.md` y las fuentes de `DATASETS.md`. No se usan datos DEMO.

## 1. Objetivo del software

**Objetivo general.** Desarrollar una plataforma web y móvil, respaldada por una base de datos relacional y espacial (PostgreSQL con PostGIS), que permita a los habitantes de la zona metropolitana de Querétaro registrar sus viajes cotidianos, conocer el CO₂ que evitan al elegir medios sostenibles y consultar la infraestructura de movilidad disponible, y que ofrezca a la administración indicadores agregados y anónimos para planear ciclovías y paradas a partir de demanda observada.

**Objetivos específicos.**

1. Registrar viajes con su medio de transporte, su ruta y sus ocupantes, y calcular en el servidor la distancia, el CO₂ emitido y el CO₂ evitado con factores de emisión versionados y con fuente.
2. Integrar datos oficiales y abiertos (INEGI, Censo 2020 y Marco Geoestadístico 2020; OpenStreetMap) para identificar zonas con déficit de infraestructura.
3. Mostrar en un mapa paradas de autobús, ciclovías, estaciones de bicicleta y otros puntos de interés.
4. Ofrecer estadísticas personales y de la ciudad, con k-anonimato (k ≥ 5) para proteger la privacidad.
5. Permitir a los administradores mantener la infraestructura (CRUD de puntos de interés y zonas), atender reportes ciudadanos y generar informes, con bitácora de auditoría.

**Alineación con la industria.** El software pertenece al sector de tecnologías para ciudades inteligentes y movilidad (*smart mobility*), en el que los gobiernos locales y las empresas de transporte necesitan datos de viajes para planear infraestructura. EcoMove aporta una base de datos normalizada hasta la tercera forma normal, con componente geoespacial, que puede integrarse con sistemas de información geográfica y con tableros de planeación.

## 2. Necesidad que atiende

El análisis de datos oficiales (ANALISIS_DATOS.md) muestra que:

- Solo el **20.9 %** de la población urbana del área de estudio (1 407 630 habitantes) vive a 300 m o menos de una ciclovía, frente al **58.2 %** que vive a 400 m o menos de una parada de autobús.
- De las 151 AGEB urbanas más densas, **97 (64 %)** no tienen ciclovía a 500 m o menos; en ellas viven **287 702** personas.
- Entre el **58.5 %** y el **76.6 %** de las viviendas de Querétaro, El Marqués y Corregidora tienen automóvil, y entre el **15.2 %** y el **18.8 %** tienen bicicleta.
- No existe una encuesta origen-destino ni un GTFS público descargable, por lo que no hay datos abiertos de viajes reales para priorizar dónde intervenir.

## 3. Alineación con cada ODS

Las metas se citan de la Agenda 2030 (Naciones Unidas, 2015).

| ODS | Meta | Cómo contribuye EcoMove | Evidencia en el sistema |
|---|---|---|---|
| **9. Industria, innovación e infraestructura** | 9.1: desarrollar infraestructuras fiables, sostenibles, resilientes y de calidad | Genera datos de demanda observada (viajes agregados por zona) que permiten priorizar la inversión en ciclovías y paradas; integra datos abiertos del INEGI y de OSM en una plataforma reutilizable | Tablas `trips`, `cycleways`, `pois`, `geo.mobility_zones`, `geo.zone_census`; consultas B1–B8 y A1–A6 |
| **11. Ciudades y comunidades sostenibles** | 11.2: acceso a sistemas de transporte seguros, asequibles, accesibles y sostenibles; 11.6: reducir el impacto ambiental negativo per cápita de las ciudades | Muestra la infraestructura cercana al usuario, mide la cobertura de paradas y ciclovías por población y permite reportes ciudadanos de problemas de infraestructura | Mapa público, `citizen_reports`, análisis de cobertura (Tablas 3, 4 y 6 de ANALISIS_DATOS) |
| **12. Producción y consumo responsables** | 12.8: asegurar que las personas tengan información y conocimientos pertinentes para estilos de vida en armonía con la naturaleza | Informa a cada usuario el CO₂ emitido y evitado por viaje y acumulado; la gamificación (logros y ranking voluntario) refuerza hábitos de movilidad responsable | `trips.co2_saved_g`, `emission_factors`, `vehicle_types`, `achievements`, `user_achievements` |
| **15. Vida de ecosistemas terrestres** | 15.1 y 15.5: conservar los ecosistemas terrestres y reducir la degradación de los hábitats naturales | Contribución indirecta: menos viajes en automóvil reducen emisiones y contaminantes que afectan a los ecosistemas periurbanos; la información sobre la red ciclista favorece un crecimiento urbano que priorice modos de bajo impacto | Indicador de CO₂ evitado; análisis de zonas en expansión (El Marqués) |

**Alcance de la contribución.** La relación con los ODS 9, 11 y 12 es directa, porque el software produce datos e información para esas metas. La relación con el ODS 15 es indirecta y se presenta como tal: EcoMove no mide biodiversidad ni uso de suelo.

## 4. Referencias

Naciones Unidas. (2015). *Transformar nuestro mundo: la Agenda 2030 para el Desarrollo Sostenible* (A/RES/70/1). https://www.un.org/sustainabledevelopment/es/

Instituto Nacional de Estadística y Geografía. (2021). *Principales resultados por AGEB y manzana urbana del Censo de Población y Vivienda 2020: Querétaro* [Conjunto de datos]. INEGI. https://www.inegi.org.mx/programas/ccpv/2020/#Datos_abiertos

OpenStreetMap contributors. (2026). *OpenStreetMap* [Conjunto de datos; extracción del 16 de noviembre de 2026 vía Overpass API]. OpenStreetMap Foundation. https://www.openstreetmap.org
