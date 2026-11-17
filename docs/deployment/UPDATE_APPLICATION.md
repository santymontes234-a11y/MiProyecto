# Actualizar la aplicación

## Actualización normal (en el VPS)

```bash
ssh ecomove@IP
cd /opt/ecomove
git fetch && git log --oneline HEAD..origin/main     # qué cambia
infrastructure/scripts/deploy.sh --pull
```

`deploy.sh --pull` hace, en orden y mostrando cada paso:

1. Comprueba Docker y `.env.production` (sin `change-me`, dominio real).
2. `git pull --ff-only` (falla si hay cambios locales o historias divergentes: no fusiona nada a ciegas).
3. Etiqueta = commit corto (`-dirty` si hay cambios sin commit).
4. **Backup de la BD** `pre-deploy-<tag>` (sáltalo solo con `--skip-backup`).
5. `docker compose build api web` → `ecomove/api:<tag>`, `ecomove/web:<tag>`. La web en producción sigue
   sirviendo mientras se construye.
6. `up --wait db` → `run --rm migrate` (`alembic upgrade head`).
7. `up -d --wait api web`: Compose recrea los contenedores con la imagen nueva (corte de unos segundos).
8. Comprueba `/api/v1/health` y la web; guarda la etiqueta en `.deploy/current` y `.deploy/history`.
9. Conserva las 4 versiones anteriores de las imágenes para rollback y borra las más viejas.

Si un paso falla, el script se detiene y muestra los últimos logs. Los contenedores que ya estaban en marcha
siguen funcionando salvo que el fallo sea posterior al paso 7 (en ese caso: ROLLBACK.md).

Desplegar una versión concreta:

```bash
git fetch --tags && git checkout v1.2.0      # tag, rama o commit
infrastructure/scripts/deploy.sh
```

## Cambios que requieren atención

| Cambio | Qué hacer |
|---|---|
| Nuevas variables de entorno | Añádelas a `.env.production` antes de desplegar (compara con `.env.production.example`: `diff <(cut -d= -f1 .env.production.example \| sort) <(cut -d= -f1 .env.production \| sort)`) |
| Cambio de dominio | `.env.production` (`DOMAIN`, `API_DOMAIN`, `CORS_ORIGINS`, `WEB_URL`, `NEXT_PUBLIC_*`), certificado nuevo, `configure_nginx.sh --full`, `deploy.sh` y **nuevo build Android** |
| Plantillas Nginx | `sudo infrastructure/scripts/configure_nginx.sh --full` |
| Migraciones destructivas | Backup completo manual (`backup.sh --tag antes-vX`) y ventana de mantenimiento |
| Cambio en `docker-compose.prod.yml` | `deploy.sh` lo aplica (`--remove-orphans` elimina servicios retirados) |

## Ubuntu y Docker

```bash
sudo apt update && sudo apt upgrade -y        # las de seguridad ya se instalan solas
[ -f /var/run/reboot-required ] && echo "Hace falta reiniciar"
sudo reboot                                   # los contenedores vuelven solos (restart: unless-stopped)
infrastructure/scripts/status.sh              # tras el reinicio
```

Imágenes base (PostGIS, Python, Node): `deploy.sh` reconstruye con las versiones vigentes de las etiquetas
del Dockerfile. Para forzar descargar las últimas: `docker compose -f infrastructure/docker-compose.prod.yml
--env-file .env.production build --pull api web` y luego `deploy.sh`. Dependabot propone PRs semanales.

## Despliegue desde GitHub Actions (opcional, deshabilitado)

`.github/workflows/deploy.yml` hace lo mismo por SSH, pero solo si configuras **todo** lo siguiente:

1. En el VPS, una clave SSH **dedicada** para GitHub en `~ecomove/.ssh/authorized_keys`
   (recomendado: `command="..."` o `from="..."` restringidos).
2. GitHub → Settings → Environments → `production` con **Required reviewers**.
3. Secretos del environment: `VPS_HOST`, `VPS_USER`, `VPS_SSH_PORT`, `VPS_SSH_KEY`, `VPS_APP_DIR`,
   `VPS_KNOWN_HOSTS` (salida de `ssh-keyscan -p 22 IP`; impide ataques de intermediario).
4. Variable del repositorio `DEPLOY_ENABLED=true`.
5. Ejecutarlo a mano (Actions → Deploy (manual) → Run workflow) escribiendo `DESPLEGAR`.

Sin esos pasos el job se omite.
