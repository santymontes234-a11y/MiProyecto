# Viabilidad e impacto de EcoMove Querétaro

> Requisitos R12 y R16 del proyecto ABD. Autor: sesión **reporte**. Fecha: 17 de noviembre de 2026.
> Las cifras que no aparecen en la documentación del proyecto se marcan como **[POR CONFIRMAR]**.

## 1. Viabilidad técnica

| Aspecto | Situación | Conclusión |
|---|---|---|
| Tecnologías | PostgreSQL 16 con PostGIS 3.4, API en FastAPI (Python), web en Next.js y aplicación Android en Expo (React Native). Todas son de código abierto, maduras y con amplia documentación | Viable sin licencias |
| Base de datos | 25 tablas normalizadas hasta la 3FN, con claves sustitutas UUID, restricciones `CHECK`, claves foráneas con acciones explícitas, índices B-tree y GiST, y comentarios en cada columna | Diseño íntegro y mantenible |
| Datos | Fuentes oficiales y abiertas ya cargadas: 907 zonas del INEGI, 924 ciclovías y 1 037 puntos de interés de OSM | Disponibles y reproducibles con los importadores del proyecto |
| Prototipo | CRUD funcional de puntos de interés y viajes, verificado en la base de datos (evidencias 01–12 y `verificacion.sql`) | Cumple con el requisito del prototipo |
| Seguridad | Contraseñas con Argon2id, tokens guardados solo como hash SHA-256, control de acceso por roles (USER, ADMIN y SUPER_ADMIN) y bitácora de auditoría | Adecuada para datos personales (LFPDPPP) |
| Escalabilidad | API sin estado, escalable horizontalmente; estadísticas con índices compuestos y vistas materializadas previstas | Escalable a nivel metropolitano |

**Riesgos técnicos:** dependencia de los servidores públicos de mosaicos de OSM (su política prohíbe el tráfico intensivo, por lo que en producción se requiere un proveedor propio) y cobertura incompleta de OSM en algunas zonas (Pedro Escobedo y Colón).

## 2. Viabilidad económica

| Concepto | Costo | Observación |
|---|---|---|
| Licencias de software | 0 | Todo el software es de código abierto |
| Datos | 0 | INEGI (términos de libre uso) y OSM (ODbL 1.0) |
| Desarrollo | [POR CONFIRMAR] | Desarrollado como proyecto académico |
| Servidor y base de datos en la nube | [POR CONFIRMAR] | Depende del proveedor y del volumen de usuarios |
| Servicio de mosaicos de mapa | [POR CONFIRMAR] | Necesario antes de la operación pública |
| Publicación en Google Play | [POR CONFIRMAR] | Cuota de registro de desarrollador |

**Modelo de sostenibilidad propuesto:** convenios con gobiernos municipales o con el organismo de transporte del estado, que obtendrían indicadores agregados y anónimos de demanda para planear infraestructura; patrocinios de empresas con programas de movilidad sostenible para sus empleados. Ninguno de estos convenios existe todavía: son líneas de financiamiento posibles.

## 3. Viabilidad social

- **Base de usuarios potenciales.** Entre el 15.2 % y el 18.8 % de las viviendas de Querétaro, Corregidora y El Marqués tienen bicicleta como medio de transporte (INEGI, 2021), y el 58.2 % de la población urbana del área de estudio vive a 400 m o menos de una parada de autobús.
- **Aceptación.** La aplicación es gratuita, voluntaria y no exige datos personales más allá del correo y el nombre. El ranking es opcional (`ranking_opt_in`) y las estadísticas públicas aplican k-anonimato.
- **Privacidad.** El usuario puede exportar y borrar sus datos; los viajes se borran físicamente cuando él lo pide.
- **Barreras.** Brecha digital, desconfianza ante el registro de ubicación y baja adopción inicial: con solo 3 viajes oficiales registrados, el índice de prioridad reporta «datos insuficientes».

## 4. Impacto en la industria

- **Planeación urbana basada en datos.** Hoy no existen datos abiertos de viajes en la zona metropolitana (no hay encuesta origen-destino ni GTFS públicos). EcoMove genera esa información de forma agregada y la cruza con el Censo 2020.
- **Reutilización.** El modelo de datos y las consultas espaciales (cobertura por población, kilómetros de ciclovía por habitante, AGEB densas sin ciclovía) son replicables en otras ciudades con datos del INEGI y de OSM.
- **Medición de impacto ambiental.** El cálculo de CO₂ con factores versionados y con fuente (EPA, 2026) permite a empresas e instituciones reportar el efecto de sus programas de movilidad.

## 5. Impacto en los ODS

| ODS | Impacto esperado | Indicador en EcoMove |
|---|---|---|
| 9 | Priorizar inversión en infraestructura con datos | Viajes por zona con k ≥ 5; AGEB densas sin ciclovía |
| 11 | Mejor acceso a transporte sostenible | % de población a ≤ 400 m de parada y a ≤ 300 m de ciclovía |
| 12 | Consumo de movilidad informado | CO₂ evitado por usuario y por ciudad |
| 15 | Menor presión ambiental del transporte (indirecto) | CO₂ evitado acumulado |

## 6. Referencias

Instituto Nacional de Estadística y Geografía. (2021). *Principales resultados por AGEB y manzana urbana del Censo de Población y Vivienda 2020: Querétaro* [Conjunto de datos]. INEGI. https://www.inegi.org.mx/programas/ccpv/2020/#Datos_abiertos

U.S. Environmental Protection Agency. (2026). *The 2025 EPA automotive trends report: Greenhouse gas emissions, fuel economy, and technology since 1975* (EPA-420-R-26-001). https://www.epa.gov/automotive-trends
