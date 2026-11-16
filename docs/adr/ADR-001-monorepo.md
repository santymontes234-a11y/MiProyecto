# ADR-001 — Monorepo con npm workspaces

**Estado:** Aceptada · 2026-11-15

**Contexto.** Web y mobile comparten tipos del contrato, cliente HTTP y tokens de diseño. El backend
es Python y no participa del grafo de dependencias de Node.

**Decisión.** Un único repositorio. `apps/web`, `apps/mobile` y `packages/shared` son workspaces de
npm. `apps/api` gestiona sus dependencias con `pyproject.toml`. `packages/shared` se consume como
código fuente TypeScript (`"main": "src/index.ts"`), sin paso de build.

**Consecuencias.** Cambios de contrato atómicos en un solo PR (schema Pydantic + tipos TS + docs).
Desde Expo SDK 52, Metro detecta los workspaces automáticamente (no hacen falta `watchFolders` ni
`nodeModulesPaths` manuales; nota 2026-11-16). Next.js requiere `transpilePackages`.
Expo/EAS nunca se ejecuta en la raíz: usar `npm run android` (raíz) o los scripts de `apps/mobile`.
