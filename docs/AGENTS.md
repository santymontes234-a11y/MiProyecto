# Coordinación multiagente — EcoMove Querétaro

> Propiedad del agente **architect**. Lectura obligatoria para todos los agentes antes de escribir código.

## 1. Agentes y propiedad de directorios

| Agente (sesión) | Es dueño de (escritura libre) | Necesita propuesta para tocar |
|---|---|---|
| **architect** («arquitectura y coordinación») | `docs/**` (excepto donde se indica), `packages/shared/**`, archivos raíz, `.github/**`, `infrastructure/**` | código de apps |
| **backend** («Backend EcoMove Querétaro») — incluye el rol *database* | `apps/api/**` excepto las rutas de geo: routers, services, schemas, core, **models y Alembic**; `docs/DATABASE.md` §3 (en el mismo PR que la migración) | contrato |
| **geo** («módulo geoespacial») | `apps/api/app/services/geo_analytics/**`, `apps/api/app/routers/geo_analytics.py`, `apps/api/app/schemas/geo_analytics.py`, `apps/api/tests/geo/**`, `apps/api/db/geo/**` (el SQL entra en las migraciones de backend) | tablas canónicas, montaje de routers, contrato |
| **web** («web platform») | `apps/web/**` | shared, contrato |
| **mobile** («aplicación móvil») | `apps/mobile/**` | shared, contrato |
| **qa** («QA y seguridad») | `tests/e2e/**`, tests acordados en `apps/api/tests/`, `docs/INTEGRATION_REVIEW.md` (hallazgos) | código de producción |
| **design** (lo cubre architect por ahora) | `packages/shared/src/design/**`, `docs/DESIGN_SYSTEM.md` | componentes de apps |

Antes de crear un archivo, **comprueba si ya existe** (`ls`/`git status`). Nunca uses `cat >`/`Write`
sobre un archivo que no hayas creado tú en esta sesión.

`.github/CODEOWNERS` refleja esta tabla.

## 2. Reglas no negociables

1. **Contrato primero.** Ningún endpoint, campo o código de error fuera de `API_CONTRACT.md`.
2. **Sin lógica de negocio en clientes.** CO₂, permisos, validaciones de negocio → backend.
   Los clientes solo validan formato para UX.
3. **Sin acceso directo a la BD** desde web/mobile. Solo vía API.
4. **Sin secretos en el repo.** Solo `.env.example` con valores ficticios.
5. **TypeScript estricto** (`strict`, `noUncheckedIndexedAccess`). Prohibido `any` explícito y
   `@ts-ignore` (usar `@ts-expect-error` con comentario justificado si es inevitable).
6. **No sobrescribir implementaciones ajenas.** Nunca reemplazar un archivo completo de otro agente;
   ni siquiera para “reorganizar”.
7. **Tipos del contrato solo en `packages/shared`.** Prohibido redeclararlos en apps.
8. **Un solo `npm install` a la vez**, siempre desde la raíz; un solo `package-lock.json` (raíz).
   Avisa al architect antes de instalar; versiones alineadas: `react 19.3.0`, `typescript ~6.0.3`.
9. **Una sola fuente por concepto:** una tabla de viajes, un motor de CO₂, un cliente HTTP, un
   formateador por unidad. Si encuentras un duplicado, repórtalo; no crees un tercero.

## 3. Flujo Git

- Rama principal: `main` (protegida, solo vía PR).
- Ramas: `<agente>/<tipo>/<descripcion-corta>` → `backend/feat/trips-endpoints`, `mobile/fix/gps-permissions`.
- Commits: **Conventional Commits** con ámbito = área:
  `feat(api): add POST /trips`, `fix(mobile): ...`, `docs(contract): ...`, `chore(infra): ...`.
- PR pequeños (< 400 líneas netas cuando sea posible), con la plantilla `.github/pull_request_template.md`.
- Rebase sobre `main` antes de pedir merge; *squash merge*.
- Prohibido `git push --force` a ramas ajenas y a `main`.

