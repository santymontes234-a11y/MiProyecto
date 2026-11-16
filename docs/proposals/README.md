# Propuestas de cambio

Formato de archivo: `AAAA-MM-DD-<agente>-<tema>.md`. Plantilla:

```markdown
# <Título>
- **Autor (agente):** mobile
- **Estado:** Borrador | En revisión | Aprobada | Rechazada
- **Afecta a:** API_CONTRACT §x, apps/api, packages/shared, apps/web ...

## Motivación
## Cambio propuesto
(endpoints / campos / tablas exactos, con ejemplos JSON)
## Impacto en otros agentes
## Alternativas consideradas
```

Una propuesta aprobada se implementa en un PR que actualiza contrato + schemas + tipos shared juntos.
