"""GET /geocode — búsqueda de lugares por nombre (contrato 1.2 §12.1)."""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.deps import DB, CurrentUser
from app.core.errors import AppError
from app.core.rate_limit import enforce
from app.services import geocode

router = APIRouter(tags=["geocode"])


class Place(BaseModel):
    name: str
    label: str
    position: tuple[float, float]
    category: str | None
    source: Literal["zone", "poi", "osm"]


class PlaceList(BaseModel):
    items: list[Place]


def _near(raw: str | None) -> tuple[float, float] | None:
    if raw is None:
        return None
    try:
        lng, lat = (float(x) for x in raw.split(","))
    except ValueError:
        raise AppError(400, "BAD_REQUEST", "near debe ser lng,lat") from None
    if not (-180 <= lng <= 180 and -90 <= lat <= 90):
        raise AppError(400, "BAD_REQUEST", "near fuera de rango")
    return lng, lat


@router.get("/geocode", response_model=PlaceList,
            responses={429: {"description": "RATE_LIMITED"}, 503: {"description": "GEOCODING_UNAVAILABLE"}},
            summary="Buscar lugares por nombre (POIs propios y OSM/Nominatim)")
def search(
    user: CurrentUser,
    db: DB,
    q: Annotated[str, Query(min_length=2, max_length=120)],
    limit: Annotated[int, Query(ge=1, le=10)] = 5,
    near: Annotated[str | None, Query(max_length=60, description="lng,lat")] = None,
) -> dict[str, Any]:
    enforce(f"geocode:{user.id}", get_settings().geocoding_per_minute, 60)
    query = " ".join(q.split())
    if len(query) < 2:
        raise AppError(422, "VALIDATION_ERROR", "Datos inválidos",
                       [{"loc": ["query", "q"], "msg": "Mínimo 2 caracteres", "type": "value_error"}])
    return geocode.search(db, query, limit, _near(near))
