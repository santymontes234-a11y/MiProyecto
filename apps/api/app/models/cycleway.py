import uuid
from datetime import datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import BigInteger, Boolean, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._types import created_at_col, uuid_pk


class Cycleway(Base):
    __tablename__ = "cycleways"
    __table_args__ = (Index("ix_cycleways_geom", "geom", postgresql_using="gist"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str | None] = mapped_column(String(160))
    is_protected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    osm_id: Mapped[int | None] = mapped_column(BigInteger, unique=True)
    geom: Mapped[Any] = mapped_column(
        Geometry("LINESTRING", srid=4326, spatial_index=False), nullable=False
    )
    created_at: Mapped[datetime] = created_at_col()
