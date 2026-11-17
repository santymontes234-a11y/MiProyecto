"""GET /routes — ruteo origen → destino (API_CONTRACT 1.1.0 §12, rol USER).

Montaje (Backend, app/main.py): ``app.include_router(routes.router, prefix=api_prefix)``.
Lógica en app/services/geo_analytics/routing.py; firma del token en app/core/route_token.py.
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.core.deps import CurrentUser
from app.core.errors import AppError
from app.models import TransportMode
from app.services.geo_analytics import routing

router = APIRouter(tags=["routes"])


class LineString(BaseModel):
    type: Literal["LineString"] = "LineString"
    coordinates: list[list[float]]


class RouteResponse(BaseModel):
    mode: TransportMode
    distance_m: float
    duration_s: int
    route: LineString
    route_token: str
    provider: str


def _position(raw: str, name: str) -> tuple[float, float]:
    try:
        lng, lat = (float(x) for x in raw.split(","))
    except ValueError:
        raise AppError(400, "BAD_REQUEST", f"{name} debe ser lng,lat") from None
    if not (-180 <= lng <= 180 and -90 <= lat <= 90):
        raise AppError(400, "BAD_REQUEST", f"{name} fuera de rango")
    return lng, lat


@router.get("/routes", response_model=RouteResponse)
def get_route(
    _user: CurrentUser,
    origin: Annotated[str, Query(description="lng,lat")],
    destination: Annotated[str, Query(description="lng,lat")],
    mode: TransportMode,
) -> RouteResponse:
    result = routing.route(
        mode.value, _position(origin, "origin"), _position(destination, "destination")
    )
    return RouteResponse(**result.to_contract())
