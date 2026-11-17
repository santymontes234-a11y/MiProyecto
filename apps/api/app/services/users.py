import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import get_settings
from app.core.errors import AppError, forbidden
from app.core.rate_limit import enforce
from app.models import Notification, Role, Trip, User, UserPreference, VehicleTypeInfo
from app.schemas.user import Preferences
from app.services import audit, citizen_reports, gamification, stats
from app.services.auth import invalidate_all_tokens, normalize_email
from app.services.trips import to_dict as trip_to_dict

logger = logging.getLogger("ecomove.users")


def update_profile(db: Session, user: User, full_name: str | None, ranking_opt_in: bool | None = None) -> User:
    if full_name is not None:
        user.full_name = " ".join(full_name.split())
    if ranking_opt_in is not None:
        user.ranking_opt_in = ranking_opt_in
    db.commit()
    return user


def _wrong_password(field: str) -> AppError:
    # 422 y no 401: un 401 haría que los clientes cierren la sesión (contrato §3).
    return AppError(422, "VALIDATION_ERROR", "Datos inválidos", [
        {"loc": ["body", field], "msg": "La contraseña es incorrecta", "type": "value_error"}
    ])


# --- Preferencias ---------------------------------------------------------------------------------


def get_preferences(db: Session, user: User) -> UserPreference:
    pref = db.get(UserPreference, user.id)
    if pref is None:  # cuentas antiguas sin fila: se crea con los valores por defecto
        pref = UserPreference(user_id=user.id)
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return pref


def put_preferences(db: Session, user: User, data: Preferences) -> UserPreference:
    if data.default_vehicle_type is not None:
        vt = db.get(VehicleTypeInfo, data.default_vehicle_type)
        if vt is None or not vt.is_active:
            raise AppError(422, "VALIDATION_ERROR", "Datos inválidos", [
                {"loc": ["body", "default_vehicle_type"], "msg": "Tipo de vehículo no disponible",
                 "type": "value_error"}])
    pref = get_preferences(db, user)
    for field, value in data.model_dump().items():
        setattr(pref, field, value)
    db.commit()
    db.refresh(pref)
    return pref


def _prefs_dict(p: UserPreference) -> dict[str, Any]:
    return {"language": p.language, "default_mode": p.default_mode, "weekly_goal_trips": p.weekly_goal_trips,
            "email_notifications": p.email_notifications, "default_vehicle_type": p.default_vehicle_type}


# --- Exportación (LFPDPPP, derecho de acceso) -----------------------------------------------------


def export(db: Session, user: User) -> dict[str, Any]:
    trips = [trip_to_dict(t, g) for t, g in db.execute(
        select(Trip, func.ST_AsGeoJSON(Trip.route)).where(Trip.user_id == user.id).order_by(Trip.started_at)
    ).all()]
    notes = db.execute(select(Notification).where(Notification.user_id == user.id)
                       .order_by(Notification.created_at)).scalars().all()
    return {
        "exported_at": datetime.now(UTC),
        "user": user,
        "preferences": _prefs_dict(get_preferences(db, user)),
        "trips": trips,
        "achievements": gamification.user_achievements(db, user.id),
        "stats": stats.summary(db, user.id, None, None),
        "notifications": notes,
        "citizen_reports": citizen_reports.all_for_user(db, user.id),
    }


# --- Borrado de cuenta ----------------------------------------------------------------------------


def delete_account(db: Session, user: User, password: str) -> None:
    enforce(f"account-delete:{user.id}", 5, 900)
    if not security.verify_password(password, user.password_hash):
        raise _wrong_password("password")
    if user.role == Role.SUPER_ADMIN:
        others = db.execute(
            select(User.id).where(User.role == Role.SUPER_ADMIN, User.is_active.is_(True), User.id != user.id)
            .with_for_update()
        ).all()
        if not others:
            raise forbidden("No puedes borrar la cuenta del último SUPER_ADMIN activo")
    hard_delete(db, user)
    # Sin email ni nombre: solo el hecho (contrato §3). actor_id queda NULL.
    audit.record(db, "USER_SELF_DELETED", "user", None, None, {"role": user.role.value})
    db.commit()


def hard_delete(db: Session, user: User) -> None:
    """Borrado físico. Las FK eliminan en cascada viajes, tokens, logros, preferencias y notificaciones;
    reportes ciudadanos, informes y auditoría quedan con la referencia en NULL."""
    db.delete(user)
    db.flush()


def change_password(db: Session, user: User, current: str, new: str) -> None:
    enforce(f"password-change:{user.id}", 5, 900)
    if not security.verify_password(current, user.password_hash):
        raise _wrong_password("current_password")
    if current == new:
        raise AppError(422, "VALIDATION_ERROR", "Datos inválidos", [
            {"loc": ["body", "new_password"], "msg": "Debe ser distinta de la actual", "type": "value_error"}
        ])
    user.password_hash = security.hash_password(new)
    invalidate_all_tokens(db, user)  # contrato §3: revoca refresh y access ya emitidos
    db.commit()


def bootstrap_super_admin(db: Session) -> None:
    """Crea el primer SUPER_ADMIN desde BOOTSTRAP_SUPER_ADMIN_* solo si no existe ninguno."""
    s = get_settings()
    if not s.bootstrap_super_admin_email or not s.bootstrap_super_admin_password:
        return
    exists = db.execute(
        select(func.count()).select_from(User).where(User.role == Role.SUPER_ADMIN)
    ).scalar_one()
    if exists:
        return
    password = s.bootstrap_super_admin_password.get_secret_value()
    if len(password) < 12:
        logger.error("BOOTSTRAP_SUPER_ADMIN_PASSWORD debe tener al menos 12 caracteres; no se crea")
        return
    email = normalize_email(s.bootstrap_super_admin_email)
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is not None:
        # Nunca se asciende una cuenta existente: alguien podría haberla registrado antes con ese correo.
        logger.error("BOOTSTRAP_SUPER_ADMIN_EMAIL ya pertenece a una cuenta; no se crea el SUPER_ADMIN")
        return
    admin = User(email=email, password_hash=security.hash_password(password),
                 full_name="Super administrador", role=Role.SUPER_ADMIN, is_active=True)
    db.add(admin)
    db.flush()
    db.add(UserPreference(user_id=admin.id))
    db.commit()
    logger.info("SUPER_ADMIN inicial configurado")
