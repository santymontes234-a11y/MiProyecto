"""Informes administrativos CSV/PDF (contrato §7, §7.1). Generación síncrona, máx. MAX_REPORT_ROWS filas.

Nunca incluyen trazas, coordenadas, emails ni nombres. Los agregados aplican k-anonimato (≥ 5 usuarios
distintos por grupo, §13). El contenido se guarda en `reports.content` y su descarga se audita.
"""

import csv
import io
import json
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import Permissions, permissions_for
from app.core.errors import AppError, forbidden
from app.models import AuditLog, CitizenReport, Report, ReportFormat, ReportType, Trip, User
from app.services import admin as admin_service
from app.services import audit

MIN_USERS = 5
TZ = "America/Mexico_City"

Rows = tuple[list[str], list[list[Any]]]


def _range(col: Any, date_from: datetime | None, date_to: datetime | None) -> list[Any]:
    conds = []
    if date_from is not None:
        conds.append(col >= date_from)
    if date_to is not None:
        conds.append(col < date_to)
    return conds


def _limit() -> int:
    return get_settings().max_report_rows


def _check_size(rows: list[Any]) -> list[Any]:
    if len(rows) > _limit():
        raise AppError(400, "BAD_REQUEST", f"El informe supera {_limit()} filas; acota el rango de fechas")
    return rows


def _trips(db: Session, f: datetime | None, t: datetime | None) -> Rows:
    cols = ["id", "user_id", "mode", "source", "status", "started_at", "ended_at", "distance_m", "duration_s",
            "co2_emitted_g", "co2_saved_g"]
    rows = db.execute(
        select(Trip.id, Trip.user_id, Trip.mode, Trip.source, Trip.status, Trip.started_at, Trip.ended_at,
               Trip.distance_m, Trip.duration_s, Trip.co2_emitted_g, Trip.co2_saved_g)
        .where(*_range(Trip.started_at, f, t)).order_by(Trip.started_at).limit(_limit() + 1)
    ).all()
    return cols, _check_size([list(r) for r in rows])


def _users(db: Session, f: datetime | None, t: datetime | None) -> Rows:
    cols = ["id", "role", "is_active", "email_verified", "created_at", "trips_count"]
    trips = select(func.count()).where(Trip.user_id == User.id).correlate(User).scalar_subquery()
    rows = db.execute(
        select(User.id, User.role, User.is_active, User.email_verified_at.is_not(None), User.created_at, trips)
        .where(*_range(User.created_at, f, t)).order_by(User.created_at).limit(_limit() + 1)
    ).all()
    return cols, _check_size([list(r) for r in rows])


def _co2_by_mode(db: Session, f: datetime | None, t: datetime | None) -> Rows:
    cols = ["mode", "trips_count", "users", "distance_m", "co2_emitted_g", "co2_saved_g"]
    rows = db.execute(text("""
        SELECT mode::text, count(*), count(DISTINCT user_id), round(sum(distance_m)::numeric, 1),
               round(sum(co2_emitted_g)::numeric, 2), round(sum(co2_saved_g)::numeric, 2)
        FROM trips
        WHERE status = 'COMPLETED' AND (CAST(:f AS timestamptz) IS NULL OR started_at >= :f)
          AND (CAST(:t AS timestamptz) IS NULL OR started_at < :t)
        GROUP BY mode HAVING count(DISTINCT user_id) >= :k ORDER BY mode
    """), {"f": f, "t": t, "k": MIN_USERS}).all()
    return cols, [list(r) for r in rows]


