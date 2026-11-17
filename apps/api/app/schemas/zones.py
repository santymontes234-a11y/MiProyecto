"""Esquemas de zonas de análisis (API_CONTRACT §7 y §8). Respaldo: geo.mobility_zones."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.models.enums import ZoneKind

Ring = Annotated[
    list[Annotated[list[float], Field(min_length=2, max_length=3)]], Field(min_length=4)
]


class PolygonGeometry(BaseModel):
    type: Literal["Polygon"]
    coordinates: Annotated[list[Ring], Field(min_length=1, max_length=500)]


class MultiPolygonGeometry(BaseModel):
    type: Literal["MultiPolygon"]
    coordinates: Annotated[
        list[Annotated[list[Ring], Field(min_length=1)]], Field(min_length=1, max_length=500)
    ]


ZoneGeometry = Annotated[PolygonGeometry | MultiPolygonGeometry, Field(discriminator="type")]


def _not_demo(v: str | None) -> str | None:
    if v is not None and v.strip().upper() == "DEMO":
        raise ValueError("source DEMO no se acepta; las zonas DEMO solo las crea geo.seed_demo")
    return v


class ZoneCreate(BaseModel):
    code: str = Field(pattern=r"^[A-Z0-9_-]{2,32}$")
    name: str = Field(min_length=2, max_length=120)
    kind: ZoneKind
    source: str = Field(min_length=2, max_length=80)
    geometry: ZoneGeometry

    _src = field_validator("source")(_not_demo)


class ZoneUpdate(BaseModel):
    """ZoneCreate con todo opcional salvo ``code``, que es inmutable y no se acepta aquí."""

    model_config = {"extra": "forbid"}

    name: str | None = Field(default=None, min_length=2, max_length=120)
    kind: ZoneKind | None = None
    source: str | None = Field(default=None, min_length=2, max_length=80)
    geometry: ZoneGeometry | None = None

    _src = field_validator("source")(_not_demo)


class ZoneProperties(BaseModel):
    code: str | None
    name: str
    kind: ZoneKind
    source: str
    area_km2: float


class ZoneFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str
    geometry: dict[str, Any]
    properties: ZoneProperties


class ZoneFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[ZoneFeature]
