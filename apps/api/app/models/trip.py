import uuid
from datetime import datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._types import created_at_col, pg_enum, uuid_pk
from app.models.enums import TransportMode, TripSource, TripStatus, VehicleType


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
        Index("ix_trips_recurrence", "recurrence_id", postgresql_where=text("recurrence_id IS NOT NULL")),
        CheckConstraint("points >= 0", name="ck_trips_points_positive"),
        # Contrato 1.2 §4.3: tipo de vehículo y ocupantes solo en CAR/CARPOOL; CARPOOL ≥ 2 ocupantes.
        CheckConstraint("occupants IS NULL OR occupants BETWEEN 1 AND 8", name="ck_trips_occupants_range"),
        CheckConstraint("mode IN ('CAR', 'CARPOOL') OR (vehicle_type IS NULL AND occupants IS NULL)",
                        name="ck_trips_vehicle_only_car"),
        CheckConstraint("mode <> 'CARPOOL' OR occupants IS NULL OR occupants >= 2", name="ck_trips_carpool_occupants"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    client_trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    mode: Mapped[TransportMode] = mapped_column(
        pg_enum(TransportMode, "transport_mode"),
        ForeignKey("transport_modes.mode", ondelete="RESTRICT", onupdate="CASCADE"), nullable=False,
    )
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
    source: Mapped[TripSource] = mapped_column(
        pg_enum(TripSource, "trip_source"), default=TripSource.GPS, server_default="GPS", nullable=False
    )
    points: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    recurrence_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    vehicle_type: Mapped[VehicleType | None] = mapped_column(
        pg_enum(VehicleType, "vehicle_type"), ForeignKey("vehicle_types.code", ondelete="RESTRICT")
    )
    occupants: Mapped[int | None] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
