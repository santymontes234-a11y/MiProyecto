"""Notificaciones in-app (contrato §10). Las genera solo el backend; se conservan 90 días."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.models import Notification, NotificationType


def create(db: Session, user_id: uuid.UUID, type_: NotificationType, title: str, body: str,
           data: dict[str, Any] | None = None) -> Notification:
    n = Notification(id=uuid.uuid4(), user_id=user_id, type=type_, title=title[:120], body=body[:500],
                     data=data or {})
    db.add(n)
    return n


def purge_expired(db: Session) -> int:
    cutoff = datetime.now(UTC) - timedelta(days=get_settings().notifications_retention_days)
    return db.execute(delete(Notification).where(Notification.created_at < cutoff)).rowcount or 0


def _retained(user_id: uuid.UUID) -> list[Any]:
    cutoff = datetime.now(UTC) - timedelta(days=get_settings().notifications_retention_days)
    return [Notification.user_id == user_id, Notification.created_at >= cutoff]


def list_for(db: Session, user_id: uuid.UUID, *, page: int, page_size: int, unread_only: bool) -> dict[str, Any]:
    conds = _retained(user_id)
    unread = db.execute(
        select(func.count()).select_from(Notification).where(*conds, Notification.read_at.is_(None))
    ).scalar_one()
    if unread_only:
        conds.append(Notification.read_at.is_(None))
    total = db.execute(select(func.count()).select_from(Notification).where(*conds)).scalar_one()
    items = db.execute(
        select(Notification).where(*conds).order_by(Notification.created_at.desc(), Notification.id)
        .limit(page_size).offset((page - 1) * page_size)
    ).scalars().all()
    return {"items": items, "total": total, "page": page, "page_size": page_size, "unread_count": unread}


def mark_read(db: Session, user_id: uuid.UUID, notification_id: uuid.UUID) -> None:
    n = db.execute(
        select(Notification).where(Notification.id == notification_id, *_retained(user_id))
    ).scalar_one_or_none()
    if n is None:
        raise AppError(404, "NOTIFICATION_NOT_FOUND", "Notificación no encontrada")
    if n.read_at is None:
        n.read_at = datetime.now(UTC)
    db.commit()


def mark_all_read(db: Session, user_id: uuid.UUID) -> None:
    db.execute(update(Notification).where(Notification.user_id == user_id, Notification.read_at.is_(None))
               .values(read_at=datetime.now(UTC)))
    db.commit()
