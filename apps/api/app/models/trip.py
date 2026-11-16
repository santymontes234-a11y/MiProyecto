import uuid
from datetime import datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._types import created_at_col, pg_enum, uuid_pk
from app.models.enums import TransportMode, TripStatus


class Trip(Base):
    __tablename__ = "trips"
    __table_args__ = (
        UniqueConstraint("user_id", "client_trip_id", name="uq_trips_user_client_trip"),
        CheckConstraint("ended_at > started_at", name="ck_trips_time_order"),
        CheckConstraint("co2_emitted_g >= 0 AND co2_saved_g >= 0", name="ck_trips_co2_positive"),
        CheckConstraint("distance_m >= 0 AND duration_s > 0", name="ck_trips_distance_duration"),
        Index("ix_trips_user_started", "user_id", text("started_at DESC")),
        Index("ix_trips_started", "started_at"),
        Index("ix_trips_route", "route", postgresql_using="gist"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    client_trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    mode: Mapped[TransportMode] = mapped_column(pg_enum(TransportMode, "transport_mode"), nullable=False)
    status: Mapped[TripStatus] = mapped_column(
        pg_enum(TripStatus, "trip_status"), default=TripStatus.COMPLETED, nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    distance_m: Mapped[float] = mapped_column(Float, nullable=False)
    duration_s: Mapped[int] = mapped_column(Integer, nullable=False)
    route: Mapped[Any] = mapped_column(
        Geometry("LINESTRING", srid=4326, spatial_index=False), nullable=False
    )
    emission_factor_g_per_km: Mapped[float] = mapped_column(Float, nullable=False)
    co2_emitted_g: Mapped[float] = mapped_column(Float, nullable=False)
    co2_saved_g: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = created_at_col()
