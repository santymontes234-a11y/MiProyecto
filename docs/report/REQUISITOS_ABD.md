# Requisitos del proyecto ABD frente al estado de EcoMove Querétaro

> Fuente: «Proyecto ABD» (enunciado de la materia). Revisión del architect, 2026-11-16.
> Esta matriz manda sobre el backlog técnico: lo que pide el enunciado se entrega primero.
> Sesiones: **reporte** = sesión del informe PDF y la presentación (**sin abrir todavía**; la sesión «Presentación y reporte del proyecto» es de otro proyecto);
> **web** está inactiva: su tarea (eslogan y logo en la web, CRUD estable para las evidencias) queda pendiente hasta que vuelva.

## 1. Matriz de cumplimiento

| # | Requisito del enunciado | Estado | Dueño | Entregable |
|---|---|---|---|---|
| R1 | Software alineado con ODS 9, 11, 12 y 15 | Parcial: el producto cubre ODS 11 y 9, pero no hay justificación escrita | reporte | `docs/report/JUSTIFICACION_ODS.md` |
| R2 | Seleccionar uno o varios datasets relacionados con los ODS | Parcial: se usa OSM, pero falta documentar y analizar los datasets oficiales | geo | `docs/report/DATASETS.md` |
| R3 | Analizar los datos e identificar la necesidad | Falta: hay herramientas (índice de prioridad, cobertura de ciclovías), pero no un análisis con resultados | geo | `docs/report/ANALISIS_DATOS.md` + cifras y tablas |
| R4 | Objetivo del software alineado con la industria y los ODS | Falta en formato de informe | reporte | `JUSTIFICACION_ODS.md` |
| R5 | BD con ≥ 15 tablas, normalizada y con buenas prácticas | Parcial: hay ~17 tablas, pero 5 columnas JSONB rompen la 1FN donde guardan datos estructurados (`users.preferences`, `pois.attributes.code/lines`) y no hay justificación de normalización | backend (rol database) | migración de normalización + `docs/report/NORMALIZACION.md` |
| R6 | Entregar MER | Falta | backend (database) | `docs/report/diagramas/MER.*` (SVG/PNG + fuente) |
| R7 | Entregar EER (especialización/generalización) | Falta | backend (database) | `docs/report/diagramas/EER.*` |
| R8 | Prototipo funcional con al menos un CRUD conectado a la BD | Cumple: CRUD de POIs (web admin), viajes (web y mobile) y zonas | web, mobile | — |
| R9 | Nombre, logo y eslogan | Cumple desde hoy: «EcoMove Querétaro», «Cada viaje cuenta.», `docs/brand/logo.svg` | architect | integrar en web y mobile |
| R10 | Colores y estilo visual | Cumple (DESIGN_SYSTEM.md) | design | — |
| R11 | (Opcional) Estadísticas desde la BD | Cumple: `/stats/*` y `/admin/analytics/*` | — | capturas y tablas para el informe |
| R12 | Impacto y viabilidad técnica, económica y social | Falta | reporte | `docs/report/VIABILIDAD.md` |
| R13 | Historias de usuario | Falta | reporte | `docs/report/HISTORIAS_USUARIO.md` |
| R14 | Ejemplos de consultas SQL | Parcial: `apps/api/docs/geo/GEO_QUERIES.md` solo cubre lo espacial | backend + geo | `database/03_consultas.sql` |
| R15 | Evidencias del CRUD funcional | Falta | qa | `docs/report/evidencias/` (C, R, U, D por entidad) |
| R16 | Análisis de impacto en la industria y los ODS | Falta | reporte | `VIABILIDAD.md` |
| E1 | Informe escrito en PDF con formato estricto | Falta | reporte | `docs/report/Informe_EcoMove.pdf` |
| E2 | Script de creación de la BD + datos de ejemplo | Falta: solo hay migraciones Alembic | backend (database) | `database/01_esquema.sql`, `database/02_datos_ejemplo.sql` |
| E3 | Prototipo funcional con CRUD | Cumple | — | instrucciones de ejecución en el README |
| E4 | Presentación en clase | Falta | reporte | después del informe |

## 2. Formato obligatorio del informe (E1)

- Portada según la plantilla de la profesora (**pendiente: la plantilla y el nombre exacto de la profesora**; si el nombre está mal, se resta un punto).
- Solo el título del informe va en negritas y mayúsculas a la vez; el resto de títulos, en negritas o en mayúsculas, no ambas.
- Títulos ≤ 14 pt; texto 12 pt; una sola tipografía (se elige **Arial**); interlineado 1.15; márgenes de 2 cm; sin líneas de margen.
- Índice, índice de tablas e índice de figuras; número de página en la esquina inferior derecha.
- Introducción, desarrollo y conclusiones; lenguaje formal; sin imágenes ni información no solicitadas. Solo se admiten como figuras el logo, el MER, el EER, las evidencias del CRUD y las gráficas de estadísticas.
- Referencias en APA 7; todo texto ajeno citado o parafraseado. Cada 5 faltas de ortografía se resta un punto: revisión ortográfica obligatoria.

## 3. Decisiones de arquitectura para el entregable académico

1. **Normalización (R5):** se reemplazan los JSONB que guardan datos estructurados:
   - `users.preferences` → tabla `user_preferences` (1:1).
   - `pois.attributes.code/lines` → especialización EER disjunta de `pois`: `transit_stops` (PK = FK `pois.id`, `code` único) y `bike_stations` (PK = FK, `capacity`), más `transit_lines` y `stop_lines` (N:M).
   - Se conservan como JSONB, con justificación, `audit_logs.payload`, `notifications.data` y `reports.parameters`: son registros semiestructurados e inmutables que no se consultan por sus campos.
   - **El contrato API no cambia**: la API sigue exponiendo `attributes.code`/`lines` y `Preferences`, ahora construidos desde las tablas normalizadas.
2. **Conteo de tablas:** se cuentan solo las tablas de dominio y de seguridad del esquema `public` más `geo.mobility_zones`. Las `geo.demo_*` no cuentan.
3. **Datos de ejemplo (E2):** ficticios y marcados como tales (usuarios `@ejemplo.mx`, no reales). Los POIs y ciclovías vienen de OSM con atribución ODbL.
