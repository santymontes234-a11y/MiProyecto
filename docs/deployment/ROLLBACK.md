# Rollback (volver a la versión anterior)

## 1. Rollback de código (imágenes)

`deploy.sh` etiqueta cada despliegue con el commit y conserva las 4 versiones anteriores.

```bash
cd /opt/ecomove
cat .deploy/history                                  # fecha, etiqueta, commit
docker image ls ecomove/api                          # etiquetas disponibles
infrastructure/scripts/deploy.sh --rollback          # a la anterior a la actual
infrastructure/scripts/deploy.sh --rollback 3f2a9c1d0b7e   # a una concreta
```

Arranca `api` y `web` con esas imágenes (`--no-deps`, sin reconstruir ni migrar), comprueba la salud y lo
anota en `.deploy/history`. Tarda segundos.

Para que el siguiente `deploy.sh` no vuelva a la versión mala, deja el repositorio en el commit bueno:
`git checkout <commit-bueno>` (o revierte el commit en `main`).

## 2. ¿Y la base de datos?

El rollback de imágenes **no revierte migraciones**. Funciona si la versión anterior del código es compatible
con el esquema nuevo (lo normal cuando la migración solo añade tablas/columnas). Si no lo es:

### Opción A — restaurar el backup previo al despliegue (recomendada)

```bash
ls -d /var/backups/ecomove/*pre-deploy*
infrastructure/scripts/deploy.sh --rollback <tag-anterior>
infrastructure/scripts/restore.sh /var/backups/ecomove/<fecha>-pre-deploy-<tag-malo>
```

Se pierde lo escrito entre el despliegue y la restauración (restore.sh guarda antes un backup `pre-restore`
por si hay que recuperar algo a mano).

### Opción B — `alembic downgrade` (solo si sabes lo que haces)

```bash
dc run --rm migrate history                    # revisiones (alias dc en DATABASE_SETUP.md)
infrastructure/scripts/backup.sh --db-only --tag antes-downgrade
dc run --rm migrate downgrade <revision-destino>
infrastructure/scripts/deploy.sh --rollback <tag-anterior>
```

Revisa antes el `downgrade()` de cada migración: puede borrar columnas o tablas con datos.

## 3. Rollback de configuración

- **Nginx**: `configure_nginx.sh` guarda la configuración anterior en `/tmp/ecomove-nginx-prev.*` y la restaura
  sola si `nginx -t` falla. Para volver a la plantilla del repositorio: `git checkout <commit> --
  infrastructure/nginx && sudo infrastructure/scripts/configure_nginx.sh --full`.
- **`.env.production`**: está en cada `config.tar.gz`. `generate_secrets.sh --force` deja una copia `.bak.*`.
- **SSH**: `sudo rm /etc/ssh/sshd_config.d/99-ecomove-hardening.conf && sudo systemctl reload ssh`
  (desde la consola web del proveedor si te quedaste fuera).

## 4. Probado

En local se probó `deploy.sh --rollback <tag>`: cambió la imagen de `api`/`web`, salud correcta y registro en
el historial. Sin despliegue anterior, el script se niega con un mensaje claro.
