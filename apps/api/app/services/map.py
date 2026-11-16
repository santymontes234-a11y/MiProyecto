"""Consultas de mapa por bbox con índices GiST (DATABASE.md §5)."""

import json
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.models import Cycleway, Poi, PoiCategory
from app.schemas.geo import PointGeometry


def _poi_feature(poi: Poi, geojson: str) -> dict[str, Any]:
    return {
        "type": "Feature",
        "id": poi.id,
        "geometry": json.loads(geojson),
        "properties": {
            "name": poi.name,
            "category": poi.category,
            "description": poi.description,
            "attributes": poi.attributes or {},
        },
    }


def _envelope(bbox: tuple[float, float, float, float]):  # noqa: ANN202
    return func.ST_MakeEnvelope(*bbox, 4326)


def list_pois(
    db: Session, bbox: tuple[float, float, float, float], categories: list[PoiCategory] | None, limit: int
) -> dict[str, Any]:
    q = select(Poi, func.ST_AsGeoJSON(Poi.location)).where(
        Poi.is_active.is_(True), Poi.location.op("&&")(_envelope(bbox))
    )
    if categories:
        q = q.where(Poi.category.in_(categories))
    rows = db.execute(q.order_by(Poi.name, Poi.id).limit(limit)).all()
    return {"type": "FeatureCollection", "features": [_poi_feature(p, g) for p, g in rows]}


def get_poi(db: Session, poi_id: uuid.UUID, include_inactive: bool = False) -> dict[str, Any]:
    q = select(Poi, func.ST_AsGeoJSON(Poi.location)).where(Poi.id == poi_id)
    if not include_inactive:
        q = q.where(Poi.is_active.is_(True))
    row = db.execute(q).first()
    if row is None:
        raise not_found("poi")
    return _poi_feature(row[0], row[1])


def point_expr(point: PointGeometry):  # noqa: ANN201
    lng, lat = point.coordinates
    return func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326)


def list_cycleways(db: Session, bbox: tuple[float, float, float, float]) -> dict[str, Any]:
    rows = db.execute(
        select(Cycleway, func.ST_AsGeoJSON(Cycleway.geom), func.ST_Length(func.Geography(Cycleway.geom)))
        .where(Cycleway.geom.op("&&")(_envelope(bbox)))
        .order_by(Cycleway.id)
        .limit(2000)
    ).all()
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": c.id,
                "geometry": json.loads(g),
                "properties": {"name": c.name, "is_protected": c.is_protected, "length_m": round(float(length), 1)},
            }
            for c, g, length in rows
        ],
    }
