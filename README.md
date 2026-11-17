# EcoMove Querétaro

**Cada viaje cuenta.**

EcoMove es una plataforma para registrar y analizar la movilidad sostenible en el estado de Querétaro. Muestra a cada usuario el CO₂ que evita con sus viajes a pie, en bicicleta, en transporte público o en auto compartido, y ofrece a la administración estadísticas y análisis espaciales con datos de OpenStreetMap y del INEGI. El proyecto se alinea con los ODS 9, 11, 12 y 15.

| Carpeta | Contenido |
|---|---|
| `apps/api` | Backend: FastAPI, PostgreSQL 16 + PostGIS 3.4 y migraciones Alembic |
| `apps/web` | Panel web (usuario y administración) |
| `apps/mobile` | App Android/iOS (Expo) |
| `packages/shared` | Tipos TypeScript del contrato de la API |
| `database/` | Entregable ABD: esquema, datos de ejemplo y consultas SQL ([README](database/README.md)) |
| `docs/` | Contrato de la API, arquitectura, seguridad, BD e informe ([`docs/report/`](docs/report/)) |
| `infrastructure/` | Docker Compose (BD, API y ruteo OSRM opcional) |

## Cómo ejecutar la demo

### 1. Requisitos

- Docker con Docker Compose.
- Node.js 20 o superior, solo para la web y para compilar la app.
- Un teléfono Android en la misma red Wi-Fi que el PC, para usar el APK.

### 2. Levantar la base de datos y la API

```bash
cp .env.example .env
```

Edita `.env` y cambia todos los valores `change-me`. Define además:

- `BOOTSTRAP_SUPER_ADMIN_EMAIL` y `BOOTSTRAP_SUPER_ADMIN_PASSWORD` (12 caracteres o más) para crear tu cuenta de SUPER_ADMIN.
- `API_PUBLISH_HOST=0.0.0.0` si vas a probar con un teléfono en la LAN.

Después, levanta la infraestructura:

```bash
npm install
npm run infra:up
```

`infra:up` construye la API, aplica todas las migraciones (esquema, catálogos y factores) y la publica en `http://localhost:8000`. Para comprobar que funciona:

- Salud: `http://localhost:8000/api/v1/health`.
- Documentación: `http://localhost:8000/api/v1/docs`.

Opcional: para que `/routes` calcule rutas reales con OSRM (unos 700 MB de descarga la primera vez):

```bash
docker compose -f infrastructure/docker-compose.yml --env-file .env --profile routing up -d
```

### 3. Cargar los datos de la demo

Los POIs, las ciclovías y las zonas reales se importan desde OSM e INEGI con los comandos de `docs/report/DATASETS.md`. Los usuarios y viajes de ejemplo se cargan con un script idempotente:

```bash
docker compose -f infrastructure/docker-compose.yml --env-file .env exec -T db psql -v ON_ERROR_STOP=1 -U ecomove -d ecomove < database/demo_seed.sql
```

Si cambiaste `POSTGRES_USER` o `POSTGRES_DB` en `.env`, usa esos valores en lugar de `ecomove`.

**Cuentas de ejemplo.** Todas son ficticias y usan la contraseña `EcoMove-Demo-2026`:

| Rol | Correo |
|---|---|
| SUPER_ADMIN | `sofia.ramirez@ejemplo.mx` |
| ADMIN | `diego.hernandez@ejemplo.mx` |
| USER, con historial, logros y ranking | `ana.garcia@ejemplo.mx` |

### 4. Web

```bash
npm run dev:web     # http://localhost:3000
```

### 5. App móvil (APK)

1. En `apps/mobile/.env`, define `EXPO_PUBLIC_API_BASE_URL=http://<IP-LAN-de-tu-PC>:8000/api/v1`.
2. Compila el APK con `cd apps/mobile && npm run build:apk`, que usa EAS. El detalle está en `apps/mobile/README.md`.
3. Instala el APK en el teléfono, conectado a la misma Wi-Fi, e inicia sesión con una cuenta de ejemplo.

### 6. Entregable de base de datos (ABD)

Los scripts SQL se ejecutan en una BD independiente (`ecomove_abd`), siguiendo [`database/README.md`](database/README.md):

- `01_esquema.sql`: 25 tablas.
- `02_datos_ejemplo.sql`: datos de ejemplo.
- `03_consultas.sql`: 24 consultas.
- `04_consultas_espaciales.sql`: 14 consultas espaciales del módulo geo, que se ejecutan sobre la BD de la demo.

La documentación del modelo está en `docs/report/`:

- `NORMALIZACION.md`.
- `DICCIONARIO_DATOS.md`.
- `diagramas/MER.svg` y `diagramas/EER.svg`.

## Datos y licencias

- **Mapa:** © OpenStreetMap contributors, bajo licencia ODbL 1.0.
- **Zonas y población:** INEGI, Marco Geoestadístico y Censo de Población y Vivienda 2020.
- **Factores por tipo de vehículo:** U.S. EPA (2026).

Todas las cifras de CO₂ son estimaciones.
