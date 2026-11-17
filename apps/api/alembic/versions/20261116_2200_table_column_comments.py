"""table and column comments

Diccionario de datos (entregable ABD): COMMENT ON TABLE/COLUMN para las 23 tablas de `public` y las
2 de `geo` que forman parte del modelo. Copia congelada de app/models/comments.py (2026-11-16).

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-16 22:00:00+00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMAS = {
    "public": {   'users': (   'Cuentas de usuario. Datos personales mínimos (LFPDPPP); la contraseña solo como hash '
                     'Argon2id',
                     {   'id': 'Identificador UUID v4 (PK)',
                         'email': 'Correo electrónico en minúsculas; único; identificador de inicio de sesión',
                         'password_hash': 'Hash Argon2id de la contraseña (nunca la contraseña en claro)',
                         'full_name': 'Nombre completo para mostrar (1–120 caracteres)',
                         'role': 'Rol RBAC: USER, ADMIN o SUPER_ADMIN (FK lógica a roles.name)',
                         'is_active': 'Falso = cuenta desactivada por un administrador; no puede iniciar sesión',
                         'failed_login_attempts': 'Contraseñas incorrectas consecutivas (bloqueo anti fuerza '
                                                  'bruta)',
                         'locked_until': 'Bloqueo temporal de la cuenta hasta esta fecha (UTC); NULL si no está '
                                         'bloqueada',
                         'last_login_at': 'Último inicio de sesión correcto (UTC)',
                         'created_at': 'Fecha y hora de creación (UTC)',
                         'updated_at': 'Fecha y hora de la última modificación (UTC)',
                         'email_verified_at': 'Fecha de verificación del correo; NULL si no se ha verificado',
                         'ranking_opt_in': 'Consentimiento para aparecer en el ranking público (por defecto '
                                           'falso)',
                         'token_version': 'Versión de tokens; al incrementarse invalida todos los access tokens '
                                          'emitidos'}),
        'user_preferences': (   'Preferencias del usuario (1:1 con users; normalización del antiguo JSONB)',
                                {   'user_id': 'PK y FK a users.id (relación 1:1)',
                                    'language': 'Idioma de la interfaz: es o en',
                                    'default_mode': 'Medio de transporte preferido (opcional)',
                                    'weekly_goal_trips': 'Meta semanal de viajes, 1–100 (opcional)',
                                    'email_notifications': 'Acepta recibir correos informativos',
                                    'updated_at': 'Fecha y hora de la última modificación (UTC)',
                                    'default_vehicle_type': 'Tipo de automóvil por omisión para CAR/CARPOOL y '
                                                            'como referencia de ahorro (FK)'}),
        'roles': (   'Catálogo de roles RBAC',
                     {   'name': 'Nombre del rol (PK): USER, ADMIN, SUPER_ADMIN',
                         'description': 'Descripción del rol',
                         'level': 'Nivel jerárquico (1 = USER, 2 = ADMIN, 3 = SUPER_ADMIN)'}),
        'permissions': (   'Catálogo de permisos atómicos RBAC',
                           {   'code': 'Código del permiso (PK), p. ej. trips:own',
                               'description': 'Descripción del permiso'}),
        'role_permissions': (   'Relación N:M entre roles y permisos',
                                {   'role': 'Rol (PK compuesta, FK a roles.name)',
                                    'permission_code': 'Permiso (PK compuesta, FK a permissions.code)'}),
        'refresh_tokens': (   'Refresh tokens rotativos; cada familia es una sesión (dispositivo). Solo se '
                              'guarda el hash',
                              {   'id': 'Identificador del token (= claim jti)',
                                  'user_id': 'Dueño del token (FK a users.id)',
                                  'family_id': 'Familia de rotación = sesión; reutilizar un token revoca toda la '
                                               'familia',
                                  'token_hash': 'SHA-256 del token (nunca el token en claro)',
                                  'expires_at': 'Caducidad del token (UTC)',
                                  'revoked_at': 'Fecha de revocación; NULL si sigue vigente',
                                  'replaced_by_id': 'Token que lo sustituyó al rotar',
                                  'created_at': 'Fecha y hora de creación (UTC)',
                                  'session_created_at': 'Inicio de la sesión (primer token de la familia)',
                                  'last_used_at': 'Último uso de la sesión',
                                  'user_agent': 'User-Agent del cliente (máx. 255 caracteres), para listar '
                                                'sesiones'}),
        'user_tokens': (   'Tokens de un solo uso para restablecer contraseña y verificar correo (solo hash)',
                           {   'id': 'Identificador UUID v4 (PK)',
                               'user_id': 'Dueño del token (FK a users.id)',
                               'purpose': 'Propósito: PASSWORD_RESET o EMAIL_VERIFICATION',
                               'token_hash': 'SHA-256 del token (único)',
                               'expires_at': 'Caducidad: 30 min (reset) o 48 h (verificación)',
                               'used_at': 'Fecha de uso; NULL si no se ha usado',
                               'created_at': 'Fecha y hora de creación (UTC)'}),
        'trips': (   'Viajes registrados. La distancia, el CO2 y los puntos los calcula solo el servidor',
                     {   'id': 'Identificador UUID v4 (PK)',
                         'user_id': 'Dueño del viaje (FK a users.id)',
                         'client_trip_id': 'UUID generado por el cliente para idempotencia (único por usuario)',
                         'mode': 'Medio de transporte (FK lógica a transport_modes.mode)',
                         'status': 'COMPLETED o CANCELLED',
                         'started_at': 'Inicio del viaje (UTC)',
                         'ended_at': 'Fin del viaje (UTC); posterior al inicio',
                         'distance_m': 'Distancia geodésica en metros calculada por PostGIS',
                         'duration_s': 'Duración en segundos',
                         'route': 'Traza del viaje: LineString SRID 4326 (dato personal sensible)',
                         'emission_factor_g_per_km': 'Factor aplicado (g CO2/km por pasajero) al calcular el '
                                                     'viaje; histórico',
                         'co2_emitted_g': 'CO2 emitido estimado, en gramos',
                         'co2_saved_g': 'CO2 evitado estimado frente al automóvil de referencia, en gramos',
                         'created_at': 'Fecha y hora de creación (UTC)',
                         'source': 'Origen: GPS (grabado) o PLANNED (ruta de /routes con route_token)',
                         'points': 'Puntos ganados = floor(co2_saved_g / 100); 0 si está cancelado',
                         'recurrence_id': 'Serie de viajes recurrentes a la que pertenece (NULL si es suelto)',
                         'updated_at': 'Fecha y hora de la última modificación (UTC)',
                         'vehicle_type': 'Tipo de automóvil (solo CAR/CARPOOL; FK a vehicle_types.code)',
                         'occupants': 'Ocupantes del automóvil, 1–8 (solo CAR/CARPOOL; CARPOOL ≥ 2)'}),
        'emission_factors': (   'Factores de emisión vigentes por medio de transporte (g CO2/km por pasajero)',
                                {   'mode': 'Medio de transporte (PK)',
                                    'grams_per_km': 'Gramos de CO2 por kilómetro y pasajero',
                                    'valid_from': 'Inicio de vigencia del valor actual',
                                    'updated_by': 'Último SUPER_ADMIN que lo modificó (FK a users.id)'}),
        'vehicle_types': (   'Tipos de automóvil y su factor de emisión por vehículo, con fuente citada (APA)',
                             {   'code': 'Tipo de vehículo (PK): COMPACT, SEDAN, SUV, PICKUP, MINIVAN, HYBRID, '
                                         'ELECTRIC',
                                 'grams_per_km': 'Gramos de CO2 por kilómetro del vehículo completo',
                                 'max_occupants': 'Ocupantes máximos admitidos (1–8)',
                                 'is_active': 'Disponible para nuevos viajes',
                                 'source': 'Fuente del factor en formato APA o nota de estimación',
                                 'updated_at': 'Fecha y hora de la última modificación (UTC)'}),
        'transport_modes': (   'Configuración por medio de transporte (sin factor ni etiqueta)',
                               {   'mode': 'Medio de transporte (PK)',
                                   'max_speed_kmh': 'Velocidad media máxima plausible (km/h) para validar viajes',
                                   'is_active': 'Falso = no se aceptan viajes nuevos con este medio'}),
        'pois': (   'Puntos de interés (supertipo de la especialización EER disjunta y parcial)',
                    {   'id': 'Identificador UUID v4 (PK)',
                        'name': 'Nombre del punto de interés',
                        'category': 'Categoría: BIKE_PARKING, BIKE_SHARING, BUS_STOP, EV_CHARGER, REPAIR_STATION',
                        'description': 'Descripción libre (opcional)',
                        'attributes': 'Atributos no estructurados (source, osm_id, ref de OSM…); los '
                                      'estructurados viven en los subtipos',
                        'location': 'Ubicación: Point SRID 4326',
                        'is_active': 'Falso = borrado lógico',
                        'created_at': 'Fecha y hora de creación (UTC)',
                        'updated_at': 'Fecha y hora de la última modificación (UTC)'}),
        'transit_stops': (   'Subtipo de pois: paradas de autobús (category = BUS_STOP)',
                             {   'poi_id': 'PK y FK compuesta (poi_id, category) a pois',
                                 'category': 'Siempre BUS_STOP (garantiza la disyunción)',
                                 'code': 'Código oficial de parada asignado por un administrador (único, '
                                         'opcional)',
                                 'osm_ref': 'Etiqueta ref de OpenStreetMap (informativa, no única)'}),
        'bike_stations': (   'Subtipo de pois: estaciones y estacionamientos de bicicleta',
                             {   'poi_id': 'PK y FK compuesta (poi_id, category) a pois',
                                 'category': 'BIKE_SHARING o BIKE_PARKING (garantiza la disyunción)',
                                 'code': 'Código oficial de la estación (único, opcional)',
                                 'capacity': 'Número de lugares (1–10000, opcional)'}),
        'transit_lines': (   'Líneas de transporte público',
                             {   'id': 'Identificador UUID v4 (PK)',
                                 'code': 'Clave de la línea (única), p. ej. L55',
                                 'name': 'Nombre de la línea',
                                 'created_at': 'Fecha y hora de creación (UTC)'}),
        'stop_lines': (   'Relación N:M entre paradas y líneas',
                          {   'stop_id': 'Parada (PK compuesta, FK a transit_stops.poi_id)',
                              'line_id': 'Línea (PK compuesta, FK a transit_lines.id)'}),
        'cycleways': (   'Ciclovías (OpenStreetMap, ODbL)',
                         {   'id': 'Identificador UUID v4 (PK)',
                             'name': 'Nombre de la ciclovía (opcional)',
                             'is_protected': 'Verdadero si está segregada del tráfico',
                             'osm_id': 'Identificador del way de OpenStreetMap (único si existe)',
                             'geom': 'Trazado: LineString SRID 4326',
                             'created_at': 'Fecha y hora de creación (UTC)'}),
        'achievements': (   'Catálogo de logros de gamificación',
                            {   'id': 'Identificador UUID v4 (PK)',
                                'code': 'Código único en mayúsculas, p. ej. FIRST_TRIP',
                                'name': 'Nombre visible del logro',
                                'description': 'Descripción del logro',
                                'icon': 'Nombre del icono que muestran los clientes',
                                'criterion': 'Métrica evaluada: TRIPS_COUNT, DISTANCE_M, CO2_SAVED_G, '
                                             'DISTINCT_MODES',
                                'threshold': 'Valor que hay que alcanzar (> 0)',
                                'bonus_points': 'Puntos extra al obtenerlo (0–10000)',
                                'is_active': 'Falso = el logro ya no se otorga ni se muestra',
                                'created_at': 'Fecha y hora de creación (UTC)',
                                'updated_at': 'Fecha y hora de la última modificación (UTC)'}),
        'user_achievements': (   'Logros obtenidos por cada usuario (N:M users–achievements)',
                                 {   'id': 'Identificador UUID v4 (PK)',
                                     'user_id': 'Usuario (FK a users.id)',
                                     'achievement_id': 'Logro (FK a achievements.id); único por usuario',
                                     'bonus_points': 'Bono congelado al otorgarlo (editar el logro no altera '
                                                     'puntos ganados)',
                                     'awarded_at': 'Fecha en que se otorgó'}),
        'notifications': (   'Notificaciones in-app; se conservan 90 días',
                             {   'id': 'Identificador UUID v4 (PK)',
                                 'user_id': 'Destinatario (FK a users.id)',
                                 'type': 'ACHIEVEMENT_UNLOCKED, WEEKLY_SUMMARY o SYSTEM',
                                 'title': 'Título (máx. 120)',
                                 'body': 'Texto (máx. 500)',
                                 'data': 'Datos semiestructurados e inmutables del evento (JSONB justificado)',
                                 'read_at': 'Fecha de lectura; NULL si no se ha leído',
                                 'created_at': 'Fecha y hora de creación (UTC)'}),
        'citizen_reports': (   'Reportes ciudadanos sobre infraestructura y seguridad',
                               {   'id': 'Identificador UUID v4 (PK)',
                                   'reporter_id': 'Ciudadano que reporta (FK a users.id; NULL si borró su '
                                                  'cuenta)',
                                   'category': 'BIKE_LANE_DAMAGE, MISSING_INFRASTRUCTURE, SAFETY, POI_ISSUE u '
                                               'OTHER',
                                   'status': 'OPEN, IN_REVIEW, RESOLVED o REJECTED',
                                   'title': 'Título (3–120)',
                                   'description': 'Descripción (máx. 2000)',
                                   'location': 'Ubicación del problema: Point SRID 4326',
                                   'poi_id': 'Punto de interés relacionado (FK a pois.id, opcional)',
                                   'resolution_note': 'Nota del administrador al resolver',
                                   'created_at': 'Fecha y hora de creación (UTC)',
                                   'updated_at': 'Fecha y hora de la última modificación (UTC)'}),
        'reports': (   'Informes administrativos generados (CSV/PDF), sin datos personales',
                       {   'id': 'Identificador UUID v4 (PK)',
                           'report_type': 'Tipo de informe: overview, trips, users, co2_by_mode, co2_by_zone, …',
                           'format': 'csv o pdf',
                           'parameters': 'Parámetros usados (rango de fechas); JSONB justificado',
                           'row_count': 'Número de filas del informe',
                           'content': 'Contenido binario del archivo generado',
                           'created_by': 'Administrador que lo generó (FK a users.id)',
                           'created_at': 'Fecha y hora de creación (UTC)'}),
        'audit_logs': (   'Bitácora de auditoría de operaciones administrativas (append-only)',
                          {   'id': 'Identificador UUID v4 (PK)',
                              'actor_id': 'Usuario que realizó la acción (FK a users.id; NULL si se borró)',
                              'action': 'Acción en mayúsculas, p. ej. USER_ROLE_CHANGED',
                              'entity_type': 'Tipo de entidad afectada',
                              'entity_id': 'Identificador de la entidad afectada',
                              'payload': 'Detalle redactado (sin secretos ni coordenadas); JSONB justificado',
                              'created_at': 'Fecha y hora de creación (UTC)'})},
    "geo": {   'mobility_zones': (   'Zonas de análisis (municipios y AGEB del INEGI, zonas de ADMIN y zonas DEMO)',
                              {   'id': 'Identificador UUID v4 (PK)',
                                  'code': 'Clave única de la zona (CVEGEO del INEGI o código de ADMIN)',
                                  'name': 'Nombre de la zona',
                                  'kind': 'Tipo: colonia, ageb, municipio, distrito o custom',
                                  'geom': 'Polígono: MultiPolygon SRID 4326',
                                  'geom_utm': 'Polígono en UTM 14N (EPSG:32614) para cálculos métricos',
                                  'area_km2': 'Superficie en km²',
                                  'source': 'Fuente de la geometría, p. ej. INEGI-MG-2020 o DEMO',
                                  'is_demo': 'Verdadero = zona sintética de demostración; nunca se mezcla con '
                                             'datos oficiales',
                                  'created_at': 'Fecha y hora de creación (UTC)'}),
        'zone_census': (   'Población y vivienda del Censo 2020 (INEGI) por zona',
                           {   'zone_code': 'Zona (PK compuesta, FK a geo.mobility_zones.code)',
                               'source': 'Levantamiento (PK compuesta), p. ej. INEGI-CPV-2020',
                               'pobtot': 'Población total (NULL si INEGI la protege por confidencialidad)',
                               'tvivparhab': 'Viviendas particulares habitadas',
                               'vph_autom': 'Viviendas con automóvil o camioneta',
                               'vph_moto': 'Viviendas con motocicleta o motoneta',
                               'vph_bici': 'Viviendas con bicicleta como medio de transporte'})},
}


def _q(text: str | None) -> str:
    return "NULL" if text is None else "'" + text.replace("'", "''") + "'"


def _apply(clear: bool) -> None:
    for schema, tables in SCHEMAS.items():
        for table, (table_comment, columns) in tables.items():
            op.execute(f'COMMENT ON TABLE {schema}."{table}" IS {_q(None if clear else table_comment)}')
            for col, text in columns.items():
                op.execute(f'COMMENT ON COLUMN {schema}."{table}"."{col}" IS {_q(None if clear else text)}')


def upgrade() -> None:
    _apply(clear=False)


def downgrade() -> None:
    _apply(clear=True)
