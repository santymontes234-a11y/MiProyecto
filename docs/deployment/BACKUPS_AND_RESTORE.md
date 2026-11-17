# Backups y restauración

## Qué datos hay que proteger

| Dato | Dónde vive | Cómo se respalda |
|---|---|---|
| Base de datos (usuarios, viajes, puntos, informes, auditoría, geodatos) | volumen Docker `ecomove_prod_pgdata` | `pg_dump` → `db.dump` |
| Roles de PostgreSQL | mismo volumen | `pg_dumpall --globals-only` → `globals.sql.gz` |
| Secretos y configuración | `.env.production`, `/etc/nginx/...`, `/etc/letsencrypt`, fail2ban, SSH, `.deploy/` | `config.tar.gz` |
| Archivos subidos | **ninguno**: la aplicación no guarda archivos en disco (los informes se generan al vuelo) | `files.tar.gz` solo si defines `BACKUP_EXTRA_PATHS` |
| Datos OSRM | volumen `ecomove_prod_osrm_data` | No se respaldan: se regeneran desde OpenStreetMap |

> `globals.sql.gz` y `config.tar.gz` contienen **secretos** (hashes de contraseñas, `.env.production`, claves
> privadas TLS). Trata cada backup como material confidencial.

## backup.sh

```bash
cd /opt/ecomove
sudo infrastructure/scripts/backup.sh                    # completo (root para leer /etc/letsencrypt)
infrastructure/scripts/backup.sh --db-only               # solo BD (lo hace deploy.sh antes de cada despliegue)
infrastructure/scripts/backup.sh --tag antes-de-cambio   # etiqueta en el nombre de la carpeta
infrastructure/scripts/backup.sh --verify /var/backups/ecomove/20261120-031500
```

Pasos que ejecuta:

1. Bloqueo (`flock`) para que no corran dos backups a la vez.
2. Carpeta `BACKUP_DIR/AAAAMMDD-HHMMSS[-tag]/` con permisos 700 (`umask 077`).
3. `pg_dump --format=custom --compress=6` como administrador, dentro del contenedor `db`.
4. `pg_dumpall --globals-only | gzip`.
5. `tar -czf config.tar.gz` de la configuración (omite lo que no pueda leer y avisa).
6. `MANIFEST.txt` (commit, revisión Alembic, versión de PostgreSQL) y `SHA256SUMS`.
7. **Verificación**: sumas SHA-256, `pg_restore --list` del dump completo, `gzip -t`, `tar -t`.
8. **Retención**: borra carpetas con más de `BACKUP_RETENTION_DAYS` días (14 por defecto).
9. **Copia externa**: si `BACKUP_RCLONE_REMOTE` está definido, `rclone copy --immutable`.

Si algo falla, la carpeta incompleta se borra y el script termina con error.

## Backup diario automático

`install_vps.sh` instaló `ecomove-backup.service` (corre como root) y `ecomove-backup.timer` (03:15 UTC ± 10 min).

```bash
sudo systemctl enable --now ecomove-backup.timer
systemctl list-timers ecomove-backup.timer
sudo systemctl start ecomove-backup.service      # ejecutarlo ya
journalctl -u ecomove-backup.service -n 50       # ver el resultado
```

`status.sh` avisa si el último backup tiene más de 26 horas.

## Copia externa (muy recomendable)

Un backup en el mismo VPS no sirve si se pierde el VPS. Opciones:

### rclone (Backblaze B2, S3, Wasabi, Google Drive…)

```bash
sudo apt install -y rclone
sudo rclone config                # crea un remoto, p. ej. "b2" (usa una clave con permiso solo de escritura)
sudo rclone lsd b2:               # comprueba el acceso
# En .env.production:
BACKUP_RCLONE_REMOTE=b2:ecomove-backups
```

Recomendaciones: bucket privado con **versionado/retención de objetos** activado (protege frente a borrados o
ransomware), región distinta de la del VPS y regla de ciclo de vida (p. ej. 90 días). Para cifrar en el cliente,
crea un remoto `crypt` de rclone encima del bucket.

### Copiar a tu computadora

```bash
# Desde TU computadora
rsync -av --progress ecomove@IP:/var/backups/ecomove/ ./ecomove-backups/
```

(Requiere que `ecomove` pueda leer la carpeta: por defecto es de root con 700. Cópiala antes con sudo a una
carpeta temporal o usa rclone.)

## Restauración — restore.sh

```bash
ls -1 /var/backups/ecomove/
infrastructure/scripts/restore.sh /var/backups/ecomove/20261120-031500
infrastructure/scripts/restore.sh /var/backups/ecomove/20261120-031500 --config   # además extrae la configuración
```

Pasos:

1. Arranca `db` si no lo está y **verifica** el backup (igual que `--verify`).
2. Pide escribir `RESTAURAR`.
3. Hace un backup de seguridad del estado actual (`-pre-restore`), salvo `--no-safety-backup`.
4. Detiene `api` y `web`.
5. `DROP DATABASE ... WITH (FORCE)`, `CREATE DATABASE ... OWNER <rol app>` y `pg_restore --exit-on-error`
   como administrador (conserva dueños y extensiones).
6. `alembic upgrade head` (por si el backup es de una versión anterior del esquema).
7. Arranca `api` y `web` y comprueba `/api/v1/health`.

Con `--config`, la configuración se extrae a `restore-config-<fecha>/` dentro del repositorio para revisarla y
copiarla **a mano** (nunca sobrescribe `/etc`). Bórrala al terminar: contiene secretos.

### Restaurar en un VPS nuevo (desastre)

1. Prepara el VPS (VPS_SETUP.md) y clona el repositorio.
2. Recupera `.env.production` del `config.tar.gz` (`tar -xzf config.tar.gz -C /tmp/r` → `/tmp/r/opt/ecomove/.env.production`)
   y cópialo a `/opt/ecomove/.env.production` (chmod 600). Así los roles se crean con las mismas contraseñas.
3. `infrastructure/scripts/deploy.sh` (crea la BD vacía y migra).
4. `infrastructure/scripts/restore.sh <backup>`.
5. Restaura certificados (`/etc/letsencrypt` del tar) o emite nuevos (HTTPS_SETUP.md) y `configure_nginx.sh --full`.
6. Apunta el DNS a la nueva IP.

## Prueba de restauración

Haz una restauración de prueba **al menos una vez al mes** (en un VPS de pruebas o en local con
`docker-compose.prod.yml` y otro `ENV_FILE`). Un backup que nunca se ha restaurado no está probado.

Probado en local en esta preparación: backup completo → cambio de datos → `restore.sh` → los datos volvieron al
estado del backup, dueño de la BD = rol de la aplicación, API sana.
