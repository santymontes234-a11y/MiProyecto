import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from app.core.deps import DB, Permissions, require_permission
from app.models import CitizenReportCategory, CitizenReportStatus, User
from app.routers.stats import check_range
from app.schemas.citizen_report import CitizenReportCreate, CitizenReportOut, CitizenReportUpdate
from app.schemas.common import Page, UtcDatetime
from app.schemas.geo import parse_bbox
from app.services import citizen_reports as service

router = APIRouter(tags=["citizen-reports"])

Reporter = Annotated[User, Depends(require_permission(Permissions.CITIZEN_REPORT_CREATE))]
Manager = Annotated[User, Depends(require_permission(Permissions.CITIZEN_REPORTS_MANAGE))]
PageQ = Annotated[int, Query(ge=1, le=10_000)]
PageSizeQ = Annotated[int, Query(ge=1, le=100)]


@router.post("/citizen-reports", status_code=status.HTTP_201_CREATED, response_model=CitizenReportOut,
             responses={429: {"description": "RATE_LIMITED (máx. 10 por día)"}},
             summary="Crear reporte ciudadano")
def create(data: CitizenReportCreate, user: Reporter, db: DB) -> dict[str, Any]:
    return service.create(db, user, data)


@router.get("/citizen-reports/mine", response_model=Page[CitizenReportOut], summary="Mis reportes ciudadanos")
def mine(user: Reporter, db: DB, page: PageQ = 1, page_size: PageSizeQ = 20) -> dict[str, Any]:
    return service.list_mine(db, user.id, page, page_size)


@router.get("/admin/citizen-reports", response_model=Page[CitizenReportOut], tags=["admin"],
            summary="Listar reportes ciudadanos")
def list_admin(
    _: Manager,
    db: DB,
    page: PageQ = 1,
    page_size: PageSizeQ = 20,
    status_: Annotated[CitizenReportStatus | None, Query(alias="status")] = None,
    category: CitizenReportCategory | None = None,
    from_: Annotated[UtcDatetime | None, Query(alias="from")] = None,
    to: UtcDatetime | None = None,
    bbox: Annotated[str | None, Query(max_length=100)] = None,
) -> dict[str, Any]:
    check_range(from_, to)
    return service.list_admin(db, page=page, page_size=page_size, status=status_, category=category,
                              date_from=from_, date_to=to, bbox=parse_bbox(bbox) if bbox else None)


@router.patch("/admin/citizen-reports/{report_id}", response_model=CitizenReportOut, tags=["admin"],
              responses={404: {"description": "CITIZEN_REPORT_NOT_FOUND"}},
              summary="Cambiar estado de un reporte ciudadano")
def update_admin(report_id: uuid.UUID, data: CitizenReportUpdate, actor: Manager, db: DB) -> dict[str, Any]:
    return service.update_admin(db, actor, report_id, data)
