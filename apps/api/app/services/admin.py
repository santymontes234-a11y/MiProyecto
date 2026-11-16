"""Operaciones administrativas. Toda modificación escribe un AuditLog en la misma transacción."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import Permissions, permissions_for
from app.core.errors import AppError, forbidden, not_found
from app.models import AuditLog, EmissionFactor, Poi, Role, TransportMode, Trip, TripStatus, User
from app.schemas.map import PoiCreate, PoiUpdate
from app.services import audit, map as map_service, stats
from app.services.auth import revoke_all_for_user


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_users(
    db: Session, *, page: int, page_size: int, q: str | None, role: Role | None, is_active: bool | None
) -> tuple[list[User], int]:
    conds = []
    if q:
        pattern = f"%{_escape_like(q.strip().lower())}%"
        conds.append(or_(User.email.like(pattern, escape="\\"), func.lower(User.full_name).like(pattern, escape="\\")))
    if role is not None:
        conds.append(User.role == role)
    if is_active is not None:
        conds.append(User.is_active.is_(is_active))
    total = db.execute(select(func.count()).select_from(User).where(*conds)).scalar_one()
    users = db.execute(
        select(User).where(*conds).order_by(User.created_at.desc(), User.id).limit(page_size).offset((page - 1) * page_size)
    ).scalars()
    return list(users), total


def get_user(db: Session, user_id: uuid.UUID, *, lock: bool = False) -> User:
    q = select(User).where(User.id == user_id)
    if lock:
        q = q.with_for_update()
    user = db.execute(q).scalar_one_or_none()
    if user is None:
        raise not_found("user")
    return user


def _ensure_other_super_admin(db: Session, excluding: uuid.UUID) -> None:
    """Debe existir siempre ≥ 1 SUPER_ADMIN activo (contrato §7). Bloquea las filas para evitar carreras."""
    others = db.execute(
        select(User.id)
        .where(User.role == Role.SUPER_ADMIN, User.is_active.is_(True), User.id != excluding)
        .with_for_update()
    ).all()
    if not others:
        raise AppError(409, "CONFLICT", "Debe existir al menos un SUPER_ADMIN activo")


def set_status(db: Session, actor: User, user_id: uuid.UUID, is_active: bool) -> User:
    if user_id == actor.id:
        raise forbidden("No puedes cambiar el estado de tu propia cuenta")
    target = get_user(db, user_id, lock=True)
    if target.role != Role.USER and Permissions.USERS_SET_STATUS_ADMIN not in permissions_for(db, actor.role):
        raise forbidden("Un ADMIN no puede cambiar el estado de un ADMIN ni de un SUPER_ADMIN")
    if target.is_active == is_active:
        db.rollback()
        return target
    if not is_active and target.role == Role.SUPER_ADMIN:
        _ensure_other_super_admin(db, target.id)
    target.is_active = is_active
    if not is_active:
        revoke_all_for_user(db, target.id)
    audit.record(db, "USER_ACTIVATED" if is_active else "USER_DEACTIVATED", "user", target.id, actor,
                 {"is_active": is_active})
    db.commit()
    return target


def set_role(db: Session, actor: User, user_id: uuid.UUID, role: Role) -> User:
    if user_id == actor.id:
        raise forbidden("No puedes cambiar tu propio rol")
    target = get_user(db, user_id, lock=True)
    if target.role == role:
        db.rollback()
        return target
    if target.role == Role.SUPER_ADMIN and target.is_active:
        _ensure_other_super_admin(db, target.id)
    previous = target.role
    target.role = role
    # El token lleva el rol como claim: se fuerzan nuevas sesiones con el rol actualizado.
    revoke_all_for_user(db, target.id)
    audit.record(db, "USER_ROLE_CHANGED", "user", target.id, actor, {"from": previous.value, "to": role.value})
    db.commit()
    return target


def overview(db: Session, date_from: datetime | None, date_to: datetime | None) -> dict[str, Any]:
    since = datetime.now(UTC) - timedelta(days=30)
    users_total = db.execute(select(func.count()).select_from(User)).scalar_one()
    users_active_30d = db.execute(
        select(func.count(func.distinct(Trip.user_id)))
        .join(User, User.id == Trip.user_id)
        .where(Trip.started_at >= since, Trip.status == TripStatus.COMPLETED, User.is_active.is_(True))
    ).scalar_one()
    s = stats.summary(db, None, date_from, date_to)
    return {
        "users_total": users_total,
        "users_active_30d": users_active_30d,
        "trips_total": s["trips_count"],
        "co2_saved_g": s["co2_saved_g"],
        "distance_m": s["distance_m"],
        "by_mode": s["by_mode"],
    }


# --- POIs ---------------------------------------------------------------------------------------


def create_poi(db: Session, actor: User, data: PoiCreate) -> dict[str, Any]:
    poi = Poi(
        id=uuid.uuid4(),
        name=data.name,
        category=data.category,
        description=data.description,
        attributes=data.attributes,
        location=map_service.point_expr(data.location),
        is_active=True,
    )
    db.add(poi)
    db.flush()
    audit.record(db, "POI_CREATED", "poi", poi.id, actor, {"name": data.name, "category": data.category.value})
    db.commit()
    return map_service.get_poi(db, poi.id, include_inactive=True)


def update_poi(db: Session, actor: User, poi_id: uuid.UUID, data: PoiUpdate) -> dict[str, Any]:
    poi = db.execute(select(Poi).where(Poi.id == poi_id).with_for_update()).scalar_one_or_none()
    if poi is None:
        raise not_found("poi")
    changes = data.model_dump(exclude_unset=True)
    for field in ("name", "description", "attributes", "is_active", "category"):
        if field in changes:
            if field in ("name", "is_active", "category", "attributes") and changes[field] is None:
                raise AppError(422, "VALIDATION_ERROR", "Datos inválidos",
                               [{"loc": ["body", field], "msg": "No puede ser null", "type": "value_error"}])
            setattr(poi, field, getattr(data, field))
    if "location" in changes:
        if data.location is None:
            raise AppError(422, "VALIDATION_ERROR", "Datos inválidos",
                           [{"loc": ["body", "location"], "msg": "No puede ser null", "type": "value_error"}])
        poi.location = map_service.point_expr(data.location)
    audit.record(db, "POI_UPDATED", "poi", poi.id, actor, {"fields": sorted(changes)})
    db.commit()
    return map_service.get_poi(db, poi.id, include_inactive=True)


def delete_poi(db: Session, actor: User, poi_id: uuid.UUID) -> None:
    poi = db.execute(select(Poi).where(Poi.id == poi_id).with_for_update()).scalar_one_or_none()
    if poi is None:
        raise not_found("poi")
    poi.is_active = False  # borrado lógico (DATABASE.md §1)
    audit.record(db, "POI_DELETED", "poi", poi.id, actor)
    db.commit()


# --- Factores de emisión ------------------------------------------------------------------------


def list_factors(db: Session) -> list[EmissionFactor]:
    return list(db.execute(select(EmissionFactor).order_by(EmissionFactor.mode)).scalars())


def update_factor(db: Session, actor: User, mode: TransportMode, grams_per_km: float) -> EmissionFactor:
    factor = db.execute(select(EmissionFactor).where(EmissionFactor.mode == mode).with_for_update()).scalar_one_or_none()
    if factor is None:
        raise AppError(404, "EMISSION_FACTOR_NOT_FOUND", "Factor de emisión no encontrado")
    previous = factor.grams_per_km
    factor.grams_per_km = grams_per_km
    factor.valid_from = datetime.now(UTC)
    factor.updated_by = actor.id
    # Los viajes ya guardados conservan su factor histórico (ARCHITECTURE.md §6).
    audit.record(db, "EMISSION_FACTOR_UPDATED", "emission_factor", None, actor,
                 {"mode": mode.value, "from": previous, "to": grams_per_km})
    db.commit()
    return factor


# --- Auditoría ----------------------------------------------------------------------------------


def list_audit(
    db: Session, *, page: int, page_size: int, actor_id: uuid.UUID | None, action: str | None
) -> tuple[list[AuditLog], int]:
    conds = []
    if actor_id is not None:
        conds.append(AuditLog.actor_id == actor_id)
    if action:
        conds.append(AuditLog.action == action)
    total = db.execute(select(func.count()).select_from(AuditLog).where(*conds)).scalar_one()
    rows = db.execute(
        select(AuditLog).where(*conds).order_by(AuditLog.created_at.desc(), AuditLog.id)
        .limit(page_size).offset((page - 1) * page_size)
    ).scalars()
    return list(rows), total
