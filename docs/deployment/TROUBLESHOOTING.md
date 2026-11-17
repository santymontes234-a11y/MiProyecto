# Solución de problemas

Primero siempre:

```bash
cd /opt/ecomove
infrastructure/scripts/status.sh          # contenedores, salud, certificado, backup, recursos
infrastructure/scripts/logs.sh errors     # errores de la última hora
infrastructure/scripts/logs.sh api -f     # API en vivo (Ctrl+C para salir)
sudo infrastructure/scripts/logs.sh nginx
```

## El sitio no carga

| Síntoma | Causa probable | Solución |
|---|---|---|
| Tiempo de espera agotado | DNS o firewall | `dig +short midominio.mx`; `sudo ufw status`; firewall del panel del proveedor |
| `502 Bad Gateway` | Contenedor caído o arrancando | `status.sh`; `logs.sh web`/`api`; `dc up -d api web` |
| `503 configurando HTTPS` | Sigue la config bootstrap | Emite el certificado y `configure_nginx.sh --full` |
| `504 Gateway Timeout` | Consulta lenta | `logs.sh api`; consultas lentas en `logs.sh db`; ampliar `proxy_read_timeout` del location |
| `429 Too Many Requests` | Límite de Nginx o de la API | Normal ante abuso. Si afecta a usuarios legítimos (p. ej. una red con IP compartida), sube `rate`/`burst` en `ecomove-http.conf` |
| Error de certificado | Caducado o nombre que falta | `sudo certbot certificates`; `sudo certbot renew`; ¿están los 3 nombres en el certificado? |

## Docker / despliegue

| Error | Solución |
|---|---|
| `Quedan valores 'change-me'` | Ejecuta `generate_secrets.sh` o edita `.env.production` |
| `permission denied ... docker.sock` | El usuario no está en el grupo docker: `sudo usermod -aG docker ecomove` y vuelve a entrar |
| `migrate` termina con error | `dc logs migrate`. Si es de conexión: contraseña del rol (DATABASE_SETUP.md §5). Si es de SQL: no fuerces; restaura o corrige la migración |
| `JWT_SECRET_KEY de ejemplo no permitido` / `ROUTE_TOKEN_SECRET es obligatorio` | Validación de producción de la API: rellena esos secretos |
| `password authentication failed for user "ecomove_app"` | Cambiaste `POSTGRES_PASSWORD` después de crear el volumen: aplica el `ALTER ROLE` (DATABASE_SETUP.md §5) |
| El build de `web` muere (`Killed`, código 137) | Falta RAM: comprueba swap (`swapon --show`), cierra OSRM durante el build o usa un VPS de 4 GB |
| `no space left on device` | `docker system df`; `docker image prune -a` (borra imágenes sin usar: perderás versiones de rollback); revisa backups antiguos |
| `Falta --build-arg NEXT_PUBLIC_API_BASE_URL` | Define `NEXT_PUBLIC_API_BASE_URL` en `.env.production` |

## API

| Síntoma | Solución |
|---|---|
| `/api/v1/health` → `{"database":"error"}` | `dc ps db`; `logs.sh db`; espacio en disco |
| El navegador muestra error de CORS | `CORS_ORIGINS` debe contener exactamente `https://midominio.mx` (sin `/` final) y recrear la API |
| Todos los usuarios ven «demasiados intentos» al iniciar sesión en la web | La IP real no llega a la API: comprobar que Nginx envía `X-Real-IP` (`ecomove-proxy.conf`); ver R1 en PRODUCTION_CHECKLIST.md |
| No llegan los correos | `EMAIL_BACKEND=smtp`, credenciales SMTP, puerto 587 abierto de salida; `logs.sh api | grep correo` |
| `422` al crear el administrador o iniciar sesión | El correo debe tener un dominio real: `.test`, `.local` o `.example` se rechazan |
| La geocodificación falla | Nominatim limita el uso; revisa `GEOCODING_USER_AGENT` o usa un Nominatim propio (`NOMINATIM_URL`) |

## Base de datos

```bash
dc exec db psql -U ecomove_admin -d ecomove      # consola (alias dc en DATABASE_SETUP.md)
dc exec db pg_isready
```

Si el contenedor `db` no arranca tras una actualización de imagen mayor, vuelve a la etiqueta anterior en el
compose y sigue el procedimiento de actualización mayor (DATABASE_SETUP.md §5).

## SSH

- «Permission denied (publickey)»: estás usando otra clave (`ssh -i ~/.ssh/id_ed25519 ecomove@IP`) o el usuario
  no está en `AllowUsers`.
- Te quedaste fuera: usa la consola web/VNC del proveedor y elimina
  `/etc/ssh/sshd_config.d/99-ecomove-hardening.conf`.
- fail2ban te bloqueó: `sudo fail2ban-client set sshd unbanip TU.IP` desde la consola del proveedor.

## Android

- La app no conecta: la URL compilada debe ser `https://api.midominio.mx/api/v1`; comprueba la API con
  `curl` desde el móvil (navegador) y que el certificado sea válido (Android rechaza autofirmados).
- Error al compilar «Build de producción: define EXPO_PUBLIC_API_BASE_URL con https://»: falta la variable de
  EAS o no empieza por `https://` (ANDROID_BUILD.md).