## 4. Cambios fuera de tu área (propuestas)

1. Crea `docs/proposals/AAAA-MM-DD-<agente>-<tema>.md` con: motivación, cambio exacto (diff del
   contrato o del archivo), impacto en otros agentes.
2. El dueño del área (y el architect si afecta al contrato) aprueba en el PR.
3. Cambios de contrato: actualizar en el **mismo PR** `API_CONTRACT.md` (+ historial §8),
   `apps/api/app/schemas`, `packages/shared/src/types/api.ts`.
4. Excepción: correcciones triviales (typos, imports rotos) se permiten indicándolo en el PR y
   avisando al dueño.

## 5. Coordinación entre sesiones

- Antes de empezar: leer `ARCHITECTURE.md`, `API_CONTRACT.md` y el plan (`IMPLEMENTATION_PLAN.md`).
- Si una tarea depende de otra no terminada, programa contra el contrato y usa *mocks* tipados con
  los tipos de `@ecomove/shared` — nunca inventes campos.
- Bloqueos y dudas → al architect; las decisiones resultantes se registran como ADR.

## 6. Convenciones de nombres

| Ámbito | Convención | Ejemplo |
|---|---|---|
| Python módulos/funciones | `snake_case` | `trip_service.py`, `calculate_co2()` |
| Python clases | `PascalCase` | `TripCreate`, `User` |
| Tablas / columnas SQL | `snake_case`, tablas en plural | `trips.co2_saved_g` |
| Endpoints | `kebab-case`, sustantivos en plural | `/admin/emission-factors` |
| JSON | `snake_case` | `started_at` |
| TS variables/funciones | `camelCase` | `formatDistance()` |
| TS tipos/componentes | `PascalCase` | `TripSummary`, `<TripCard />` |
| Archivos de componentes React | `PascalCase.tsx` | `TripCard.tsx` |
| Hooks | `useXxx.ts` | `useTrips.ts` |
| Otros archivos TS | `kebab-case.ts` | `api-client.ts` |
| Constantes | `UPPER_SNAKE_CASE` | `MAX_ROUTE_POINTS` |
| Enums (valores) | `UPPER_SNAKE_CASE` | `E_SCOOTER` |

Los tipos TS conservan `snake_case` en las propiedades que vienen del contrato (no se transforman).

### Estructura de carpetas de clientes

```
apps/web/src/
  app/            # rutas (App Router): (public)/, (private)/, admin/, api/session/
  components/     # UI reutilizable — ui/ (primitivos), map/, trips/, stats/
  features/       # lógica de pantalla por dominio (hooks + componentes compuestos)
  lib/            # api.ts (instancia del cliente shared), session.ts
apps/mobile/src/
  app/            # Expo Router
  components/     # ui/, map/, trips/
  features/       # auth/, trips/, map/, stats/
  lib/            # api.ts, secure-storage.ts, location.ts
```

## 7. Checklist de revisión de integración (architect, al cierre de cada etapa)

- [ ] Rutas de `apps/api/app/routers` == tablas de `API_CONTRACT.md` (método, ruta, rol).
- [ ] `schemas/*.py` == `packages/shared/src/types/api.ts` (campos, opcionalidad, enums).
- [ ] Ningún cliente importa drivers de BD ni contiene factores de emisión.
- [ ] `grep -r "any" --include=*.ts` sin `any` explícito nuevo.
- [ ] Sin secretos: `git grep -nE "(SECRET|PASSWORD)=.+"` solo en `.env.example` con `change-me`.
- [ ] Migraciones Alembic aplican desde cero (`alembic upgrade head` en BD vacía).
- [ ] `docker compose up` levanta db + api y `/api/v1/health` responde `ok`.
- [ ] Tokens de diseño usados (sin colores hex sueltos en componentes).

Resultados en `docs/INTEGRATION_REVIEW.md`.