def _co2_by_zone(db: Session, f: datetime | None, t: datetime | None) -> Rows:
    cols = ["zone_code", "zone_name", "kind", "trips_count", "users", "distance_m", "co2_saved_g"]
    rows = db.execute(text("""
        SELECT z.code, z.name, z.kind::text, count(*), count(DISTINCT tr.user_id),
               round(sum(tr.distance_m)::numeric, 1), round(sum(tr.co2_saved_g)::numeric, 2)
        FROM geo.mobility_zones z
        JOIN trips tr ON ST_Within(ST_StartPoint(tr.route), z.geom)
        WHERE NOT z.is_demo AND tr.status = 'COMPLETED'
          AND (CAST(:f AS timestamptz) IS NULL OR tr.started_at >= :f)
          AND (CAST(:t AS timestamptz) IS NULL OR tr.started_at < :t)
        GROUP BY z.code, z.name, z.kind HAVING count(DISTINCT tr.user_id) >= :k ORDER BY z.code
    """), {"f": f, "t": t, "k": MIN_USERS}).all()
    return cols, [list(r) for r in rows]


def _timeseries(db: Session, f: datetime | None, t: datetime | None) -> Rows:
    cols = ["period_start", "trips_count", "active_users", "distance_m", "co2_saved_g"]
    rows = db.execute(text(f"""
        SELECT (date_trunc('month', started_at AT TIME ZONE '{TZ}') AT TIME ZONE '{TZ}') AS p,
               count(*), count(DISTINCT user_id), round(sum(distance_m)::numeric, 1),
               round(sum(co2_saved_g)::numeric, 2)
        FROM trips
        WHERE status = 'COMPLETED' AND (CAST(:f AS timestamptz) IS NULL OR started_at >= :f)
          AND (CAST(:t AS timestamptz) IS NULL OR started_at < :t)
        GROUP BY p HAVING count(DISTINCT user_id) >= :k ORDER BY p
    """), {"f": f, "t": t, "k": MIN_USERS}).all()  # noqa: S608 - TZ es constante
    return cols, [list(r) for r in rows]


def _overview(db: Session, f: datetime | None, t: datetime | None) -> Rows:
    data = admin_service.overview(db, f, t)
    rows: list[list[Any]] = [[k, data[k]] for k in ("users_total", "users_active_30d", "trips_total",
                                                     "distance_m", "co2_saved_g")]
    rows += [[f"trips_{m['mode']}", m["trips_count"]] for m in data["by_mode"]]
    return ["metric", "value"], rows


def _citizen_reports(db: Session, f: datetime | None, t: datetime | None) -> Rows:
    cols = ["id", "category", "status", "title", "poi_id", "resolution_note", "created_at", "updated_at"]
    rows = db.execute(
        select(CitizenReport.id, CitizenReport.category, CitizenReport.status, CitizenReport.title,
               CitizenReport.poi_id, CitizenReport.resolution_note, CitizenReport.created_at,
               CitizenReport.updated_at)
        .where(*_range(CitizenReport.created_at, f, t)).order_by(CitizenReport.created_at).limit(_limit() + 1)
    ).all()
    return cols, _check_size([list(r) for r in rows])


def _audit_logs(db: Session, f: datetime | None, t: datetime | None) -> Rows:
    cols = ["id", "actor_id", "action", "entity_type", "entity_id", "payload", "created_at"]
    rows = db.execute(
        select(AuditLog.id, AuditLog.actor_id, AuditLog.action, AuditLog.entity_type, AuditLog.entity_id,
               AuditLog.payload, AuditLog.created_at)
        .where(*_range(AuditLog.created_at, f, t)).order_by(AuditLog.created_at).limit(_limit() + 1)
    ).all()
    return cols, _check_size([[*r[:5], json.dumps(r[5], ensure_ascii=False), r[6]] for r in rows])


_BUILDERS = {
    ReportType.OVERVIEW: _overview, ReportType.TRIPS: _trips, ReportType.USERS: _users,
    ReportType.CO2_BY_MODE: _co2_by_mode, ReportType.CO2_BY_ZONE: _co2_by_zone,
    ReportType.ANALYTICS_TIMESERIES: _timeseries, ReportType.CITIZEN_REPORTS: _citizen_reports,
    ReportType.AUDIT_LOGS: _audit_logs,
}


