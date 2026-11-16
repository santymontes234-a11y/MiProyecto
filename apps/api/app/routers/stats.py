from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.core.deps import DB, Permissions, require_permission
from app.core.errors import AppError
from app.models import Granularity, User
from app.schemas.common import UtcDatetime
from app.schemas.stats import StatsSummary, TimeSeries
from app.services import stats as stats_service

router = APIRouter(prefix="/stats", tags=["stats"])

StatsUser = Annotated[User, Depends(require_permission(Permissions.STATS_OWN))]
From = Annotated[UtcDatetime | None, Query(alias="from")]
MAX_POINTS = {Granularity.DAY: 366, Granularity.WEEK: 260, Granularity.MONTH: 120}


def check_range(date_from: Any, date_to: Any) -> None:
    if date_from is not None and date_to is not None and date_to <= date_from:
        raise AppError(400, "BAD_REQUEST", "`to` debe ser posterior a `from`")


@router.get("/me", response_model=StatsSummary, summary="Estadísticas propias")
def me(user: StatsUser, db: DB, from_: From = None, to: UtcDatetime | None = None) -> dict[str, Any]:
    check_range(from_, to)
    return stats_service.summary(db, user.id, from_, to)


@router.get("/me/timeseries", response_model=TimeSeries, summary="Serie temporal propia")
def me_timeseries(
    user: StatsUser,
    db: DB,
    granularity: Granularity,
    from_: Annotated[UtcDatetime, Query(alias="from")],
    to: UtcDatetime,
) -> dict[str, Any]:
    check_range(from_, to)
    days = (to - from_).days
    per = {Granularity.DAY: 1, Granularity.WEEK: 7, Granularity.MONTH: 30}[granularity]
    if days / per > MAX_POINTS[granularity]:
        raise AppError(400, "BAD_REQUEST", "Rango demasiado amplio para la granularidad solicitada")
    return stats_service.timeseries(db, user.id, granularity, from_, to)


@router.get("/city", response_model=StatsSummary, summary="Estadísticas agregadas anónimas de la ciudad")
def city(db: DB, from_: From = None, to: UtcDatetime | None = None) -> dict[str, Any]:
    check_range(from_, to)
    return stats_service.city_summary(db, from_, to)
