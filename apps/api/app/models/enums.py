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
