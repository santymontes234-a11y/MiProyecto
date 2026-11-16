from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field

from app.core.errors import AppError

MAX_ROUTE_POINTS = 10_000
MAX_BBOX_DEGREES = 0.5


def _check_position(pos: tuple[float, float]) -> tuple[float, float]:
    lng, lat = pos
    if not (-180 <= lng <= 180 and -90 <= lat <= 90):
        raise ValueError("Coordenada fuera de rango [lng, lat]")
    return pos


Position = Annotated[tuple[float, float], AfterValidator(_check_position)]


class PointGeometry(BaseModel):
    type: Literal["Point"]
    coordinates: Position


class LineStringGeometry(BaseModel):
    type: Literal["LineString"]
    coordinates: list[Position] = Field(min_length=2, max_length=MAX_ROUTE_POINTS)


def parse_bbox(raw: str) -> tuple[float, float, float, float]:
    try:
        parts = [float(p) for p in raw.split(",")]
    except ValueError as exc:
        raise AppError(400, "BBOX_INVALID", "bbox debe ser minLng,minLat,maxLng,maxLat") from exc
    if len(parts) != 4:
        raise AppError(400, "BBOX_INVALID", "bbox debe ser minLng,minLat,maxLng,maxLat")
    min_lng, min_lat, max_lng, max_lat = parts
    if not (-180 <= min_lng < max_lng <= 180 and -90 <= min_lat < max_lat <= 90):
        raise AppError(400, "BBOX_INVALID", "bbox fuera de rango o invertido")
    if max_lng - min_lng > MAX_BBOX_DEGREES or max_lat - min_lat > MAX_BBOX_DEGREES:
        raise AppError(400, "BBOX_TOO_LARGE", "El área solicitada es demasiado grande")
    return min_lng, min_lat, max_lng, max_lat
