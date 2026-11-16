# ADR-002 — Cálculo de CO₂ solo en el backend

**Estado:** Aceptada · 2026-11-15

**Contexto.** El cálculo de emisiones es la regla de negocio central y alimenta estadísticas
oficiales. Duplicarlo en web/mobile produciría cifras divergentes al cambiar factores.

**Decisión.** Solo `apps/api/app/services/co2.py` calcula CO₂. Los clientes que necesiten mostrar
una estimación antes de guardar usan `POST /trips/estimate`. `packages/shared` solo contiene
formateadores (p. ej. `formatCo2(grams)`), nunca factores.

**Consecuencias.** Las previsualizaciones requieren red. Los factores pueden cambiar sin publicar
nuevas versiones de la app.
