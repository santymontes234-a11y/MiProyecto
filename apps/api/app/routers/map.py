import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query

from app.core.deps import DB
from app.models import PoiCategory
from app.schemas.geo import parse_bbox
from app.schemas.map import CyclewayCollection, PoiCollection, PoiFeature
from app.services import map as map_service

router = APIRouter(prefix="/map", tags=["map"])

BBox = Annotated[str, Query(description="minLng,minLat,maxLng,maxLat (máx. 0.5°×0.5°)", max_length=200)]
_400 = {400: {"description": "BBOX_INVALID · BBOX_TOO_LARGE"}}


@router.get("/pois", response_model=PoiCollection, responses=_400, summary="POIs en un área")
def pois(
    db: DB,
    bbox: BBox,
    category: Annotated[list[PoiCategory] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> dict[str, Any]:
    return map_service.list_pois(db, parse_bbox(bbox), category, limit)


@router.get("/pois/{poi_id}", response_model=PoiFeature, responses={404: {"description": "POI_NOT_FOUND"}},
            summary="Detalle de un POI")
def poi(poi_id: uuid.UUID, db: DB) -> dict[str, Any]:
    return map_service.get_poi(db, poi_id)


@router.get("/cycleways", response_model=CyclewayCollection, responses=_400, summary="Ciclovías en un área")
def cycleways(db: DB, bbox: BBox) -> dict[str, Any]:
    return map_service.list_cycleways(db, parse_bbox(bbox))
