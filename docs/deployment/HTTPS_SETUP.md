# HTTPS con Nginx y Let's Encrypt

Nginx corre en el **host** (no en Docker) para que certbot, fail2ban y UFW trabajen sobre él directamente.
Plantillas: `infrastructure/nginx/`. Se instalan con `infrastructure/scripts/configure_nginx.sh`.

## Qué se instala

| Archivo en el VPS | Origen | Contenido |
|---|---|---|
| `/etc/nginx/conf.d/ecomove-http.conf` | `nginx/conf.d/` | `server_tokens off`, tiempos, `client_max_body_size 1m`, zonas de rate limit, formato de log |
| `/etc/nginx/snippets/ecomove-ssl.conf` | `nginx/snippets/` | TLS 1.2/1.3, cifrados «intermediate» de Mozilla |
| `/etc/nginx/snippets/ecomove-security-headers.conf` | | HSTS, nosniff, X-Frame-Options (sin duplicar las de la app) |
| `/etc/nginx/snippets/ecomove-proxy.conf` | | Cabeceras `X-Forwarded-*`, buffers |
| `/etc/nginx/snippets/ecomove-acme.conf` | | `/.well-known/acme-challenge/` → `/var/www/certbot` |
| `/etc/nginx/sites-available/ecomove.conf` | `nginx/sites/*.template` | Los sitios, con tu dominio sustituido |

### Comportamiento del sitio completo

- Puerto 80: solo sirve el desafío ACME y redirige todo lo demás a HTTPS (301).
- `www.midominio.mx` → 301 a `https://midominio.mx`.
- Host desconocido (escáneres que entran por IP): HTTP responde 444 y HTTPS rechaza el handshake.
- Límites por IP: web 20 req/s (ráfaga 60), API 15 req/s (ráfaga 40), login/registro/recuperación 20 req/min
  (además del límite propio de la API, 10/min), 30–40 conexiones simultáneas. Exceso → `429`.
- Tiempos: 60 s hacia los contenedores; 180 s en `/api/v1/admin/` (informes grandes).
- Cuerpo máximo: 1 MB (igual que la API).
- **WebSockets:** la aplicación no los usa. El proxy ya reenvía `Upgrade`/`Connection` por si se añaden.

## Paso a paso

Requisitos: DNS propagado (DOMAIN_AND_DNS.md), `install_vps.sh` ejecutado, `.env.production` con
`DOMAIN` y `API_DOMAIN` reales.

### 1. Configuración temporal (solo HTTP)

```bash
cd /opt/ecomove
sudo infrastructure/scripts/configure_nginx.sh --bootstrap
curl -I http://midominio.mx/   # debe responder 503 "configurando HTTPS"
```

### 2. Emitir el certificado (uno para los tres nombres)

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d midominio.mx -d www.midominio.mx -d api.midominio.mx \
  --cert-name midominio.mx \
  --email tu-correo@ejemplo.com --agree-tos --no-eff-email
```

Antes, si quieres probar sin gastar intentos (Let's Encrypt limita a 5 fallos/hora), añade `--staging`; luego
repite sin `--staging` y con `--force-renewal`.

Los archivos quedan en `/etc/letsencrypt/live/midominio.mx/` (`fullchain.pem`, `privkey.pem`).

### 3. Configuración completa (HTTPS)

```bash
sudo infrastructure/scripts/configure_nginx.sh --full
```

El script ejecuta `nginx -t` antes de recargar y, si falla, restaura la configuración anterior.

### 4. Renovación automática

El paquete `certbot` instala un timer de systemd que renueva dos veces al día los certificados a los que
les quedan menos de 30 días. `install_vps.sh` añadió un hook que recarga Nginx tras renovar.

```bash
systemctl list-timers certbot.timer
sudo certbot renew --dry-run
```

### 5. Verificar

```bash
curl -I https://midominio.mx/                       # 200, cabecera strict-transport-security
curl -I http://midominio.mx/                        # 301 → https
curl -I https://www.midominio.mx/                   # 301 → https://midominio.mx/
curl -s https://api.midominio.mx/api/v1/health      # {"status":"ok","database":"ok"}
echo | openssl s_client -connect api.midominio.mx:443 -servername api.midominio.mx 2>/dev/null | openssl x509 -noout -dates -subject
```

Prueba externa opcional: https://www.ssllabs.com/ssltest/ (debería dar A o A+).

## Notas

- **HSTS:** se envía `max-age=2 años; includeSubDomains` sin `preload`. Añade `preload` (en el snippet) solo
  si todos los subdominios del dominio, presentes y futuros, van por HTTPS.
- **Nginx 1.24** (Ubuntu 24.04) usa la sintaxis `listen 443 ssl http2`. En Nginx ≥ 1.25 da un aviso
  inofensivo de obsolescencia.
- Let's Encrypt ya no ofrece OCSP, por eso no se activa `ssl_stapling`.
- No edites `/etc/nginx/sites-available/ecomove.conf` en el VPS: cambia la plantilla del repositorio y
  ejecuta otra vez `configure_nginx.sh --full`.
