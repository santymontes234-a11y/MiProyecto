"""Catálogos de 1.1.0: medios de transporte, logros e informes generados."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._types import created_at_col, pg_enum, uuid_pk
from app.models.enums import (
    AchievementCriterion,
    ReportFormat,
    ReportType,
    TransportMode,
    VehicleType,
)


class TransportModeInfo(Base):
    """Configuración por medio. Sin nombre (las etiquetas son de los clientes) ni factor (emission_factors)."""

    __tablename__ = "transport_modes"
    __table_args__ = (
        CheckConstraint("max_speed_kmh > 0 AND max_speed_kmh <= 300", name="ck_transport_modes_speed"),
    )

    mode: Mapped[TransportMode] = mapped_column(pg_enum(TransportMode, "transport_mode"), primary_key=True)
    max_speed_kmh: Mapped[float] = mapped_column(Float, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)


class Achievement(Base):
    __tablename__ = "achievements"
    __table_args__ = (
        CheckConstraint("threshold > 0", name="ck_achievements_threshold_positive"),
        CheckConstraint("bonus_points >= 0 AND bonus_points <= 10000", name="ck_achievements_bonus_range"),
        CheckConstraint("code ~ '^[A-Z0-9_]{2,40}$'", name="ck_achievements_code_format"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    icon: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    criterion: Mapped[AchievementCriterion] = mapped_column(
        pg_enum(AchievementCriterion, "achievement_criterion"), nullable=False
    )
    threshold: Mapped[float] = mapped_column(Float, nullable=False)
    bonus_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (
        UniqueConstraint("user_id", "achievement_id", name="uq_user_achievements_user_achievement"),
        Index("ix_user_achievements_awarded_at", "awarded_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    achievement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("achievements.id", ondelete="CASCADE"), nullable=False
    )
    # Bono congelado al otorgar: editar el logro después no altera puntos ya ganados.
    bonus_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    awarded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    achievement: Mapped[Achievement] = relationship(lazy="joined")


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint("row_count >= 0", name="ck_reports_row_count_positive"),
        Index("ix_reports_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    report_type: Mapped[ReportType] = mapped_column(pg_enum(ReportType, "report_type"), nullable=False)
    format: Mapped[ReportFormat] = mapped_column(pg_enum(ReportFormat, "report_format"), nullable=False)
    parameters: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"),
                                                       nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = created_at_col()


class VehicleTypeInfo(Base):
    """Factores por tipo de automóvil (contrato 1.2 §4.3). Fuente citada en `source` (APA)."""

    __tablename__ = "vehicle_types"
    __table_args__ = (
        CheckConstraint("grams_per_km >= 0 AND grams_per_km <= 5000", name="ck_vehicle_types_factor"),
        CheckConstraint("max_occupants BETWEEN 1 AND 8", name="ck_vehicle_types_max_occupants"),
    )

    code: Mapped[VehicleType] = mapped_column(pg_enum(VehicleType, "vehicle_type"), primary_key=True)
    grams_per_km: Mapped[float] = mapped_column(Float, nullable=False)
    max_occupants: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    source: Mapped[str] = mapped_column(String(300), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
