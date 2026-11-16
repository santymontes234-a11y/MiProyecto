"""Registro, login, rotación de refresh tokens con detección de reutilización y logout (SECURITY.md §1)."""

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import get_settings
from app.core.errors import AppError, rate_limited, unauthorized
from app.core.rate_limit import enforce
from app.models import RefreshToken, Role, User

logger = logging.getLogger("ecomove.auth")

INVALID_CREDENTIALS = AppError(401, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos")


@dataclass
class TokenBundle:
    access_token: str
    refresh_token: str
    expires_in: int
    user: User


def _now() -> datetime:
    return datetime.now(UTC)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _issue(db: Session, user: User, family_id: uuid.UUID | None = None) -> tuple[TokenBundle, RefreshToken]:
    family_id = family_id or uuid.uuid4()
    access, ttl = security.create_access_token(user.id, user.role.value)
    refresh = security.create_refresh_token(user.id, family_id)
    row = RefreshToken(
        id=refresh.jti,
        user_id=user.id,
        family_id=family_id,
        token_hash=security.hash_token(refresh.token),
        expires_at=refresh.expires_at,
    )
    db.add(row)
    return TokenBundle(access, refresh.token, ttl, user), row


def register(db: Session, email: str, password: str, full_name: str) -> TokenBundle:
    email = normalize_email(email)
    password_hash = security.hash_password(password)
    if db.execute(select(User.id).where(User.email == email)).first():
        raise AppError(409, "EMAIL_ALREADY_REGISTERED", "El correo ya está registrado")
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=password_hash,
        full_name=" ".join(full_name.split()),
        role=Role.USER,  # el rol nunca lo decide el cliente
        is_active=True,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:  # carrera: dos registros simultáneos del mismo correo
        db.rollback()
        raise AppError(409, "EMAIL_ALREADY_REGISTERED", "El correo ya está registrado") from exc
    bundle, _ = _issue(db, user)
    db.commit()
    return bundle


def login(db: Session, email: str, password: str) -> TokenBundle:
    s = get_settings()
    email = normalize_email(email)
    # Límite por correo, igual exista o no la cuenta (no revela existencia).
    enforce(f"login-email:{email}", s.login_max_failures * 2, s.login_lockout_minutes * 60)

    user = db.execute(select(User).where(User.email == email).with_for_update()).scalar_one_or_none()
    now = _now()
    if user is None:
        security.verify_password(password, None)  # tiempo constante
        raise INVALID_CREDENTIALS

    if user.locked_until and user.locked_until > now:
        security.verify_password(password, None)
        raise rate_limited(int((user.locked_until - now).total_seconds()) + 1)

    if not security.verify_password(password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= s.login_max_failures:
            user.locked_until = now + timedelta(minutes=s.login_lockout_minutes)
            user.failed_login_attempts = 0
            logger.warning("Cuenta bloqueada por intentos fallidos", extra={"user_id": str(user.id)})
        db.commit()
        raise INVALID_CREDENTIALS

    if not user.is_active:
        db.rollback()
        raise AppError(403, "USER_INACTIVE", "La cuenta está desactivada")

    if security.needs_rehash(user.password_hash):
        user.password_hash = security.hash_password(password)
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    bundle, _ = _issue(db, user)
    db.commit()
    return bundle


def _revoke_family(db: Session, family_id: uuid.UUID) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )


def revoke_all_for_user(db: Session, user_id: uuid.UUID) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )


def refresh(db: Session, raw_token: str) -> TokenBundle:
    payload = security.decode_token(raw_token, "refresh")
    token_invalid = unauthorized("TOKEN_INVALID", "Token inválido")
    row = db.execute(
        select(RefreshToken)
        .where(RefreshToken.token_hash == security.hash_token(raw_token))
        .with_for_update()
    ).scalar_one_or_none()
    if row is None or str(row.id) != payload["jti"] or str(row.user_id) != payload["sub"]:
        raise token_invalid

    if row.revoked_at is not None:
        # Reutilización de un refresh ya revocado: probable robo → se revoca toda la familia.
        _revoke_family(db, row.family_id)
        db.commit()
        logger.warning("Reutilización de refresh token detectada", extra={"user_id": str(row.user_id)})
        raise token_invalid
    if row.expires_at <= _now():
        raise unauthorized("TOKEN_EXPIRED", "Token expirado")

    user = db.get(User, row.user_id)
    if user is None:
        raise token_invalid
    if not user.is_active:
        _revoke_family(db, row.family_id)
        db.commit()
        raise AppError(403, "USER_INACTIVE", "La cuenta está desactivada")

    bundle, new_row = _issue(db, user, family_id=row.family_id)
    row.revoked_at = _now()
    row.replaced_by_id = new_row.id
    db.commit()
    return bundle


def logout(db: Session, raw_token: str) -> None:
    """Revoca el refresh enviado. Respuesta 204 aunque el token no sea válido (idempotente)."""
    try:
        security.decode_token(raw_token, "refresh")
    except AppError as exc:
        if exc.code == "TOKEN_EXPIRED":
            return
        raise
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == security.hash_token(raw_token), RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )
    db.commit()
