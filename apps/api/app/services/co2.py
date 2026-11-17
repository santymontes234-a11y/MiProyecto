"""Único cálculo de CO₂ del sistema (ARCHITECTURE.md §6, ADR-002; contrato 1.2 §4.3).

Con km = distancia / 1000 y f(v) = factor g/km del tipo de vehículo (`vehicle_types`):

- CAR / CARPOOL: co2_emitted_g = km × f(v) / occupants · co2_saved_g = km × f(v) − co2_emitted_g
  (ahorro frente a ir solo en el mismo vehículo). Ocupantes por omisión: CAR = 1, CARPOOL = 2.
- Resto de medios: co2_emitted_g = km × f(mode) (`emission_factors`) ·
  co2_saved_g = max(0, km × (f(v_ref) − f(mode))), con v_ref = tipo preferido del usuario o SEDAN.

Puntos (contrato §4.2): floor(co2_saved_g / 100). Cada viaje guarda el factor aplicado por pasajero.
"""

import math
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import EmissionFactor, TransportMode, UserPreference, VehicleType, VehicleTypeInfo

CAR_MODES = (TransportMode.CAR, TransportMode.CARPOOL)
DEFAULT_VEHICLE = VehicleType.SEDAN
DEFAULT_OCCUPANTS = {TransportMode.CAR: 1, TransportMode.CARPOOL: 2}
POINTS_PER_G = 100


@dataclass(frozen=True)
class Co2Result:
    mode: TransportMode
    distance_m: float
    emission_factor_g_per_km: float
    co2_emitted_g: float
    co2_saved_g: float
    vehicle_type: VehicleType | None = None
    occupants: int | None = None

    @property
    def points(self) -> int:
        return points_for(self.co2_saved_g)


def points_for(co2_saved_g: float) -> int:
    return max(0, math.floor(co2_saved_g / POINTS_PER_G))


def compute(distance_m: float, factor_g_per_km: float, baseline_g_per_km: float) -> tuple[float, float]:
    km = max(distance_m, 0.0) / 1000.0
    emitted = km * factor_g_per_km
    saved = max(0.0, km * (baseline_g_per_km - factor_g_per_km))
    return round(emitted, 2), round(saved, 2)


def _invalid(field: str, msg: str) -> AppError:
    return AppError(422, "VALIDATION_ERROR", "Datos inválidos",
                    [{"loc": ["body", field], "msg": msg, "type": "value_error"}])


def _mode_factor(db: Session, mode: TransportMode) -> float:
    value = db.execute(select(EmissionFactor.grams_per_km).where(EmissionFactor.mode == mode)).scalar_one_or_none()
    if value is None:
        raise AppError(500, "INTERNAL_ERROR", "Factor de emisión no configurado")
    return float(value)


def _vehicle(db: Session, code: VehicleType) -> VehicleTypeInfo:
    row = db.get(VehicleTypeInfo, code)
    if row is None:
        raise AppError(500, "INTERNAL_ERROR", "Tipo de vehículo no configurado")
    return row


def preferred_vehicle(db: Session, user_id: uuid.UUID | None) -> VehicleType:
    if user_id is not None:
        pref = db.execute(
            select(UserPreference.default_vehicle_type).where(UserPreference.user_id == user_id)
        ).scalar_one_or_none()
        if pref is not None:
            return VehicleType(pref)
    return DEFAULT_VEHICLE


def check_vehicle_fields(mode: TransportMode, vehicle_type: VehicleType | None, occupants: int | None) -> None:
    """Validación de forma (§4.3): solo CAR/CARPOOL admiten vehículo y ocupantes; CARPOOL ≥ 2."""
    if mode not in CAR_MODES:
        if vehicle_type is not None:
            raise _invalid("vehicle_type", "Solo aplica a CAR y CARPOOL")
        if occupants is not None:
            raise _invalid("occupants", "Solo aplica a CAR y CARPOOL")
    elif mode == TransportMode.CARPOOL and occupants is not None and occupants < 2:
        raise _invalid("occupants", "CARPOOL exige al menos 2 ocupantes")


def estimate(
    db: Session,
    mode: TransportMode,
    distance_m: float,
    *,
    user_id: uuid.UUID | None = None,
    vehicle_type: VehicleType | None = None,
    occupants: int | None = None,
) -> Co2Result:
    check_vehicle_fields(mode, vehicle_type, occupants)
    km = max(distance_m, 0.0) / 1000.0
    if mode in CAR_MODES:
        code = vehicle_type or preferred_vehicle(db, user_id)
        vehicle = _vehicle(db, code)
        if vehicle_type is not None and not vehicle.is_active:
            raise _invalid("vehicle_type", "Tipo de vehículo no disponible")
        occ = occupants or DEFAULT_OCCUPANTS[mode]
        if occ > vehicle.max_occupants:
            raise _invalid("occupants", f"Máximo {vehicle.max_occupants} ocupantes para {code.value}")
        full = km * vehicle.grams_per_km
        emitted = round(full / occ, 2)
        saved = round(max(0.0, full - emitted), 2)
        factor = round(vehicle.grams_per_km / occ, 3)
        return Co2Result(mode, round(distance_m, 1), factor, emitted, saved, code, occ)
    factor = _mode_factor(db, mode)
    baseline = _vehicle(db, preferred_vehicle(db, user_id)).grams_per_km
    emitted, saved = compute(distance_m, factor, baseline)
    return Co2Result(mode, round(distance_m, 1), factor, emitted, saved)


def to_estimate_dict(r: Co2Result) -> dict[str, object]:
    return {"mode": r.mode, "distance_m": r.distance_m, "co2_emitted_g": r.co2_emitted_g,
            "co2_saved_g": r.co2_saved_g, "emission_factor_g_per_km": r.emission_factor_g_per_km,
            "points_estimate": r.points, "vehicle_type": r.vehicle_type, "occupants": r.occupants}
