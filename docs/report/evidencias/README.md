# Evidencias del CRUD funcional (R15)

Capturas del prototipo web de **EcoMove Querétaro** conectado a la base de datos PostgreSQL/PostGIS,
generadas de forma reproducible con Playwright sobre una base efímera con **datos ficticios**
(cuentas `@ejemplo.mx`, nombres «Ejemplo»). Cada operación se comprueba en la base con las consultas de
[`verificacion.sql`](verificacion.sql); la salida real obtenida al generar las capturas está en
[`verificacion-resultados.md`](verificacion-resultados.md).

Regenerar (desde la raíz del repositorio, con `next build` hecho en `apps/web`):

```bash
tests/e2e/run-local.sh evidence
```

## Puntos de infraestructura (POIs) — panel de administración

| Archivo | Operación | Pie de figura |
|---|---|---|
| `01-poi-crear-formulario.png` | Create | **Figura 1.** Formulario de alta de un punto de infraestructura en el panel de administración, con la ubicación elegida sobre el mapa. |
| `02-poi-crear-resultado.png` | Create | **Figura 2.** Confirmación del alta: el nuevo estacionamiento de bicicletas se guarda en la tabla `pois` y aparece en el mapa. |
| `03-poi-listar-mapa.png` | Read | **Figura 3.** Consulta de los puntos activos del área visible en el mapa público, obtenidos de la base mediante una consulta espacial por *bounding box*. |
| `04-poi-editar-formulario.png` | Update | **Figura 4.** Edición del punto: cambio de nombre y de capacidad, que actualiza el registro y su marca `updated_at`. |
| `05-poi-eliminar-confirmacion.png` | Delete | **Figura 5.** Confirmación previa a la eliminación del punto. |
| `06-poi-eliminar-resultado.png` | Delete | **Figura 6.** Resultado de la eliminación: borrado lógico (`is_active = false`); el punto deja de mostrarse y la operación queda en `audit_logs`. |

## Viajes — área privada del usuario

| Archivo | Operación | Pie de figura |
|---|---|---|
| — | Create | Los viajes se registran desde la aplicación Android, que envía la traza completa al terminar (ADR-004). La alta se verifica en la base con la consulta 2.1 de `verificacion.sql`: distancia y CO₂ calculados por el servidor. |
| `07-viaje-listar.png` | Read | **Figura 7.** Listado paginado de los viajes del usuario con distancia, duración y CO₂ evitado, filtrado por su identificador en la consulta. |
| `08-viaje-detalle.png` | Read | **Figura 8.** Detalle de un viaje con su traza sobre OpenStreetMap y los indicadores calculados en la base de datos. |
| `11-viaje-editar-formulario.png` | Update | **Figura 11.** Edición de un viaje propio: cambio del medio de transporte (bicicleta → autobús) en el formulario de edición. |
| `12-viaje-editar-resultado.png` | Update | **Figura 12.** Resultado de la edición (`PATCH /trips/{id}`): el servidor recalcula el CO₂ evitado y emitido y los puntos, y actualiza `updated_at` (consulta 2.3 de `verificacion.sql`). |
| `09-viaje-eliminar-confirmacion.png` | Delete | **Figura 9.** Confirmación previa a la eliminación de un viaje propio. |
| `10-viaje-eliminar-resultado.png` | Delete | **Figura 10.** Resultado de la eliminación: el viaje se borra físicamente de la tabla `trips` (dato personal) y desaparece del listado. |

> Mapas: © colaboradores de OpenStreetMap (ODbL).
