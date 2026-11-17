"""Autenticación (SECURITY.md §1, contrato §2): registro, login con bloqueo, refresh rotativo con
detección de reutilización, sesiones, logout, verificación de correo y restablecimiento de contraseña."""

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import BackgroundTasks
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import get_settings
from app.core.errors import AppError, rate_limited, unauthorized
from app.core.rate_limit import enforce
from app.models import RefreshToken, Role, TokenPurpose, User, UserPreference, UserToken
from app.services import audit, email

logger = logging.getLogger("ecomove.auth")

INVALID_CREDENTIALS = AppError(401, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos")
EMAIL_NOT_VERIFIED = AppError(403, "EMAIL_NOT_VERIFIED", "Debes verificar tu correo antes de iniciar sesión")
USER_INACTIVE = AppError(403, "USER_INACTIVE", "La cuenta está desactivada")


@dataclass
class TokenBundle:
    access_token: str
    refresh_token: str
    expires_in: int
    user: User
    session_id: uuid.UUID


def _now() -> datetime:
    return datetime.now(UTC)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _issue(
    db: Session,
    user: User,
    *,
    family_id: uuid.UUID | None = None,
    session_created_at: datetime | None = None,
    user_agent: str | None = None,
) -> tuple[TokenBundle, RefreshToken]:
    now = _now()
    family_id = family_id or uuid.uuid4()
    access, ttl = security.create_access_token(user.id, user.role.value, user.token_version, family_id)
    refresh = security.create_refresh_token(user.id, family_id)
    row = RefreshToken(
        id=refresh.jti,
        user_id=user.id,
        family_id=family_id,
        token_hash=security.hash_token(refresh.token),
        expires_at=refresh.expires_at,
        session_created_at=session_created_at or now,
        last_used_at=now,
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(row)
    return TokenBundle(access, refresh.token, ttl, user, family_id), row


def _needs_verification(user: User) -> bool:
    return get_settings().require_email_verification and user.email_verified_at is None


# --- Tokens de un solo uso (§2.1) -----------------------------------------------------------------


def _issue_one_time(db: Session, user: User, purpose: TokenPurpose, ttl: timedelta) -> str:
    now = _now()
    # Pedir uno nuevo invalida los anteriores del mismo propósito.
    db.execute(
        update(UserToken)
        .where(UserToken.user_id == user.id, UserToken.purpose == purpose, UserToken.used_at.is_(None))
        .values(used_at=now)
    )
    raw = security.generate_one_time_token()
    db.add(UserToken(user_id=user.id, purpose=purpose, token_hash=security.hash_token(raw),
                     expires_at=now + ttl, created_at=now))
    return raw


def _consume_one_time(db: Session, raw: str, purpose: TokenPurpose, error: AppError) -> User:
    tok = db.execute(
        select(UserToken)
        .where(UserToken.token_hash == security.hash_token(raw), UserToken.purpose == purpose)
        .with_for_update()
    ).scalar_one_or_none()
    if tok is None or tok.used_at is not None or tok.expires_at <= _now():
        raise error
    tok.used_at = _now()
    user = db.get(User, tok.user_id)
    if user is None:
        raise error
    return user


# --- Registro y verificación ------------------------------------------------------------------------


def register(
    db: Session, email_addr: str, password: str, full_name: str, background: BackgroundTasks,
    user_agent: str | None = None,
) -> TokenBundle | None:
    """Devuelve los tokens, o None si la verificación de correo es obligatoria (§2.2: 202 sin tokens)."""
    s = get_settings()
    email_addr = normalize_email(email_addr)
    password_hash = security.hash_password(password)
    if db.execute(select(User.id).where(User.email == email_addr)).first():
        raise AppError(409, "EMAIL_ALREADY_REGISTERED", "El correo ya está registrado")
    user = User(
        id=uuid.uuid4(),
        email=email_addr,
        password_hash=password_hash,
        full_name=" ".join(full_name.split()),
        role=Role.USER,  # el rol nunca lo decide el cliente
        is_active=True,
    )
    db.add(user)
    try:
        db.flush()  # el usuario debe existir antes que sus preferencias (FK user_preferences.user_id)
    except IntegrityError as exc:  # carrera: dos registros simultáneos del mismo correo
        db.rollback()
        raise AppError(409, "EMAIL_ALREADY_REGISTERED", "El correo ya está registrado") from exc
    db.add(UserPreference(user_id=user.id))  # preferencias por defecto (tabla 1:1 normalizada)
    db.flush()
    raw = _issue_one_time(db, user, TokenPurpose.EMAIL_VERIFICATION, timedelta(hours=s.email_verification_ttl_hours))
    bundle = None if s.require_email_verification else _issue(db, user, user_agent=user_agent)[0]
    db.commit()
    background.add_task(email.send_email_verification, user.email, user.full_name, raw)
    return bundle


def request_email_verification(db: Session, email_addr: str, background: BackgroundTasks) -> None:
    s = get_settings()
    email_addr = normalize_email(email_addr)
    enforce(f"verify-email:{email_addr}", 3, 3600)
    user = db.execute(select(User).where(User.email == email_addr)).scalar_one_or_none()
    if user is None or user.email_verified_at is not None or not user.is_active:
        return
    raw = _issue_one_time(db, user, TokenPurpose.EMAIL_VERIFICATION, timedelta(hours=s.email_verification_ttl_hours))
    db.commit()
    background.add_task(email.send_email_verification, user.email, user.full_name, raw)


def confirm_email_verification(db: Session, raw: str) -> None:
    user = _consume_one_time(db, raw, TokenPurpose.EMAIL_VERIFICATION,
                             AppError(400, "VERIFICATION_TOKEN_INVALID", "El enlace no es válido o ha caducado"))
    if user.email_verified_at is None:
        user.email_verified_at = _now()
    audit.record(db, "USER_EMAIL_VERIFIED", "user", user.id, user)
    db.commit()


# --- Login, refresh, sesiones ----------------------------------------------------------------------


def login(db: Session, email_addr: str, password: str, user_agent: str | None = None) -> TokenBundle:
    s = get_settings()
    email_addr = normalize_email(email_addr)
    # Límite por correo (10/15 min), igual exista o no la cuenta: no revela existencia (§2.3).
    enforce(f"login-email:{email_addr}", s.login_max_failures * 2, s.login_lockout_minutes * 60)

    user = db.execute(select(User).where(User.email == email_addr).with_for_update()).scalar_one_or_none()
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
        raise USER_INACTIVE
    if _needs_verification(user):
        db.rollback()
        raise EMAIL_NOT_VERIFIED

    if security.needs_rehash(user.password_hash):
        user.password_hash = security.hash_password(password)
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    bundle, _ = _issue(db, user, user_agent=user_agent)
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


def invalidate_all_tokens(db: Session, user: User) -> None:
    """Revoca todos los refresh e invalida los access ya emitidos (token_version)."""
    revoke_all_for_user(db, user.id)
    user.token_version += 1


def refresh(db: Session, raw_token: str, user_agent: str | None = None) -> TokenBundle:
    payload = security.decode_token(raw_token, "refresh")
    token_invalid = unauthorized("TOKEN_INVALID", "Token inválido")
    row = db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == security.hash_token(raw_token)).with_for_update()
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
        raise USER_INACTIVE
    if _needs_verification(user):
        raise EMAIL_NOT_VERIFIED

    bundle, new_row = _issue(db, user, family_id=row.family_id,
                             session_created_at=row.session_created_at or row.created_at,
                             user_agent=user_agent or row.user_agent)
    row.revoked_at = _now()
    row.replaced_by_id = new_row.id
    db.commit()
    return bundle


def logout(db: Session, raw_token: str) -> None:
    """Revoca el refresh enviado (y con él la sesión). 204 idempotente aunque ya estuviera revocado."""
    try:
        security.decode_token(raw_token, "refresh")
    except AppError as exc:
        if exc.code == "TOKEN_EXPIRED":
            return
        raise
    row = db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == security.hash_token(raw_token))
    ).scalar_one_or_none()
    if row is not None:
        _revoke_family(db, row.family_id)
        db.commit()


