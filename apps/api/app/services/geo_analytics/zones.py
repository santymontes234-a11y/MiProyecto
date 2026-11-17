"""CRUD de zonas de análisis sobre geo.mobility_zones (API_CONTRACT §7 y §8).

* Las geometrías se validan en PostGIS (``ST_IsValid``) y se guardan como MultiPolygon 4326.
* Nunca se crean ni exponen zonas DEMO por estos endpoints.
* Toda modificación registra un AuditLog en la misma transacción. El borrado es físico y el
  AuditLog guarda ``{code, name, kind, source, area_km2, bbox}``, sin la geometría completa.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import User
from app.services import audit

MAX_CATALOG_FEATURES = 2000
# ~1 m en latitudes de Querétaro: aligera el catálogo sin cambiar la forma visible.
CATALOG_SIMPLIFY_DEG = 0.00001

_SELECT = """
    SELECT z.id::text AS id, z.code, z.name, z.kind, z.source,
           round(z.area_km2::numeric, 4)::float8 AS area_km2,
           ST_AsGeoJSON({geom}, 6)::json AS geometry
    FROM geo.mobility_zones z
"""


def _feature(r: Any) -> dict[str, Any]:
    return {
        "type": "Feature",
        "id": r.id,
        "geometry": r.geometry,
        "properties": {
            "code": r.code,
            "name": r.name,
            "kind": r.kind,
            "source": r.source,
            "area_km2": r.area_km2,
        },
    }


def _zone_not_found() -> AppError:
    return AppError(404, "ZONE_NOT_FOUND", "Zona no encontrada")


def catalog(
    db: Session, bbox: tuple[float, float, float, float] | None, kind: str | None
) -> dict[str, Any]:
    geom = f"ST_Multi(ST_SimplifyPreserveTopology(z.geom, {CATALOG_SIMPLIFY_DEG}))"
    rows = db.execute(
        text(
            _SELECT.format(geom=geom)
            + """
            WHERE NOT z.is_demo
              AND (CAST(:kind AS text) IS NULL OR z.kind = CAST(:kind AS text))
              AND (CAST(:x0 AS float8) IS NULL
                   OR z.geom && ST_MakeEnvelope(:x0, :y0, :x1, :y1, 4326))
            ORDER BY z.kind, z.code NULLS LAST, z.name
            LIMIT :lim
            """
        ),
        {
            "kind": kind,
            "x0": bbox[0] if bbox else None,
            "y0": bbox[1] if bbox else None,
            "x1": bbox[2] if bbox else None,
            "y1": bbox[3] if bbox else None,
            "lim": MAX_CATALOG_FEATURES,
        },
    ).all()
    return {"type": "FeatureCollection", "features": [_feature(r) for r in rows]}


def _get(db: Session, zone_id: uuid.UUID) -> Any:
    row = db.execute(
        text(_SELECT.format(geom="z.geom") + " WHERE z.id = :id AND NOT z.is_demo"),
        {"id": zone_id},
    ).first()
    if row is None:
        raise _zone_not_found()
    return row


def _check_geometry(db: Session, geojson: dict[str, Any]) -> None:
    ok, reason = db.execute(
        text(
            "SELECT ST_IsValid(g), ST_IsValidReason(g) "
            "FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON(:g), 4326) AS g) s"
        ),
        {"g": json.dumps(geojson)},
    ).one()
    if not ok:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Geometría inválida",
            details=[{"field": "geometry", "message": reason}],
        )


def _conflict(exc: IntegrityError) -> AppError:
    return (
        AppError(409, "CONFLICT", "Ya existe una zona con ese code")
        if "code" in str(exc.orig)
        else AppError(409, "CONFLICT", "La zona viola una restricción de integridad")
    )


def create(db: Session, actor: User, data: dict[str, Any]) -> dict[str, Any]:
    _check_geometry(db, data["geometry"])
    try:
        zone_id = db.execute(
            text(
                """
                INSERT INTO geo.mobility_zones (code, name, kind, source, is_demo, geom)
                VALUES (:code, :name, :kind, :source, false,
                        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(:g), 4326)))
                RETURNING id
                """
            ),
            {
                **{k: data[k] for k in ("code", "name", "kind", "source")},
                "g": json.dumps(data["geometry"]),
            },
        ).scalar_one()
    except IntegrityError as exc:
        db.rollback()
        raise _conflict(exc) from None
    row = _get(db, zone_id)
    audit.record(
        db,
        "ZONE_CREATED",
        "zone",
        zone_id,
        actor,
        {"code": row.code, "name": row.name, "kind": row.kind, "source": row.source},
    )
    db.commit()
    return _feature(row)


def update(db: Session, actor: User, zone_id: uuid.UUID, data: dict[str, Any]) -> dict[str, Any]:
    _get(db, zone_id)
    changes = {k: v for k, v in data.items() if v is not None}
    if not changes:
        return _feature(_get(db, zone_id))
    sets, params = [], {"id": zone_id}
    for col in ("name", "kind", "source"):
        if col in changes:
            sets.append(f"{col} = :{col}")
            params[col] = changes[col]
    if "geometry" in changes:
        _check_geometry(db, changes["geometry"])
        sets.append("geom = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(:g), 4326))")
        params["g"] = json.dumps(changes["geometry"])
    try:
        db.execute(
            text(f"UPDATE geo.mobility_zones SET {', '.join(sets)} WHERE id = :id"),  # noqa: S608 - columnas fijas
            params,
        )
    except IntegrityError as exc:
        db.rollback()
        raise _conflict(exc) from None
    row = _get(db, zone_id)
    audit.record(
        db, "ZONE_UPDATED", "zone", zone_id, actor, {"code": row.code, "fields": sorted(changes)}
    )
    db.commit()
    return _feature(row)


def delete(db: Session, actor: User, zone_id: uuid.UUID) -> None:
    row = db.execute(
        text(
            """
            DELETE FROM geo.mobility_zones z
            WHERE z.id = :id AND NOT z.is_demo
            RETURNING z.code, z.name, z.kind, z.source,
                      round(z.area_km2::numeric, 4)::float8 AS area_km2,
                      ARRAY[ST_XMin(z.geom), ST_YMin(z.geom), ST_XMax(z.geom), ST_YMax(z.geom)]
                          AS bbox
            """
        ),
        {"id": zone_id},
    ).first()
    if row is None:
        raise _zone_not_found()
    audit.record(
        db,
        "ZONE_DELETED",
        "zone",
        zone_id,
        actor,
        {
            "code": row.code,
            "name": row.name,
            "kind": row.kind,
            "source": row.source,
            "area_km2": row.area_km2,
            "bbox": [round(v, 6) for v in row.bbox],
        },
    )
    db.commit()
