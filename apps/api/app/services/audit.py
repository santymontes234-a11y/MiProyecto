"""Bitácora de auditoría (SECURITY.md §6). El payload se redacta: nunca secretos ni coordenadas."""

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.logging import redact
from app.models import AuditLog, User


def record(
    db: Session,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None,
    actor: User | None,
    payload: dict[str, Any] | None = None,
) -> AuditLog:
    """Añade el evento a la transacción actual; el llamador hace commit junto con el cambio."""
    entry = AuditLog(
        id=uuid.uuid4(),
        actor_id=actor.id if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=redact(payload or {}),
    )
    db.add(entry)
    return entry
