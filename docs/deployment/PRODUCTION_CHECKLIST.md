# Checklist de producción

Recórrelo antes de anunciar el sitio. Cada casilla se comprueba en el VPS real; en el repositorio
solo se validó localmente lo indicado en «Qué se probó» al final.

## Servidor

- [ ] Ubuntu Server 24.04 LTS actualizado; `unattended-upgrades` activo
- [ ] `ufw status`: solo SSH (limit), 80 y 443
- [ ] SSH: sin root, sin contraseñas, solo usuario `ecomove` (`sudo sshd -T | grep -E 'permitrootlogin|passwordauthentication'`)
- [ ] `fail2ban-client status` muestra `sshd`, `nginx-limit-req`, `nginx-botsearch`
- [ ] Swap configurada si RAM ≤ 4 GB
- [ ] Acceso a la consola web del proveedor probado (por si SSH falla)

## Dominio y HTTPS

- [ ] `midominio.mx`, `www` y `api` resuelven a la IP del VPS
- [ ] Certificado válido para los tres nombres; `sudo certbot renew --dry-run` sin errores
- [ ] HTTP → HTTPS (301); `www` → dominio principal
- [ ] Cabeceras `strict-transport-security`, `x-content-type-options`, `x-frame-options` presentes
- [ ] Peticiones a la IP directa o a un host desconocido no sirven la aplicación

## Configuración y secretos

- [ ] `.env.production` con permisos 600, sin `change-me`, fuera de Git
- [ ] Copia de `.env.production` en un gestor de contraseñas
- [ ] `API_ENV=production`, `ENABLE_DOCS=false`
- [ ] `CORS_ORIGINS` solo con `https://midominio.mx`
- [ ] `NEXT_PUBLIC_API_BASE_URL=https://api.midominio.mx/api/v1`
- [ ] `EMAIL_BACKEND=smtp` y SMTP probado (o asumido que no hay recuperación de contraseña)
- [ ] `BOOTSTRAP_SUPER_ADMIN_PASSWORD` vacío tras crear el primer administrador
- [ ] Segundo administrador creado

## Aplicación

- [ ] `infrastructure/scripts/status.sh`: `db`, `api`, `web` *healthy*
- [ ] `https://api.midominio.mx/api/v1/health` → `database: ok`
- [ ] `dc run --rm migrate current` en la última revisión
- [ ] Registro, login, mapa y panel de administración probados a mano en el navegador
- [ ] Rol de BD de la app sin superusuario (`rolsuper = f`, ver DATABASE_SETUP.md)
- [ ] Datos OSM importados si se usan (DATABASE_SETUP.md)

## Backups

- [ ] `ecomove-backup.timer` activo (`systemctl list-timers`)
- [ ] Al menos un backup verificado (`backup.sh --verify`)
- [ ] Copia externa configurada (`BACKUP_RCLONE_REMOTE`)
- [ ] Restauración ensayada (idealmente en otro servidor)

## Android

- [ ] Build `production` apunta a `https://api.midominio.mx/api/v1`
- [ ] APK probado en un dispositivo real contra producción
- [ ] Keystore de firma guardado fuera del VPS (EAS o copia propia)
- [ ] Requisitos de Google Play revisados (política de privacidad, ficha, permisos de ubicación)

## Monitorización

- [ ] Monitor externo de disponibilidad sobre `/api/v1/health` y la web
- [ ] Alerta de espacio en disco y de caducidad de certificado
- [ ] Alguien revisa `status.sh` / logs con regularidad

## Riesgos pendientes

Detectados al preparar el despliegue y **no corregidos** (no eran parte del encargo o requieren
decisión del propietario):

| ID | Riesgo | Impacto | Mitigación propuesta |
|---|---|---|---|
| R1 | Límite de logins web por IP depende de la cadena Nginx → BFF → API | El BFF (`apps/web/src/lib/bff.ts`) ya reenvía la IP de `X-Real-IP` (la fija Nginx); si se cambia el proxy y deja de enviarla, todos los logins web compartirían el límite | Mantener `ecomove-proxy.conf` tal cual; tras desplegar, comprobar que un 429 en un navegador no afecta a otro |
| R2 | `FORWARDED_ALLOW_IPS="*"` en la API | Seguro solo mientras la API solo escuche en `127.0.0.1` y la red Docker | No publicar nunca el puerto de la API fuera de localhost |
| R3 | Límite de peticiones en memoria con un único worker | Se reinicia al reiniciar la API; no escala a varias réplicas | Redis u otro almacén compartido si se escala |
| R4 | `EMAIL_BACKEND=disabled` por defecto | Sin verificación de correo ni recuperación de contraseña | Configurar SMTP |
| R5 | Nominatim y teselas CARTO públicos | Políticas de uso limitado; posible bloqueo con tráfico alto | Proveedor propio o de pago si crece el uso |
| R6 | Grupo `docker` = root | Comprometer `ecomove` = comprometer el VPS | Proteger su clave SSH; no añadir más usuarios al grupo |
| R7 | Backups solo locales hasta configurar rclone | Perder el VPS = perder los backups | Configurar `BACKUP_RCLONE_REMOTE` |
| R8 | CSP de la web con `'unsafe-inline'` (ya existía) | Menor protección frente a XSS | Nonces/hashes en Next.js |
| R9 | La imagen web se compila en el VPS | Picos de RAM/CPU durante el despliegue | Construir en CI y publicar en un registro |
| R10 | Sin monitorización externa | Caídas sin aviso | UptimeRobot, Healthchecks.io o similar |
| R11 | Pruebas que fallaban al validar este trabajo (otros módulos; pueden haberse corregido después): `tests/geo/test_geo_integration.py::test_priority_endpoint_is_explainable` (API) y `tests/login-form.test.tsx` (web) | CI de la aplicación en rojo | Corregir en sus módulos |

## Qué se probó (localmente, sin VPS)

- Imágenes `api` y `web` construidas; `docker compose config` del entorno de producción válido.
- Despliegue completo con `deploy.sh` en local (dominio de prueba, puertos alternativos): migraciones
  con rol sin superusuario, contenedores *healthy*, usuario 10001, sistema de archivos de solo lectura,
  puertos solo en `127.0.0.1`, BD sin salida a Internet, `/docs` en 404, login del SUPER_ADMIN inicial.
- `backup.sh` + `--verify` y `restore.sh` (restauración de datos comprobada), `status.sh`, `logs.sh`,
  `deploy.sh --rollback`.
- `nginx -t` de las plantillas (bootstrap y completa) con Nginx 1.24 y un certificado autofirmado.
- `bash -n` y `shellcheck` sin avisos en todos los scripts.
- Configuración Expo de producción: acepta `https://`, rechaza `http://`.

**No probado:** emisión real de certificados, DNS, UFW/fail2ban/SSH en un Ubuntu real,
`install_vps.sh` completo, builds EAS (APK/AAB), workflows de GitHub Actions en GitHub.
