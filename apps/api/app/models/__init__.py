"""Modelos ORM (propiedad del agente database). Importar aquí todo modelo nuevo para Alembic."""

from app.models.account import CitizenReport, Notification, UserToken
from app.models.audit_log import AuditLog
from app.models.catalog import (
    Achievement,
    Report,
    TransportModeInfo,
    UserAchievement,
    VehicleTypeInfo,
)
from app.models.cycleway import Cycleway
from app.models.emission_factor import EmissionFactor
from app.models.enums import (
    AchievementCriterion,
    CitizenReportCategory,
    CitizenReportStatus,
    Granularity,
    NotificationType,
    PoiCategory,
    RankingPeriod,
    ReportFormat,
    ReportType,
    Role,
    TokenPurpose,
    TransportMode,
    TripSource,
    TripStatus,
    VehicleType,
    ZoneKind,
)
from app.models.normalized import BikeStation, StopLine, TransitLine, TransitStop, UserPreference
from app.models.poi import Poi
from app.models.rbac import Permission, RoleDef, role_permissions
from app.models.refresh_token import RefreshToken
from app.models.trip import Trip
from app.models.user import User

__all__ = [
    "VehicleType",
    "VehicleTypeInfo",
    "BikeStation",
    "StopLine",
    "TransitLine",
    "TransitStop",
    "UserPreference",
    "Achievement",
    "AchievementCriterion",
    "CitizenReport",
    "CitizenReportCategory",
    "CitizenReportStatus",
    "Notification",
    "NotificationType",
    "RankingPeriod",
    "Report",
    "ReportFormat",
    "ReportType",
    "TokenPurpose",
    "TransportModeInfo",
    "TripSource",
    "UserAchievement",
    "UserToken",
    "ZoneKind",
    "AuditLog",
    "Cycleway",
    "EmissionFactor",
    "Granularity",
    "Permission",
    "Poi",
    "PoiCategory",
    "RefreshToken",
    "Role",
    "RoleDef",
    "TransportMode",
    "Trip",
    "TripStatus",
    "User",
    "role_permissions",
]

# Diccionario de datos (COMMENT ON) aplicado a los metadatos: la BD y el ORM coinciden.
from app.db.base import Base as _Base  # noqa: E402
from app.models.comments import apply as _apply_comments  # noqa: E402

_apply_comments(_Base.metadata)