def _cell(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.isoformat().replace("+00:00", "Z")
    if hasattr(v, "value"):
        return str(v.value)
    s = str(v)
    # Inyección de fórmulas en hojas de cálculo (§7.1).
    if isinstance(v, str) and s[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + s
    return s


def to_csv(cols: list[str], rows: list[list[Any]]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for r in rows:
        w.writerow([_cell(v) for v in r])
    return ("﻿" + buf.getvalue()).encode("utf-8")


def _pdf_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def to_pdf(title: str, cols: list[str], rows: list[list[Any]]) -> bytes:
    """PDF mínimo (texto Courier en A4 apaisado, WinAnsi) sin dependencias externas."""
    lines = [title, "", " | ".join(cols), "-" * 120]
    lines += [" | ".join(_cell(v) for v in r) for r in rows]
    lines = [ln[:150] for ln in lines]
    per_page = 50
    pages = [lines[i:i + per_page] for i in range(0, len(lines), per_page)] or [[title]]
    objects: list[bytes] = []
    n_pages = len(pages)
    # 1 catálogo, 2 árbol de páginas, 3 fuente, después (página, contenido) por cada página.
    kids = " ".join(f"{4 + 2 * i} 0 R" for i in range(n_pages))
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {n_pages} >>".encode())
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>")
    for i, page in enumerate(pages):
        body = ["BT", "/F1 7 Tf", "9 TL", "30 565 Td"]
        for ln in page:
            body.append(f"({_pdf_escape(ln)}) Tj T*")
        body.append(f"(Pagina {i + 1} de {n_pages}) Tj")
        body.append("ET")
        stream = "\n".join(body).encode("cp1252", errors="replace")
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> "
                       f"/Contents {5 + 2 * i} 0 R >>".encode())
        objects.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for idx, obj in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(f"{idx} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for off in offsets:
        out.write(f"{off:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return out.getvalue()


def create(db: Session, actor: User, report_type: ReportType, fmt: ReportFormat,
           date_from: datetime | None, date_to: datetime | None) -> Report:
    if report_type == ReportType.AUDIT_LOGS and \
            Permissions.REPORTS_EXPORT_AUDIT not in permissions_for(db, actor.role):
        raise forbidden("Solo SUPER_ADMIN puede exportar la bitácora de auditoría")
    cols, rows = _BUILDERS[report_type](db, date_from, date_to)
    params = {"from": date_from.isoformat() if date_from else None, "to": date_to.isoformat() if date_to else None}
    title = f"EcoMove Queretaro - informe {report_type.value} ({params['from'] or 'inicio'} a {params['to'] or 'hoy'})"
    content = to_csv(cols, rows) if fmt == ReportFormat.CSV else to_pdf(title, cols, rows)
    report = Report(id=uuid.uuid4(), report_type=report_type, format=fmt, parameters=params,
                    row_count=len(rows), content=content, created_by=actor.id)
    db.add(report)
    audit.record(db, "REPORT_CREATED", "report", report.id, actor,
                 {"report_type": report_type.value, "format": fmt.value, "rows": len(rows)})
    db.commit()
    return report


def list_reports(db: Session, page: int, page_size: int) -> dict[str, Any]:
    total = db.execute(select(func.count()).select_from(Report)).scalar_one()
    items = db.execute(
        select(Report.id, Report.report_type, Report.format, Report.parameters, Report.row_count,
               Report.created_by, Report.created_at)
        .order_by(Report.created_at.desc(), Report.id).limit(page_size).offset((page - 1) * page_size)
    ).mappings().all()
    return {"items": [dict(i) for i in items], "total": total, "page": page, "page_size": page_size}


def download(db: Session, actor: User, report_id: uuid.UUID) -> Report:
    report = db.get(Report, report_id)
    if report is None:
        raise AppError(404, "REPORT_NOT_FOUND", "Informe no encontrado")
    if report.report_type == ReportType.AUDIT_LOGS and \
            Permissions.REPORTS_EXPORT_AUDIT not in permissions_for(db, actor.role):
        raise AppError(404, "REPORT_NOT_FOUND", "Informe no encontrado")
    audit.record(db, "REPORT_DOWNLOADED", "report", report.id, actor, {"report_type": report.report_type.value})
    db.commit()
    return report
