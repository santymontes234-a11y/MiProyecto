"""seed rbac and emission factors

Datos semilla: roles, permisos (RBAC interno) y factores de emisión (DATABASE.md §4).
Los valores están congelados aquí para que la migración sea reproducible aunque cambie el código.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-16 02:30:00+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ROLES = [
    ("USER", "Usuario final", 1),
    ("ADMIN", "Administrador", 2),
    ("SUPER_ADMIN", "Super administrador", 3),
]

PERMISSIONS = {
    "profile:own": "Consultar y editar el perfil propio",
    "trips:own": "Registrar y gestionar los viajes propios",
    "stats:own": "Consultar estadísticas propias",
    "users:read": "Listar y consultar usuarios",
    "users:set_status": "Activar o desactivar cuentas USER",
    "users:set_status_admin": "Activar o desactivar cuentas ADMIN y SUPER_ADMIN",
    "users:set_role": "Cambiar el rol de un usuario",
    "map:manage": "Crear, editar y desactivar puntos de interés",
    "stats:global": "Consultar el resumen global",
    "emission_factors:read": "Consultar factores de emisión",
    "emission_factors:write": "Editar factores de emisión",
    "audit:read": "Consultar la bitácora de auditoría",
}

_USER = ["profile:own", "trips:own", "stats:own"]
_ADMIN = _USER + ["users:read", "users:set_status", "map:manage", "stats:global", "emission_factors:read"]
_SUPER = _ADMIN + ["users:set_status_admin", "users:set_role", "emission_factors:write", "audit:read"]
ROLE_PERMISSIONS = {"USER": _USER, "ADMIN": _ADMIN, "SUPER_ADMIN": _SUPER}

# g CO2 / km por pasajero (DATABASE.md §4, valores de desarrollo).
EMISSION_FACTORS = {
    "WALK": 0.0,
    "BICYCLE": 0.0,
    "E_SCOOTER": 25.0,
    "BUS": 68.0,
    "CARPOOL": 64.0,
    "MOTORCYCLE": 103.0,
    "CAR": 192.0,
}


def upgrade() -> None:
    conn = op.get_bind()
    for name, description, level in ROLES:
        conn.execute(
            sa.text("INSERT INTO roles (name, description, level) VALUES (CAST(:n AS user_role), :d, :l)"),
            {"n": name, "d": description, "l": level},
        )
    for code, description in PERMISSIONS.items():
        conn.execute(
            sa.text("INSERT INTO permissions (code, description) VALUES (:c, :d)"),
            {"c": code, "d": description},
        )
    for role, codes in ROLE_PERMISSIONS.items():
        for code in codes:
            conn.execute(
                sa.text(
                    "INSERT INTO role_permissions (role, permission_code) VALUES (CAST(:r AS user_role), :c)"
                ),
                {"r": role, "c": code},
            )
    for mode, grams in EMISSION_FACTORS.items():
        conn.execute(
            sa.text(
                "INSERT INTO emission_factors (mode, grams_per_km, valid_from) "
                "VALUES (CAST(:m AS transport_mode), :g, now())"
            ),
            {"m": mode, "g": grams},
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM emission_factors"))
    conn.execute(sa.text("DELETE FROM role_permissions"))
    conn.execute(sa.text("DELETE FROM permissions"))
    conn.execute(sa.text("DELETE FROM roles"))
