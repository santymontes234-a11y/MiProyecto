import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.enums import PoiCategory
from app.schemas.common import InputModel
from app.schemas.geo import LineStringGeometry, PointGeometry


class PoiProperties(BaseModel):
    name: str
    category: PoiCategory
    description: str | None
    attributes: dict[str, Any]


class PoiFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: uuid.UUID
    geometry: PointGeometry
    properties: PoiProperties


class PoiCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[PoiFeature]


class CyclewayProperties(BaseModel):
    name: str | None
    is_protected: bool
    length_m: float


class CyclewayFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: uuid.UUID
    geometry: LineStringGeometry
    properties: CyclewayProperties


class CyclewayCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[CyclewayFeature]


class PoiCreate(InputModel):
    name: str = Field(min_length=1, max_length=160)
    category: PoiCategory
    description: str | None = Field(None, max_length=2000)
    location: PointGeometry
    attributes: dict[str, Any] = Field(default_factory=dict)


class PoiUpdate(InputModel):
    name: str | None = Field(None, min_length=1, max_length=160)
    category: PoiCategory | None = None
    description: str | None = Field(None, max_length=2000)
    location: PointGeometry | None = None
    attributes: dict[str, Any] | None = None
    is_active: bool | None = None
