"""Gamificación (§9), notificaciones (§10) y catálogos de medios y vehículos (§8).

`/catalog/zones` pertenece al módulo geo y se monta desde su propio router.
"""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import select

from app.core.deps import DB, CurrentUser, Permissions, require_permission
from app.models import Achievement, RankingPeriod, TransportModeInfo, User, VehicleTypeInfo
from app.schemas.gamification import (
    AchievementOut,
    GamificationProfile,
    NotificationPage,
    Ranking,
    TransportModeInfoOut,
    VehicleTypeInfoOut,
)
from app.services import gamification, notifications

router = APIRouter()

ProfileUser = Annotated[User, Depends(require_permission(Permissions.PROFILE_OWN))]


@router.get("/achievements", response_model=list[AchievementOut], tags=["gamification"],
            summary="Logros activos")
def list_achievements(db: DB) -> list[Achievement]:
    return list(db.execute(
        select(Achievement).where(Achievement.is_active.is_(True)).order_by(Achievement.threshold, Achievement.code)
    ).scalars())


@router.get("/gamification/me", response_model=GamificationProfile, tags=["gamification"],
            summary="Puntos y nivel propios")
def my_profile(user: ProfileUser, db: DB) -> dict[str, Any]:
    return gamification.profile(db, user.id)


@router.get("/gamification/ranking", response_model=Ranking, tags=["gamification"],
            summary="Ranking de la ciudad (top 50, solo usuarios con ranking_opt_in)")
def ranking(user: ProfileUser, db: DB, period: RankingPeriod = RankingPeriod.WEEK) -> dict[str, Any]:
    return gamification.ranking(db, user, period)


@router.get("/notifications", response_model=NotificationPage, tags=["notifications"],
            summary="Notificaciones propias")
def list_notifications(
    user: CurrentUser,
    db: DB,
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    unread_only: bool = False,
) -> dict[str, Any]:
    return notifications.list_for(db, user.id, page=page, page_size=page_size, unread_only=unread_only)


@router.post("/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT, tags=["notifications"],
             summary="Marcar todas como leídas")
def read_all(user: CurrentUser, db: DB) -> Response:
    notifications.mark_all_read(db, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT,
             tags=["notifications"], responses={404: {"description": "NOTIFICATION_NOT_FOUND"}},
             summary="Marcar una notificación como leída")
def read_one(notification_id: uuid.UUID, user: CurrentUser, db: DB) -> Response:
    notifications.mark_read(db, user.id, notification_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/catalog/transport-modes", response_model=list[TransportModeInfoOut], tags=["catalog"],
            summary="Medios de transporte (sin factores)")
def transport_modes(db: DB) -> list[TransportModeInfo]:
    return list(db.execute(select(TransportModeInfo).order_by(TransportModeInfo.mode)).scalars())


@router.get("/catalog/vehicle-types", response_model=list[VehicleTypeInfoOut], tags=["catalog"],
            summary="Tipos de vehículo (sin factores)")
def vehicle_types(db: DB) -> list[VehicleTypeInfo]:
    return list(db.execute(select(VehicleTypeInfo).order_by(VehicleTypeInfo.code)).scalars())
