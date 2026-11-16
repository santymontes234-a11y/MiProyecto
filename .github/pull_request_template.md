## Qué cambia
<!-- Resumen breve -->

## Agente / área
- [ ] api  - [ ] database  - [ ] web  - [ ] mobile  - [ ] shared  - [ ] infra  - [ ] docs

## Checklist de integración
- [ ] No modifica archivos fuera de mi área sin propuesta aprobada (docs/AGENTS.md §4)
- [ ] Respeta docs/API_CONTRACT.md (o incluye la actualización aprobada del contrato)
- [ ] Tipos en packages/shared actualizados si cambia el contrato
- [ ] Sin secretos ni `.env` en el diff
- [ ] Migración Alembic incluida si cambia el modelo de datos
- [ ] `npm run typecheck` y `pytest` pasan
