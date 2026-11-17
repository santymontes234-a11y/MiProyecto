import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._types import created_at_col, pg_enum, uuid_pk
from app.models.enums import Role


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email = lower(email)", name="ck_users_email_lowercase"),
        CheckConstraint("failed_login_attempts >= 0", name="ck_users_failed_attempts_positive"),
        CheckConstraint("token_version >= 0", name="ck_users_token_version_positive"),
        Index("ix_users_role_active", "role", "is_active"),
        Index("ix_users_ranking_opt_in", "ranking_opt_in", postgresql_where=text("ranking_opt_in")),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[Role] = mapped_column(
        pg_enum(Role, "user_role"), ForeignKey("roles.name", ondelete="RESTRICT", onupdate="CASCADE"),
        default=Role.USER, nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ranking_opt_in: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    # Se incrementa en logout-all, cambio/reset de contraseña y desactivación: invalida los access
    # tokens ya emitidos (claim `ver`).
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    # Protección contra fuerza bruta (interno, no se expone en la API).
    failed_login_attempts: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    @property
    def email_verified(self) -> bool:
        return self.email_verified_at is not None
