"""Tokens de un solo uso, notificaciones y reportes ciudadanos (contrato 1.1.0)."""

import uuid
from datetime import datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import CHAR, CheckConstraint, DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._types import created_at_col, pg_enum, uuid_pk
from app.models.enums import (
    CitizenReportCategory,
    CitizenReportStatus,
    NotificationType,
    TokenPurpose,
)


class UserToken(Base):
    """Reset de contraseña y verificación de correo: solo se guarda el SHA-256 del token."""

    __tablename__ = "user_tokens"
    __table_args__ = (
        Index("ix_user_tokens_user_purpose", "user_id", "purpose", postgresql_where=text("used_at IS NULL")),
        CheckConstraint("expires_at > created_at", name="ck_user_tokens_expiry"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    purpose: Mapped[TokenPurpose] = mapped_column(pg_enum(TokenPurpose, "token_purpose"), nullable=False)
    token_hash: Mapped[str] = mapped_column(CHAR(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_col()


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_created", "user_id", text("created_at DESC")),
        Index("ix_notifications_user_unread", "user_id", postgresql_where=text("read_at IS NULL")),
        Index("ix_notifications_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[NotificationType] = mapped_column(
        pg_enum(NotificationType, "notification_type"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str] = mapped_column(String(500), nullable=False)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"),
                                                 nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_col()


class CitizenReport(Base):
    __tablename__ = "citizen_reports"
    __table_args__ = (
        Index("ix_citizen_reports_location", "location", postgresql_using="gist"),
        Index("ix_citizen_reports_reporter_created", "reporter_id", "created_at"),
        Index("ix_citizen_reports_status_created", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    reporter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    category: Mapped[CitizenReportCategory] = mapped_column(
        pg_enum(CitizenReportCategory, "citizen_report_category"), nullable=False
    )
    status: Mapped[CitizenReportStatus] = mapped_column(
        pg_enum(CitizenReportStatus, "citizen_report_status"), default=CitizenReportStatus.OPEN,
        server_default="OPEN", nullable=False,
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    location: Mapped[Any] = mapped_column(Geometry("POINT", srid=4326, spatial_index=False), nullable=False)
    poi_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pois.id", ondelete="SET NULL")
    )
    resolution_note: Mapped[str | None] = mapped_column(String(1000))
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
