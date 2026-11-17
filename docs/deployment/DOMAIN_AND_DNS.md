# Dominio y DNS

EcoMove usa **un dominio y dos subdominios**:

| Nombre | Sirve | Contenedor |
|---|---|---|
| `midominio.mx` | Sitio web (Next.js) | `web` → 127.0.0.1:3000 |
| `www.midominio.mx` | Redirige (301) a `midominio.mx` | — |
| `api.midominio.mx` | API REST `/api/v1/*` (web y app Android) | `api` → 127.0.0.1:8000 |

Sustituye `midominio.mx` por tu dominio en todos los comandos. En `.env.production` son `DOMAIN` y
`API_DOMAIN` (`generate_secrets.sh --domain midominio.mx` los rellena).

## 1. Comprar el dominio

Con cualquier registrador (por ejemplo, para `.mx`, uno acreditado por NIC México; para `.com`, Cloudflare
Registrar, Namecheap, Porkbun…). Activa el bloqueo de transferencia y la verificación en dos pasos en tu
cuenta del registrador.

## 2. Registros DNS

En el panel de DNS (del registrador o de Cloudflare) crea estos registros; `203.0.113.10` es la IP de tu VPS:

| Tipo | Nombre | Valor | TTL |
|---|---|---|---|
| A | `@` | 203.0.113.10 | 300 |
| A | `www` | 203.0.113.10 | 300 |
| A | `api` | 203.0.113.10 | 300 |
| AAAA | `@`, `www`, `api` | IPv6 del VPS (solo si tiene) | 300 |
| CAA | `@` | `0 issue "letsencrypt.org"` | 3600 |

- Usa TTL bajo (300 s) durante la puesta en marcha; súbelo a 3600 cuando todo funcione.
- **No** crees un AAAA si el VPS no tiene IPv6 funcionando: Let's Encrypt lo probaría y fallaría.
- **Cloudflare:** deja los registros en «DNS only» (nube gris) mientras emites el certificado. Si después
  activas el proxy, configura SSL «Full (strict)» y ten en cuenta que Nginx verá IPs de Cloudflare
  (fail2ban y los límites por IP dejarían de funcionar sin `real_ip` configurado; no está incluido).

## 3. Comprobar la propagación

```bash
dig +short midominio.mx A
dig +short www.midominio.mx A
dig +short api.midominio.mx A
# Desde fuera de tu red, o con un resolver público:
dig +short api.midominio.mx @1.1.1.1
```

Los tres deben devolver la IP del VPS **antes** de pedir el certificado (HTTPS_SETUP.md).

## 4. Correo (opcional)

Si envías correos desde `no-reply@midominio.mx` con un proveedor SMTP, añade los registros que este te
indique (SPF `TXT`, DKIM y DMARC). Sin ellos los correos de recuperación de contraseña acabarán en spam.
