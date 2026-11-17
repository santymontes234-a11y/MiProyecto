import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response, status

from app.core.deps import DB, Permissions, require_permission
from app.models import (
    Achievement,
    AuditLog,
    EmissionFactor,
    ReportFormat,
    Role,
    TransportMode,
    TransportModeInfo,
    TripSource,
    TripStatus,
    User,
)
from app.routers.stats import check_range
from app.schemas.admin import (
    AdminOverview,
    AuditLogOut,
    EmissionFactorOut,
    EmissionFactorUpdate,
    ReasonBody,
    ReportCreate,
    ReportOut,
    UserRoleUpdate,
    UserStatusUpdate,
)
from app.schemas.common import Page, UtcDatetime
from app.schemas.gamification import (
    AchievementCreate,
    AchievementOut,
    AchievementUpdate,
    TransportModeInfoOut,
    TransportModeUpdate,
)
from app.schemas.map import PoiCreate, PoiFeature, PoiUpdate
from app.schemas.trip import AdminTripSummary
from app.schemas.user import UserOut
from app.services import admin as admin_service
from app.services import reports as reports_service

router = APIRouter(prefix="/admin", tags=["admin"])


def _perm(code: str) -> Any:
    return Annotated[User, Depends(require_permission(code))]


PageQ = Annotated[int, Query(ge=1, le=10_000)]
PageSizeQ = Annotated[int, Query(ge=1, le=100)]
_403_404 = {403: {"description": "FORBIDDEN"}, 404: {"description": "USER_NOT_FOUND"},
            409: {"description": "CONFLICT (debe quedar ≥ 1 SUPER_ADMIN activo)"}}


@router.get("/users", response_model=Page[UserOut], summary="Listar usuarios")
def list_users(
    _: _perm(Permissions.USERS_READ),
    db: DB,
    page: PageQ = 1,
    page_size: PageSizeQ = 20,
    q: Annotated[str | None, Query(max_length=100)] = None,
    role: Role | None = None,
    is_active: bool | None = None,
) -> dict[str, Any]:
    items, total = admin_service.list_users(db, page=page, page_size=page_size, q=q, role=role, is_active=is_active)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/users/{user_id}", response_model=UserOut, responses={404: {"description": "USER_NOT_FOUND"}},
            summary="Detalle de usuario")
def get_user(user_id: uuid.UUID, _: _perm(Permissions.USERS_READ), db: DB) -> User:
    return admin_service.get_user(db, user_id)


@router.patch("/users/{user_id}/status", response_model=UserOut, responses=_403_404,
              summary="Activar o desactivar usuario")
def set_status(user_id: uuid.UUID, data: UserStatusUpdate, actor: _perm(Permissions.USERS_SET_STATUS),
               db: DB) -> User:
    return admin_service.set_status(db, actor, user_id, data.is_active, data.reason)


@router.patch("/users/{user_id}/role", response_model=UserOut, responses=_403_404,
              summary="Cambiar rol (solo SUPER_ADMIN)")
def set_role(user_id: uuid.UUID, data: UserRoleUpdate, actor: _perm(Permissions.USERS_SET_ROLE), db: DB) -> User:
    return admin_service.set_role(db, actor, user_id, data.role)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_403_404,
               summary="Borrar usuario (solo SUPER_ADMIN, borrado físico)")
def delete_user(user_id: uuid.UUID, data: ReasonBody, actor: _perm(Permissions.USERS_DELETE), db: DB) -> Response:
    admin_service.delete_user(db, actor, user_id, data.reason)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/trips", response_model=Page[AdminTripSummary], summary="Listar viajes de todos (sin trazas)")
def list_trips(
    _: _perm(Permissions.TRIPS_READ_ANY),
    db: DB,
    page: PageQ = 1,
    page_size: PageSizeQ = 20,
    user_id: uuid.UUID | None = None,
    mode: TransportMode | None = None,
    status_: Annotated[TripStatus | None, Query(alias="status")] = None,
    source: TripSource | None = None,
    from_: Annotated[UtcDatetime | None, Query(alias="from")] = None,
    to: UtcDatetime | None = None,
) -> dict[str, Any]:
    check_range(from_, to)
    items, total = admin_service.list_trips(db, page=page, page_size=page_size, user_id=user_id, mode=mode,
                                            status=status_, source=source, date_from=from_, date_to=to)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.delete("/trips/{trip_id}", status_code=status.HTTP_204_NO_CONTENT,
               responses={404: {"description": "TRIP_NOT_FOUND"}}, summary="Borrar un viaje (auditado)")
def delete_trip(trip_id: uuid.UUID, data: ReasonBody, actor: _perm(Permissions.TRIPS_DELETE_ANY), db: DB) -> Response:
    admin_service.delete_trip(db, actor, trip_id, data.reason)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/transport-modes/{mode}", response_model=TransportModeInfoOut,
              summary="Editar velocidad máxima o activar/desactivar un medio (solo SUPER_ADMIN)")
def update_transport_mode(mode: TransportMode, data: TransportModeUpdate,
                          actor: _perm(Permissions.TRANSPORT_MODES_WRITE), db: DB) -> TransportModeInfo:
    return admin_service.update_transport_mode(db, actor, mode, data)


