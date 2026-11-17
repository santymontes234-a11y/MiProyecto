"""Reportes ciudadanos (contrato §11). El listado admin nunca expone email ni nombre del ciudadano."""

import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, rate_limited
from app.models import CitizenReport, CitizenReportCategory, CitizenReportStatus, Poi, User
from app.schemas.citizen_report import CitizenReportCreate, CitizenReportUpdate
from app.services import audit
from app.services.map import point_expr


def _row_to_dict(r: CitizenReport, geojson: str) -> dict[str, Any]:
    return {
        "id": r.id, "category": r.category, "status": r.status, "title": r.title,
        "description": r.description, "location": json.loads(geojson), "poi_id": r.poi_id,
        "reporter_id": r.reporter_id, "resolution_note": r.resolution_note,
        "created_at": r.created_at, "updated_at": r.updated_at,
    }


def _select():  # noqa: ANN202
    return select(CitizenReport, func.ST_AsGeoJSON(CitizenReport.location))


def _get(db: Session, report_id: uuid.UUID) -> dict[str, Any]:
    row = db.execute(_select().where(CitizenReport.id == report_id)).first()
    if row is None:
        raise AppError(404, "CITIZEN_REPORT_NOT_FOUND", "Reporte ciudadano no encontrado")
    return _row_to_dict(row[0], row[1])


def create(db: Session, user: User, data: CitizenReportCreate) -> dict[str, Any]:
    s = get_settings()
    lng, lat = data.location.coordinates
    min_lng, min_lat, max_lng, max_lat = s.service_area
    if not (min_lng <= lng <= max_lng and min_lat <= lat <= max_lat):
        raise AppError(422, "TRIP_OUTSIDE_SERVICE_AREA", "La ubicación está fuera del área de servicio")
    since = datetime.now(UTC) - timedelta(days=1)
    recent = db.execute(
        select(func.count(), func.min(CitizenReport.created_at))
        .where(CitizenReport.reporter_id == user.id, CitizenReport.created_at >= since)
    ).one()
    if recent[0] >= s.citizen_reports_per_day:
        retry = int((recent[1] + timedelta(days=1) - datetime.now(UTC)).total_seconds()) if recent[1] else 3600
        raise rate_limited(retry)
    if data.poi_id is not None and db.get(Poi, data.poi_id) is None:
        raise AppError(422, "VALIDATION_ERROR", "Datos inválidos",
                       [{"loc": ["body", "poi_id"], "msg": "El POI no existe", "type": "value_error"}])
    report = CitizenReport(
        id=uuid.uuid4(), reporter_id=user.id, category=data.category, status=CitizenReportStatus.OPEN,
        title=data.title, description=data.description, location=point_expr(data.location), poi_id=data.poi_id,
    )
    db.add(report)
    db.commit()
    return _get(db, report.id)


def _page(db: Session, conds: list[Any], page: int, page_size: int) -> dict[str, Any]:
    total = db.execute(select(func.count()).select_from(CitizenReport).where(*conds)).scalar_one()
    rows = db.execute(
        _select().where(*conds).order_by(CitizenReport.created_at.desc(), CitizenReport.id)
        .limit(page_size).offset((page - 1) * page_size)
    ).all()
    return {"items": [_row_to_dict(r, g) for r, g in rows], "total": total, "page": page, "page_size": page_size}


def list_mine(db: Session, user_id: uuid.UUID, page: int, page_size: int) -> dict[str, Any]:
    return _page(db, [CitizenReport.reporter_id == user_id], page, page_size)


def all_for_user(db: Session, user_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = db.execute(_select().where(CitizenReport.reporter_id == user_id)
                      .order_by(CitizenReport.created_at)).all()
    return [_row_to_dict(r, g) for r, g in rows]


def list_admin(
    db: Session, *, page: int, page_size: int, status: CitizenReportStatus | None,
    category: CitizenReportCategory | None, date_from: datetime | None, date_to: datetime | None,
    bbox: tuple[float, float, float, float] | None,
) -> dict[str, Any]:
    conds: list[Any] = []
    if status is not None:
        conds.append(CitizenReport.status == status)
    if category is not None:
        conds.append(CitizenReport.category == category)
    if date_from is not None:
        conds.append(CitizenReport.created_at >= date_from)
    if date_to is not None:
        conds.append(CitizenReport.created_at < date_to)
    if bbox is not None:
        conds.append(CitizenReport.location.op("&&")(func.ST_MakeEnvelope(*bbox, 4326)))
    return _page(db, conds, page, page_size)


def update_admin(db: Session, actor: User, report_id: uuid.UUID, data: CitizenReportUpdate) -> dict[str, Any]:
    report = db.execute(select(CitizenReport).where(CitizenReport.id == report_id).with_for_update()) \
        .scalar_one_or_none()
    if report is None:
        raise AppError(404, "CITIZEN_REPORT_NOT_FOUND", "Reporte ciudadano no encontrado")
    previous = report.status
    report.status = data.status
    if "resolution_note" in data.model_fields_set:
        report.resolution_note = data.resolution_note
    report.updated_at = datetime.now(UTC)
    audit.record(db, "CITIZEN_REPORT_UPDATED", "citizen_report", report.id, actor,
                 {"from": previous.value, "to": data.status.value})
    db.commit()
    return _get(db, report.id)
