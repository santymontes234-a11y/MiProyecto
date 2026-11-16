# @ecomove/web

Sitio web de EcoMove Querétaro: área pública, área de usuario (`/app`) y panel administrativo
(`/admin`). Next.js 16 (App Router), TypeScript estricto, Tailwind CSS 4, Recharts, Leaflet,
React Hook Form y Zod.

```bash
cp apps/web/.env.example apps/web/.env.local   # una vez
npm install                                    # siempre desde la raíz del monorepo
npm run dev -w @ecomove/web                    # http://localhost:3000
npm run typecheck -w @ecomove/web
npm run lint -w @ecomove/web
npm test -w @ecomove/web
npm run build -w @ecomove/web
```

La API (`apps/api`) debe estar levantada (`npm run infra:up`). Sin ella, las páginas públicas
muestran «—» y avisos, y el login informa de que no hay conexión.

## Reglas que sigue esta app

| Regla | Dónde |
|---|---|
| Solo consume la API del contrato 1.0.0, nunca PostgreSQL | `src/lib/api.ts` (`createApiClient` de `@ecomove/shared`) |
| Tipos, `ApiError`, formateadores de CO₂/distancia/duración, etiquetas y tokens salen de `@ecomove/shared` | sin redeclarar en la web |
| Tokens (ADR-003): access en memoria; refresh en cookie `HttpOnly` gestionada por el BFF | `src/lib/session.ts`, `src/lib/bff.ts`, `src/app/api/session/*` |
| Rutas privadas: el proxy redirige sin sesión; el rol sale del `User` de la API, nunca del almacenamiento | `src/proxy.ts`, `src/components/auth/SessionProvider.tsx` |
| CSRF en el BFF: cabecera `x-ecomove-csrf` + `Origin` | `src/lib/auth/csrf.ts` |
| Anti open-redirect en `?next=` | `src/lib/auth/redirect.ts` |
| CSP y cabeceras de seguridad | `next.config.ts` |
| Sin secretos en `NEXT_PUBLIC_*` (solo la URL pública de la API y del sitio) | `.env.example` |
| Colores: variables CSS generadas por `toCssVariables()` (claro y oscuro); sin hex sueltos | `src/app/theme.ts`, `src/app/globals.css` |

## Lint

ESLint 9 (flat config, `eslint.config.mjs`) con los plugins declarados uno a uno
(`typescript-eslint`, `@next/eslint-plugin-next`, `react-hooks`, `jsx-a11y`) en lugar de
`eslint-config-next`: en el monorepo `next` queda anidado en `apps/web/node_modules` y el parser
Babel de `eslint-config-next` (instalado en la raíz) no lo resuelve. Las reglas equivalen a
`core-web-vitals` + `typescript`, más `no-explicit-any` y `ban-ts-comment` (AGENTS §2.5).
Aprobado por architect.

## Estructura

```
src/
  app/
    (public)/        landing, /mapa, /estadisticas, /movilidad-sostenible, /privacidad
    (auth)/          /login, /registro
    (private)/app/   panel, viajes (+ detalle), estadísticas, logros, ranking, perfil, configuración
    admin/           dashboard, usuarios, viajes, transportes, estaciones, zonas, reportes,
                     estadísticas, mapa, auditoría (solo SUPER_ADMIN)
    api/session/     BFF de sesión (login, register, refresh, logout)
  components/        ui/ (primitivos del DS), map/, stats/, trips/, auth/, layout/, common/
  hooks/             useApiQuery, useColorScheme
  lib/               api.ts, session.ts, bff.ts, export.ts, validation/, auth/
tests/               Vitest + Testing Library
```

## Funciones pendientes de contrato

Estas secciones se ven como «pendiente de contrato» (sin datos simulados) hasta que la 1.1.0
publique sus endpoints: logros y ranking (`mobile-gamification`); viajes admin y zonas
(`backend-account-features`); series de ciudad, horas pico, zonas, rutas frecuentes y mapa de
calor (`geo-analytics`); reportes ciudadanos, evolución de usuarios, indicadores de
infraestructura y exportación PDF en el servidor (`web-admin-analytics`). Todas están en
`docs/proposals/`.

La exportación CSV se genera en el navegador a partir de los endpoints paginados (con protección
contra inyección de fórmulas) y el PDF se obtiene con la vista de impresión.
