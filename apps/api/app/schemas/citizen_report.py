import uuid

from pydantic import Field

from app.models.enums import CitizenReportCategory, CitizenReportStatus
from app.schemas.common import InputModel, OutputModel, UtcDatetime
from app.schemas.geo import PointGeometry


class CitizenReportCreate(InputModel):
    category: CitizenReportCategory
    title: str = Field(min_length=3, max_length=120)
    description: str = Field("", max_length=2000)
    location: PointGeometry
    poi_id: uuid.UUID | None = None


class CitizenReportUpdate(InputModel):
    status: CitizenReportStatus
    resolution_note: str | None = Field(None, max_length=1000)


class CitizenReportOut(OutputModel):
    id: uuid.UUID
    category: CitizenReportCategory
    status: CitizenReportStatus
    title: str
    description: str
    location: PointGeometry
    poi_id: uuid.UUID | None
    reporter_id: uuid.UUID | None
    resolution_note: str | None
    created_at: UtcDatetime
    updated_at: UtcDatetime
