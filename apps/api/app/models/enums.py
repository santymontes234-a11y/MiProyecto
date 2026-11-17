"""Enums del contrato. Mantener sincronizado con packages/shared/src/types/enums.ts."""

from enum import StrEnum


class Role(StrEnum):
    USER = "USER"
    ADMIN = "ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"

    @property
    def level(self) -> int:
        return {"USER": 1, "ADMIN": 2, "SUPER_ADMIN": 3}[self.value]


class TransportMode(StrEnum):
    WALK = "WALK"
    BICYCLE = "BICYCLE"
    E_SCOOTER = "E_SCOOTER"
    BUS = "BUS"
    CARPOOL = "CARPOOL"
    MOTORCYCLE = "MOTORCYCLE"
    CAR = "CAR"


class TripStatus(StrEnum):
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class PoiCategory(StrEnum):
    BIKE_PARKING = "BIKE_PARKING"
    BIKE_SHARING = "BIKE_SHARING"
    BUS_STOP = "BUS_STOP"
    EV_CHARGER = "EV_CHARGER"
    REPAIR_STATION = "REPAIR_STATION"


class Granularity(StrEnum):
    DAY = "day"
    WEEK = "week"
    MONTH = "month"


# --- Contrato 1.1.0 -----------------------------------------------------------------------------


class TripSource(StrEnum):
    GPS = "GPS"
    PLANNED = "PLANNED"


class ZoneKind(StrEnum):
    COLONIA = "colonia"
    AGEB = "ageb"
    MUNICIPIO = "municipio"
    DISTRITO = "distrito"
    CUSTOM = "custom"


class AchievementCriterion(StrEnum):
    TRIPS_COUNT = "TRIPS_COUNT"
    DISTANCE_M = "DISTANCE_M"
    CO2_SAVED_G = "CO2_SAVED_G"
    DISTINCT_MODES = "DISTINCT_MODES"


class NotificationType(StrEnum):
    ACHIEVEMENT_UNLOCKED = "ACHIEVEMENT_UNLOCKED"
    WEEKLY_SUMMARY = "WEEKLY_SUMMARY"
    SYSTEM = "SYSTEM"


class CitizenReportCategory(StrEnum):
    BIKE_LANE_DAMAGE = "BIKE_LANE_DAMAGE"
    MISSING_INFRASTRUCTURE = "MISSING_INFRASTRUCTURE"
    SAFETY = "SAFETY"
    POI_ISSUE = "POI_ISSUE"
    OTHER = "OTHER"


class CitizenReportStatus(StrEnum):
    OPEN = "OPEN"
    IN_REVIEW = "IN_REVIEW"
    RESOLVED = "RESOLVED"
    REJECTED = "REJECTED"


class ReportType(StrEnum):
    OVERVIEW = "overview"
    TRIPS = "trips"
    USERS = "users"
    CO2_BY_MODE = "co2_by_mode"
    CO2_BY_ZONE = "co2_by_zone"
    ANALYTICS_TIMESERIES = "analytics_timeseries"
    CITIZEN_REPORTS = "citizen_reports"
    AUDIT_LOGS = "audit_logs"


class ReportFormat(StrEnum):
    CSV = "csv"
    PDF = "pdf"


class RankingPeriod(StrEnum):
    WEEK = "week"
    MONTH = "month"
    ALL = "all"


class TokenPurpose(StrEnum):
    PASSWORD_RESET = "PASSWORD_RESET"
    EMAIL_VERIFICATION = "EMAIL_VERIFICATION"


# --- Contrato 1.2.0 -----------------------------------------------------------------------------


class VehicleType(StrEnum):
    COMPACT = "COMPACT"
    SEDAN = "SEDAN"
    SUV = "SUV"
    PICKUP = "PICKUP"
    MINIVAN = "MINIVAN"
    HYBRID = "HYBRID"
    ELECTRIC = "ELECTRIC"
