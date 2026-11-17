import uuid
from typing import Any

from pydantic import Field

from app.models.enums import (
    AchievementCriterion,
    NotificationType,
    RankingPeriod,
    TransportMode,
    VehicleType,
)
from app.schemas.common import InputModel, OutputModel, UtcDatetime


class AchievementOut(OutputModel):
    id: uuid.UUID
    code: str
    name: str
    description: str
    icon: str
    criterion: AchievementCriterion
    threshold: float
    bonus_points: int
    is_active: bool


class UserAchievementOut(OutputModel):
    achievement: AchievementOut
    awarded_at: UtcDatetime | None
    progress: float


class GamificationProfile(OutputModel):
    points_total: int
    level: int
    level_points: int
    next_level_points: int | None


class RankingEntry(OutputModel):
    position: int
    display_name: str
    points: int
    is_me: bool


class RankingMe(OutputModel):
    position: int
    points: int


class Ranking(OutputModel):
    period: RankingPeriod
    period_start: UtcDatetime | None
    entries: list[RankingEntry]
    me: RankingMe | None


class AchievementCreate(InputModel):
    code: str = Field(pattern=r"^[A-Z0-9_]{2,40}$")
    name: str = Field(min_length=2, max_length=80)
    description: str = Field("", max_length=300)
    icon: str = Field("", max_length=40)
    criterion: AchievementCriterion
    threshold: float = Field(gt=0, le=1e12)
    bonus_points: int = Field(0, ge=0, le=10_000)
    is_active: bool = True


class AchievementUpdate(InputModel):
    name: str | None = Field(None, min_length=2, max_length=80)
    description: str | None = Field(None, max_length=300)
    icon: str | None = Field(None, max_length=40)
    criterion: AchievementCriterion | None = None
    threshold: float | None = Field(None, gt=0, le=1e12)
    bonus_points: int | None = Field(None, ge=0, le=10_000)
    is_active: bool | None = None


class NotificationOut(OutputModel):
    id: uuid.UUID
    type: NotificationType
    title: str
    body: str
    data: dict[str, Any]
    read_at: UtcDatetime | None
    created_at: UtcDatetime


class NotificationPage(OutputModel):
    items: list[NotificationOut]
    total: int
    page: int
    page_size: int
    unread_count: int


class TransportModeInfoOut(OutputModel):
    mode: TransportMode
    max_speed_kmh: float
    is_active: bool


class TransportModeUpdate(InputModel):
    max_speed_kmh: float | None = Field(None, gt=0, le=300)
    is_active: bool | None = None


class VehicleTypeInfoOut(OutputModel):
    code: VehicleType
    max_occupants: int
    is_active: bool
