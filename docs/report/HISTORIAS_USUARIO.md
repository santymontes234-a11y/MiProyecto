# Historias de usuario de EcoMove Querétaro

> Requisito R13 del proyecto ABD. Autor: sesión **reporte**. Fecha: 17 de noviembre de 2026.
> Basadas en `docs/API_CONTRACT.md` (v1.2.2). Formato: «Como [rol], quiero [acción] para [beneficio]».
> Roles: USER (ciudadano), ADMIN (administrador) y SUPER_ADMIN (superadministrador). Los permisos son jerárquicos: ADMIN incluye los de USER, y SUPER_ADMIN los de ADMIN.

## 1. Ciudadano (USER)

**HU-01. Registro e inicio de sesión.** Como ciudadano, quiero crear una cuenta e iniciar sesión para guardar mis viajes de forma segura.
- La contraseña se guarda solo como hash Argon2id.
- Tras varios intentos fallidos, la cuenta se bloquea temporalmente.
- Puedo cerrar sesión en un dispositivo o en todos.

**HU-02. Registrar un viaje.** Como ciudadano, quiero registrar un viaje con su medio de transporte y su ruta para conocer el CO₂ que evité.
- La aplicación Android envía la traza completa al terminar el viaje.
- El servidor calcula la distancia, la duración, el CO₂ emitido, el CO₂ evitado y los puntos; el cliente no puede imponerlos.
- Si envío el mismo viaje dos veces (mismo `client_trip_id`), no se duplica.

**HU-03. Estimar el impacto antes de viajar.** Como ciudadano, quiero comparar el CO₂ de varios medios para un mismo trayecto para elegir el más sostenible.
- Puedo buscar el origen y el destino por nombre.
- Puedo indicar el tipo de automóvil y el número de ocupantes; en auto compartido, las emisiones se dividen entre los ocupantes.

**HU-04. Consultar, editar y borrar mis viajes.** Como ciudadano, quiero ver el historial de mis viajes, corregir el medio de un viaje y borrar los que no quiera conservar para mantener mis datos al día.
- El listado está paginado y se puede filtrar por medio y por fecha.
- Al editar, el servidor recalcula el CO₂ y los puntos.
- Solo puedo ver, editar o borrar mis propios viajes; el borrado es físico.

**HU-05. Ver el mapa de infraestructura.** Como ciudadano, quiero ver en un mapa las paradas, las ciclovías y las estaciones de bicicleta cercanas para planear mi ruta.
- El mapa muestra la atribución «© OpenStreetMap contributors».
- Las ciclovías confinadas se distinguen de las no confinadas.

**HU-06. Estadísticas y logros.** Como ciudadano, quiero ver mi CO₂ evitado, mis kilómetros y mis logros para motivarme a seguir.
- Las estadísticas se pueden ver por semana o por mes.
- Aparezco en el ranking solo si lo acepto.

**HU-07. Reportar un problema.** Como ciudadano, quiero reportar un problema de infraestructura (ciclovía dañada, parada sin señalización) para que la administración lo atienda.
- Puedo enviar como máximo 10 reportes al día.
- Puedo consultar el estado de mis reportes.

**HU-08. Controlar mis datos.** Como ciudadano, quiero exportar o eliminar mi cuenta para ejercer mis derechos sobre mis datos personales.
- La exportación incluye mis datos y mis viajes.
- Eliminar la cuenta exige confirmar la contraseña.

## 2. Administrador (ADMIN)

**HU-09. Gestionar puntos de interés.** Como administrador, quiero dar de alta, editar y desactivar puntos de infraestructura para mantener el mapa actualizado.
- La ubicación se elige sobre el mapa.
- La eliminación es lógica (`is_active = false`) y queda registrada en la bitácora.
- Una parada de autobús no puede registrarse a la vez como estación de bicicleta (especialización disjunta).

**HU-10. Gestionar usuarios.** Como administrador, quiero buscar usuarios y suspender cuentas que incumplan las reglas para proteger la plataforma.
- Debo indicar un motivo al suspender.
- No puedo suspender a otro ADMIN ni a un SUPER_ADMIN.

**HU-11. Atender reportes ciudadanos.** Como administrador, quiero filtrar los reportes por estado, categoría y zona y cambiar su estado para dar seguimiento a cada problema.
- Puedo añadir una nota de resolución.

**HU-12. Analítica y zonas.** Como administrador, quiero ver los viajes agregados por zona y los indicadores de cobertura para priorizar ciclovías y paradas.
- Las zonas con menos de 5 usuarios distintos se ocultan (k-anonimato).
- Puedo crear, editar y eliminar zonas de análisis.

**HU-13. Generar informes.** Como administrador, quiero generar informes en CSV o PDF para compartir indicadores con otras dependencias.
- Los informes no contienen datos personales.

## 3. Superadministrador (SUPER_ADMIN)

**HU-14. Gestionar roles.** Como superadministrador, quiero cambiar el rol de un usuario para delegar la administración.
- Al cambiar el rol se revocan las sesiones del usuario.
- Siempre debe existir al menos un SUPER_ADMIN activo.

**HU-15. Actualizar factores de emisión.** Como superadministrador, quiero actualizar los factores de emisión por medio de transporte para que el cálculo use valores vigentes.
- Los viajes anteriores conservan el factor con el que se calcularon.

**HU-16. Consultar la bitácora de auditoría.** Como superadministrador, quiero consultar la bitácora de las acciones administrativas para detectar abusos.
- La bitácora solo admite inserciones y no guarda secretos ni coordenadas.
- Puedo filtrar por actor y por acción.
