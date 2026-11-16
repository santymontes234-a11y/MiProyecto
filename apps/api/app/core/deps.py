"""Dependencias de autenticación y autorización (SECURITY.md §2).

El rol y los permisos se leen SIEMPRE de la base de datos en cada petición; el claim `role` del
token no se usa para autorizar. Un usuario degradado o desactivado pierde el acceso de inmediato.
"""

import uuid
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, forbidden, unauthorized
from app.core.security import decode_token
from app.db.session import get_db
from app.models import Role, User, role_permissions

bearer = HTTPBearer(auto_error=False, description="Authorization: Bearer <access_token>")

DB = Annotated[Session, Depends(get_db)]


class Permissions:
    PROFILE_OWN = "profile:own"
    TRIPS_OWN = "trips:own"
    STATS_OWN = "stats:own"
    USERS_READ = "users:read"
    USERS_SET_STATUS = "users:set_status"
    USERS_SET_STATUS_ADMIN = "users:set_status_admin"
    USERS_SET_ROLE = "users:set_role"
    MAP_MANAGE = "map:manage"
    STATS_GLOBAL = "stats:global"
    EMISSION_FACTORS_READ = "emission_factors:read"
    EMISSION_FACTORS_WRITE = "emission_factors:write"
    AUDIT_READ = "audit:read"


def permissions_for(db: Session, role: Role) -> set[str]:
    rows = db.execute(
        select(role_permissions.c.permission_code).where(role_permissions.c.role == role)
    ).scalars()
    return set(rows)


def get_current_user(
    request: Request,
    db: DB,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> User:
    if creds is None or not creds.credentials:
        raise unauthorized()
    payload = decode_token(creds.credentials, "access")
    user = db.get(User, uuid.UUID(payload["sub"]))
    if user is None:
        raise unauthorized("TOKEN_INVALID", "Token inválido")
    if not user.is_active:
        raise AppError(403, "USER_INACTIVE", "La cuenta está desactivada")
    request.state.user_id = str(user.id)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_permission(*codes: str) -> Callable[..., User]:
    """Exige que el rol del usuario (leído de la BD) tenga todos los permisos indicados."""

    def _dep(user: CurrentUser, db: DB) -> User:
        granted = permissions_for(db, user.role)
        if not all(c in granted for c in codes):
            raise forbidden()
        return user

    return _dep


def require_role(minimum: Role) -> Callable[..., User]:
    """Jerarquía USER < ADMIN < SUPER_ADMIN (SECURITY.md §2)."""

    def _dep(user: CurrentUser) -> User:
        if user.role.level < minimum.level:
            raise forbidden()
        return user

    return _dep
