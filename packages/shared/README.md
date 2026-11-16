# @ecomove/shared

Código compartido entre `apps/web` y `apps/mobile`. Se consume como fuente TypeScript (sin build).

| Módulo | Contenido |
|---|---|
| `types/` | Tipos y enums del contrato v1.0.0 (espejo de `apps/api/app/schemas`) |
| `api/` | `createApiClient()` tipado con refresh single-flight, `ApiError` |
| `design/` | Tokens de diseño + `toCssVariables()` |
| `constants/` | Etiquetas en español y límites de UX |
| `format/` | `formatCo2`, `formatDistance`, `formatDuration` |

**Prohibido aquí:** factores de emisión, cálculo de CO₂, reglas de permisos, acceso a BD.
