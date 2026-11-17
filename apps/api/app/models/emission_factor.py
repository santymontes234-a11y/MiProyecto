import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._types import pg_enum
from app.models.enums import TransportMode


class EmissionFactor(Base):
    __tablename__ = "emission_factors"
    __table_args__ = (CheckConstraint("grams_per_km >= 0", name="ck_emission_factors_positive"),)

    mode: Mapped[TransportMode] = mapped_column(
        pg_enum(TransportMode, "transport_mode"),
        ForeignKey("transport_modes.mode", ondelete="RESTRICT", onupdate="CASCADE"),
        primary_key=True,
    )
    grams_per_km: Mapped[float] = mapped_column(Float, nullable=False)
    valid_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
