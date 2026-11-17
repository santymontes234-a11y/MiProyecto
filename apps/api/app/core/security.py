"""Hash de contraseñas (Argon2id) y JWT (SECURITY.md §1)."""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import get_settings
from app.core.errors import AppError

# PasswordHasher() usa Argon2id con los parámetros recomendados por argon2-cffi (RFC 9106).
_hasher = PasswordHasher()


@lru_cache
def _dummy_hash() -> str:
    """Hash ficticio para igualar el tiempo de respuesta cuando el email no existe."""
    return _hasher.hash(secrets.token_urlsafe(32))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    """Verifica en tiempo comparable exista o no el hash."""
    try:
        return _hasher.verify(password_hash or _dummy_hash(), password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def hash_token(token: str) -> str:
    """Solo se guarda el SHA-256 de refresh y tokens de un solo uso (SECURITY.md §1)."""
    return hashlib.sha256(token.encode()).hexdigest()


def generate_one_time_token() -> str:
    """Token de un solo uso de 384 bits (≥ 256 exigidos por el contrato §2.1)."""
    return secrets.token_urlsafe(48)


@dataclass(frozen=True)
class IssuedRefresh:
    token: str
    jti: uuid.UUID
    expires_at: datetime


def _now() -> datetime:
    return datetime.now(UTC)


def create_access_token(
    user_id: uuid.UUID, role: str, token_version: int = 0, session_id: uuid.UUID | None = None
) -> tuple[str, int]:
    """`ver` = users.token_version (invalidación inmediata); `sid` = sesión (familia de refresh)."""
    s = get_settings()
    now = _now()
    ttl = timedelta(minutes=s.jwt_access_token_expires_minutes)
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + ttl,
        "ver": token_version,
    }
    if session_id is not None:
        payload["sid"] = str(session_id)
    token = jwt.encode(payload, s.jwt_secret_key.get_secret_value(), algorithm=s.jwt_algorithm)
    return token, int(ttl.total_seconds())


def create_refresh_token(user_id: uuid.UUID, family_id: uuid.UUID) -> IssuedRefresh:
    s = get_settings()
    now = _now()
    jti = uuid.uuid4()
    expires_at = now + timedelta(days=s.jwt_refresh_token_expires_days)
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "jti": str(jti),
        "fam": str(family_id),
        "iat": now,
        "exp": expires_at,
    }
    token = jwt.encode(payload, s.jwt_secret_key.get_secret_value(), algorithm=s.jwt_algorithm)
    return IssuedRefresh(token=token, jti=jti, expires_at=expires_at)


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    s = get_settings()
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            s.jwt_secret_key.get_secret_value(),
            algorithms=[s.jwt_algorithm],  # lista fija: impide alg=none o confusión de algoritmo
            options={"require": ["exp", "iat", "sub", "jti", "type"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AppError(401, "TOKEN_EXPIRED", "Token expirado") from exc
    except jwt.PyJWTError as exc:
        raise AppError(401, "TOKEN_INVALID", "Token inválido") from exc
    if payload.get("type") != expected_type:
        raise AppError(401, "TOKEN_INVALID", "Tipo de token inválido")
    try:
        uuid.UUID(str(payload["sub"]))
        uuid.UUID(str(payload["jti"]))
    except ValueError as exc:
        raise AppError(401, "TOKEN_INVALID", "Token inválido") from exc
    return payload