def logout_all(db: Session, user: User) -> None:
    invalidate_all_tokens(db, user)
    audit.record(db, "USER_LOGOUT_ALL", "user", user.id, user)
    db.commit()


def list_sessions(db: Session, user: User) -> list[RefreshToken]:
    """Una fila por familia: el refresh vigente de cada sesión activa."""
    return list(
        db.execute(
            select(RefreshToken)
            .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None),
                   RefreshToken.expires_at > func.now())
            .order_by(RefreshToken.last_used_at.desc().nulls_last(), RefreshToken.created_at.desc())
        ).scalars()
    )


def revoke_session(db: Session, user: User, session_id: uuid.UUID) -> None:
    # Filtro por user_id: una sesión ajena responde igual que una inexistente (IDOR).
    owned = db.execute(
        select(RefreshToken.id)
        .where(RefreshToken.family_id == session_id, RefreshToken.user_id == user.id,
               RefreshToken.revoked_at.is_(None))
        .limit(1)
    ).first()
    if owned is None:
        raise AppError(404, "SESSION_NOT_FOUND", "Sesión no encontrada")
    _revoke_family(db, session_id)
    db.commit()


# --- Restablecimiento de contraseña ------------------------------------------------------------------


def request_password_reset(db: Session, email_addr: str, background: BackgroundTasks) -> None:
    s = get_settings()
    email_addr = normalize_email(email_addr)
    enforce(f"reset-email:{email_addr}", 3, 3600)
    user = db.execute(select(User).where(User.email == email_addr)).scalar_one_or_none()
    if user is None or not user.is_active:
        return
    raw = _issue_one_time(db, user, TokenPurpose.PASSWORD_RESET, timedelta(minutes=s.password_reset_ttl_minutes))
    audit.record(db, "USER_PASSWORD_RESET_REQUESTED", "user", user.id, user)
    db.commit()
    background.add_task(email.send_password_reset, user.email, user.full_name, raw)


def confirm_password_reset(db: Session, raw: str, new_password: str, background: BackgroundTasks) -> None:
    error = AppError(400, "RESET_TOKEN_INVALID", "El enlace no es válido o ha caducado")
    user = _consume_one_time(db, raw, TokenPurpose.PASSWORD_RESET, error)
    if not user.is_active:
        raise error
    user.password_hash = security.hash_password(new_password)
    # Restablecer por correo demuestra la propiedad del correo y desbloquea la cuenta.
    if user.email_verified_at is None:
        user.email_verified_at = _now()
    user.failed_login_attempts = 0
    user.locked_until = None
    invalidate_all_tokens(db, user)
    audit.record(db, "USER_PASSWORD_RESET", "user", user.id, user)
    db.commit()
    background.add_task(email.send_password_changed, user.email, user.full_name)
