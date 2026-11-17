"""Tablas de normalización (requisito R5 de la materia ABD).

- `user_preferences`: 1:1 con `users` (antes `users.preferences` JSONB).
- Especialización EER **disjunta y parcial** de `pois`:
    * `transit_stops`  (categoría BUS_STOP)                  — código de parada y líneas (N:M).
    * `bike_stations`  (categorías BIKE_SHARING, BIKE_PARKING) — código opcional y capacidad.
  La disyunción se garantiza en la BD con la FK compuesta (poi_id, category) → pois(id, category)
  y un CHECK sobre `category` en cada subtipo: un POI solo puede estar en el subtipo de su categoría.
- `transit_lines` y `stop_lines` (N:M parada–línea).
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    SmallInteger,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._types import created_at_col, pg_enum, uuid_pk
from app.models.enums import PoiCategory, TransportMode, VehicleType

STOP_CODE_RE = "^[A-Z0-9_-]{2,32}$"


class UserPreference(Base):
    __tablename__ = "user_preferences"
    __table_args__ = (
        CheckConstraint("language IN ('es', 'en')", name="ck_user_preferences_language"),
        CheckConstraint("weekly_goal_trips IS NULL OR weekly_goal_trips BETWEEN 1 AND 100",
                        name="ck_user_preferences_weekly_goal"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    language: Mapped[str] = mapped_column(String(2), nullable=False, default="es", server_default="es")
    default_mode: Mapped[TransportMode | None] = mapped_column(
        pg_enum(TransportMode, "transport_mode"), ForeignKey("transport_modes.mode", ondelete="SET NULL")
    )
    weekly_goal_trips: Mapped[int | None] = mapped_column(SmallInteger)
    default_vehicle_type: Mapped[VehicleType | None] = mapped_column(
        pg_enum(VehicleType, "vehicle_type"), ForeignKey("vehicle_types.code", ondelete="SET NULL")
    )
    email_notifications: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class TransitStop(Base):
    __tablename__ = "transit_stops"
    __table_args__ = (
        ForeignKeyConstraint(["poi_id", "category"], ["pois.id", "pois.category"],
                             name="fk_transit_stops_poi", ondelete="CASCADE", onupdate="CASCADE"),
        CheckConstraint("category = 'BUS_STOP'", name="ck_transit_stops_category"),
        CheckConstraint(f"code ~ '{STOP_CODE_RE}'", name="ck_transit_stops_code_format"),
    )

    poi_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    category: Mapped[PoiCategory] = mapped_column(
        pg_enum(PoiCategory, "poi_category"), nullable=False, default=PoiCategory.BUS_STOP,
        server_default="BUS_STOP",
    )
    # Código OFICIAL asignado por un admin: único, NULL permitido (contrato 1.1.1 §5.1).
    code: Mapped[str | None] = mapped_column(String(32), unique=True)
    # Etiqueta `ref` de OpenStreetMap: informativa, NO única (OSM la repite entre sentidos de una parada).
    osm_ref: Mapped[str | None] = mapped_column(String(64))


class BikeStation(Base):
    __tablename__ = "bike_stations"
    __table_args__ = (
        ForeignKeyConstraint(["poi_id", "category"], ["pois.id", "pois.category"],
                             name="fk_bike_stations_poi", ondelete="CASCADE", onupdate="CASCADE"),
        CheckConstraint("category IN ('BIKE_SHARING', 'BIKE_PARKING')", name="ck_bike_stations_category"),
        CheckConstraint(f"code ~ '{STOP_CODE_RE}'", name="ck_bike_stations_code_format"),
        CheckConstraint("capacity IS NULL OR capacity BETWEEN 1 AND 10000", name="ck_bike_stations_capacity"),
    )

    poi_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    category: Mapped[PoiCategory] = mapped_column(pg_enum(PoiCategory, "poi_category"), nullable=False)
    code: Mapped[str | None] = mapped_column(String(32), unique=True)
    capacity: Mapped[int | None] = mapped_column(Integer)


class TransitLine(Base):
    __tablename__ = "transit_lines"
    __table_args__ = (CheckConstraint("code ~ '^[A-Za-z0-9 ._-]{1,32}$'", name="ck_transit_lines_code_format"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = created_at_col()


class StopLine(Base):
    __tablename__ = "stop_lines"
    __table_args__ = (Index("ix_stop_lines_line", "line_id"),)

    stop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transit_stops.poi_id", ondelete="CASCADE"), primary_key=True
    )
    line_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transit_lines.id", ondelete="CASCADE"), primary_key=True
    )
