# Requisitos del VPS

## Sistema operativo

**Ubuntu Server 24.04 LTS (64 bits, x86_64 o arm64).** Es el único probado con la configuración de Nginx
del repositorio (Nginx 1.24). Ubuntu 22.04 trae Nginx 1.18, que **no** soporta `ssl_reject_handshake`;
si tuvieras que usarlo, instala Nginx desde nginx.org o elimina el bloque `default_server` de 443.

## Especificaciones

| Escenario | vCPU | RAM | Disco | Notas |
|---|---|---|---|---|
| Mínimo (pruebas, pocos usuarios) | 2 | 2 GB + 2 GB swap | 40 GB SSD | Construir la imagen web tarda más; sin ruteo OSRM |
| **Recomendado** | 2–4 | **4 GB** | 60–80 GB SSD/NVMe | Holgura para builds, backups y crecimiento |
| Con ruteo OSRM (`--with-routing`) | 4 | 8 GB | 80 GB | OSRM prepara 3 perfiles (~2 GB RAM, ~1 GB disco) |

Por qué: el build de Next.js consume ~1,5 GB de RAM durante unos minutos; PostgreSQL está limitado a 1 GB
(`DB_MEMORY_LIMIT`), la API y la web a 512 MB cada una. Los backups se guardan en el mismo disco
(`/var/backups/ecomove`, 14 días) y deben copiarse fuera (ver BACKUPS_AND_RESTORE.md).

## Red

- IPv4 pública fija (IPv6 opcional; Nginx ya escucha en ambas).
- Puertos entrantes: **22/tcp** (SSH, o el que elijas), **80/tcp** y **443/tcp**. Nada más.
- Salida a Internet: Docker Hub, PyPI y npm (builds), Let's Encrypt, tu servidor SMTP,
  Nominatim (geocodificación) y Geofabrik (solo si activas OSRM).
- Si el proveedor tiene firewall propio en su panel, ábrelo con las mismas reglas.

## Proveedores

Sirve cualquier proveedor con Ubuntu 24.04 y acceso root por clave SSH (p. ej. Hetzner, DigitalOcean,
Linode/Akamai, Vultr, OVH, AWS Lightsail). Elige una región cercana a México (p. ej. EE. UU. centro/este)
para menor latencia. Activa los snapshots/backups del proveedor si están disponibles: complementan
(no sustituyen) los backups de la aplicación.

## Otros requisitos

- Un **dominio** propio con acceso a su DNS (DOMAIN_AND_DNS.md).
- Un **correo** para Let's Encrypt (avisos de caducidad).
- Opcional: cuenta SMTP (recuperación de contraseña) y almacenamiento externo para backups (rclone).
- Para Android: cuenta de Expo (EAS) o un equipo con Android SDK (ANDROID_BUILD.md).
