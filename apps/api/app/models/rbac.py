"""RBAC interno: qué permisos tiene cada rol. La API sigue exponiendo `role` como string."""

from sqlalchemy import Column, ForeignKey, SmallInteger, String, Table
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._types import pg_enum
from app.models.enums import Role

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column(
        "role",
        pg_enum(Role, "user_role"),
        ForeignKey("roles.name", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "permission_code",
        String(64),
        ForeignKey("permissions.code", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class RoleDef(Base):
    __tablename__ = "roles"

    name: Mapped[Role] = mapped_column(pg_enum(Role, "user_role"), primary_key=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    level: Mapped[int] = mapped_column(SmallInteger, nullable=False)


class Permission(Base):
    __tablename__ = "permissions"

    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")
