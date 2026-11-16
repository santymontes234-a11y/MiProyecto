import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.rate_limit import enforce
from app.models import Role, User
from app.services.auth import normalize_email, revoke_all_for_user

logger = logging.getLogger("ecomove.users")


def update_profile(db: Session, user: User, full_name: str | None) -> User:
    if full_name is not None:
        user.full_name = " ".join(full_name.split())
    db.commit()
    return user


def change_password(db: Session, user: User, current: str, new: str) -> None:
    enforce(f"password-change:{user.id}", 5, 900)
    if not security.verify_password(current, user.password_hash):
        # 422 y no 401: un 401 haría que los clientes cierren la sesión.
        raise AppError(422, "VALIDATION_ERROR", "Datos inválidos", [
            {"loc": ["body", "current_password"], "msg": "La contraseña actual es incorrecta", "type": "value_error"}
        ])
    if current == new:
        raise AppError(422, "VALIDATION_ERROR", "Datos inválidos", [
            {"loc": ["body", "new_password"], "msg": "Debe ser distinta de la actual", "type": "value_error"}
        ])
    user.password_hash = security.hash_password(new)
    revoke_all_for_user(db, user.id)  # contrato §3: revoca todos los refresh
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
    db.add(User(email=email, password_hash=security.hash_password(password),
                full_name="Super administrador", role=Role.SUPER_ADMIN, is_active=True))
    db.commit()
    logger.info("SUPER_ADMIN inicial configurado")
