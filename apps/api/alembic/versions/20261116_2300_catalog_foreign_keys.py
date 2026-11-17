"""catalog foreign keys

Integridad referencial explícita hacia los catálogos (normalización / MER):
- users.role                   → roles.name
- trips.mode                   → transport_modes.mode
- emission_factors.mode        → transport_modes.mode (relación 1:1 medio–factor)
- user_preferences.default_mode → transport_modes.mode
Antes eran «FK lógicas» garantizadas solo por el tipo ENUM.

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-16 23:00:00+00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FKS = [
    ("fk_users_role_roles", "users", "roles", "role", "name", "RESTRICT"),
    ("fk_trips_mode_transport_modes", "trips", "transport_modes", "mode", "mode", "RESTRICT"),
    ("fk_emission_factors_mode_transport_modes", "emission_factors", "transport_modes", "mode", "mode", "RESTRICT"),
    ("fk_user_preferences_default_mode_transport_modes", "user_preferences", "transport_modes", "default_mode",
     "mode", "SET NULL"),
]


COMMENTS = {
    ("users", "role"): ("Rol RBAC: USER, ADMIN o SUPER_ADMIN (FK a roles.name)",
                        "Rol RBAC: USER, ADMIN o SUPER_ADMIN (FK lógica a roles.name)"),
    ("trips", "mode"): ("Medio de transporte (FK a transport_modes.mode)",
                        "Medio de transporte (FK lógica a transport_modes.mode)"),
}


def _comment(table: str, col: str, text: str) -> None:
    op.execute(f"COMMENT ON COLUMN public.{table}.{col} IS '{text}'")


def upgrade() -> None:
    for name, src, dst, col, ref, on_delete in FKS:
        op.create_foreign_key(name, src, dst, [col], [ref], ondelete=on_delete,
                              onupdate="CASCADE" if on_delete == "RESTRICT" else None)
    for (table, col), (new, _old) in COMMENTS.items():
        _comment(table, col, new)


def downgrade() -> None:
    for (table, col), (_new, old) in COMMENTS.items():
        _comment(table, col, old)
    for name, src, *_ in reversed(FKS):
        op.drop_constraint(name, src, type_="foreignkey")
