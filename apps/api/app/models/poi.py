import uuid
from datetime import datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, DateTime, Index, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._types import created_at_col, pg_enum, uuid_pk
from app.models.enums import PoiCategory


class Poi(Base):
    __tablename__ = "pois"
    __table_args__ = (
        Index("ix_pois_location", "location", postgresql_using="gist"),
        Index("ix_pois_category", "category"),
        # Superclave para la especialización disjunta (transit_stops, bike_stations).
        UniqueConstraint("id", "category", name="uq_pois_id_category"),
        # Unicidad de POIs importados de OpenStreetMap (importador del módulo geo, upsert).
        Index(
            "ux_pois_osm_ref",
            text("(attributes->>'osm_type')"),
            text("(attributes->>'osm_id')"),
            unique=True,
            postgresql_where=text("attributes->>'source' = 'osm'"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[PoiCategory] = mapped_column(pg_enum(PoiCategory, "poi_category"), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    attributes: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    location: Mapped[Any] = mapped_column(
        Geometry("POINT", srid=4326, spatial_index=False), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