@router.post("/achievements", status_code=status.HTTP_201_CREATED, response_model=AchievementOut,
             summary="Crear logro")
def create_achievement(data: AchievementCreate, actor: _perm(Permissions.CATALOG_MANAGE), db: DB) -> Achievement:
    return admin_service.create_achievement(db, actor, data)


@router.patch("/achievements/{achievement_id}", response_model=AchievementOut,
              responses={404: {"description": "ACHIEVEMENT_NOT_FOUND"}}, summary="Editar logro")
def update_achievement(achievement_id: uuid.UUID, data: AchievementUpdate,
                       actor: _perm(Permissions.CATALOG_MANAGE), db: DB) -> Achievement:
    return admin_service.update_achievement(db, actor, achievement_id, data)


@router.get("/reports", response_model=Page[ReportOut], summary="Informes generados")
def list_reports(_: _perm(Permissions.REPORTS_EXPORT), db: DB, page: PageQ = 1,
                 page_size: PageSizeQ = 20) -> dict[str, Any]:
    return reports_service.list_reports(db, page, page_size)


@router.post("/reports", status_code=status.HTTP_201_CREATED, response_model=ReportOut,
             summary="Generar informe CSV/PDF (audit_logs solo SUPER_ADMIN)")
def create_report(data: ReportCreate, actor: _perm(Permissions.REPORTS_EXPORT), db: DB) -> Any:
    check_range(data.from_, data.to)
    return reports_service.create(db, actor, data.report_type, data.format, data.from_, data.to)


@router.get("/reports/{report_id}/download", responses={404: {"description": "REPORT_NOT_FOUND"}},
            summary="Descargar informe")
def download_report(report_id: uuid.UUID, actor: _perm(Permissions.REPORTS_EXPORT), db: DB) -> Response:
    report = reports_service.download(db, actor, report_id)
    is_csv = report.format == ReportFormat.CSV
    name = f"ecomove-{report.report_type.value}-{report.created_at:%Y%m%d-%H%M}.{report.format.value}"
    return Response(
        content=report.content,
        media_type="text/csv; charset=utf-8" if is_csv else "application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"},
    )


@router.get("/stats/overview", response_model=AdminOverview, summary="Resumen global")
def overview(
    _: _perm(Permissions.STATS_GLOBAL),
    db: DB,
    from_: Annotated[UtcDatetime | None, Query(alias="from")] = None,
    to: UtcDatetime | None = None,
) -> dict[str, Any]:
    check_range(from_, to)
    return admin_service.overview(db, from_, to)


@router.post("/map/pois", status_code=status.HTTP_201_CREATED, response_model=PoiFeature, summary="Crear POI")
def create_poi(data: PoiCreate, actor: _perm(Permissions.CATALOG_MANAGE), db: DB) -> dict[str, Any]:
    return admin_service.create_poi(db, actor, data)


@router.patch("/map/pois/{poi_id}", response_model=PoiFeature, responses={404: {"description": "POI_NOT_FOUND"}},
              summary="Editar POI")
def update_poi(poi_id: uuid.UUID, data: PoiUpdate, actor: _perm(Permissions.CATALOG_MANAGE), db: DB) -> dict[str, Any]:
    return admin_service.update_poi(db, actor, poi_id, data)


@router.delete("/map/pois/{poi_id}", status_code=status.HTTP_204_NO_CONTENT,
               responses={404: {"description": "POI_NOT_FOUND"}}, summary="Desactivar POI (borrado lógico)")
def delete_poi(poi_id: uuid.UUID, actor: _perm(Permissions.CATALOG_MANAGE), db: DB) -> Response:
    admin_service.delete_poi(db, actor, poi_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/emission-factors", response_model=list[EmissionFactorOut], summary="Factores de emisión vigentes")
def list_factors(_: _perm(Permissions.EMISSION_FACTORS_READ), db: DB) -> list[EmissionFactor]:
    return admin_service.list_factors(db)


@router.put("/emission-factors/{mode}", response_model=EmissionFactorOut,
            summary="Actualizar factor de emisión (solo SUPER_ADMIN)")
def update_factor(mode: TransportMode, data: EmissionFactorUpdate,
                  actor: _perm(Permissions.EMISSION_FACTORS_WRITE), db: DB) -> EmissionFactor:
    return admin_service.update_factor(db, actor, mode, data.grams_per_km)


@router.get("/audit-logs", response_model=Page[AuditLogOut], summary="Bitácora de auditoría (solo SUPER_ADMIN)")
def audit_logs(
    _: _perm(Permissions.AUDIT_READ),
    db: DB,
    page: PageQ = 1,
    page_size: PageSizeQ = 20,
    actor_id: uuid.UUID | None = None,
    action: Annotated[str | None, Query(max_length=64, pattern=r"^[A-Z_]+$")] = None,
) -> dict[str, Any]:
    items: list[AuditLog]
    items, total = admin_service.list_audit(db, page=page, page_size=page_size, actor_id=actor_id, action=action)
    return {"items": items, "total": total, "page": page, "page_size": page_size}
