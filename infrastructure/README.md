# Infraestructura

| Servicio | Imagen | Puerto (solo localhost) |
|---|---|---|
| `db` | `postgis/postgis:16-3.4` | 5432 (`POSTGRES_HOST_PORT` para cambiarlo) |
| `api` | build de `apps/api/Dockerfile` (ejecuta `alembic upgrade head` y arranca uvicorn) | 8000 |

```bash
cp .env.example .env              # y cambia todos los "change-me"
npm run infra:up                  # docker compose ... up -d --build
npm run infra:down
```

Solo la base de datos (para desarrollar la API con el venv local):

```bash
docker compose -f infrastructure/docker-compose.yml --env-file .env up -d db
```

Web y mobile se ejecutan fuera de Docker en desarrollo (`npm run dev:web`, `npm run dev:mobile`).
