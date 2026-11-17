"""Zonas de análisis (API_CONTRACT §7 y §8).

* ``GET /catalog/zones`` — público; nunca devuelve zonas DEMO.
* ``POST/PATCH/DELETE /admin/zones`` — ADMIN (permiso ``catalog:manage``); generan AuditLog.

Montaje (Backend, app/main.py): ``app.include_router(zones.router, prefix=api_prefix)``.
Lógica en app/services/geo_analytics/zones.py.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.core.deps import DB, Permissions, require_permission
from app.models import User
from app.models.enums import ZoneKind
from app.schemas.geo import parse_bbox
from app.schemas.zones import ZoneCreate, ZoneFeature, ZoneFeatureCollection, ZoneUpdate
from app.services.geo_analytics import zones as service

router = APIRouter(tags=["zones"])
Admin = Annotated[User, Depends(require_permission(Permissions.CATALOG_MANAGE))]


@router.get("/catalog/zones", response_model=ZoneFeatureCollection)
def catalog_zones(
    db: DB,
    bbox: Annotated[str | None, Query(description="minLng,minLat,maxLng,maxLat")] = None,
    kind: ZoneKind | None = None,
) -> dict:
    return service.catalog(db, parse_bbox(bbox) if bbox else None, kind.value if kind else None)


@router.post("/admin/zones", response_model=ZoneFeature, status_code=status.HTTP_201_CREATED)
def create_zone(data: ZoneCreate, actor: Admin, db: DB) -> dict:
    payload = data.model_dump(mode="json")
    return service.create(db, actor, payload)


@router.patch("/admin/zones/{zone_id}", response_model=ZoneFeature)
def update_zone(zone_id: uuid.UUID, data: ZoneUpdate, actor: Admin, db: DB) -> dict:
    return service.update(db, actor, zone_id, data.model_dump(mode="json", exclude_unset=True))


@router.delete("/admin/zones/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_zone(zone_id: uuid.UUID, actor: Admin, db: DB) -> Response:
    service.delete(db, actor, zone_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
