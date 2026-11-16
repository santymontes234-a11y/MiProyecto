"""Único cálculo de CO₂ del sistema (ARCHITECTURE.md §6, ADR-002).

co2_emitted_g = distance_km × factor(mode)
co2_saved_g   = max(0, distance_km × (factor(CAR) − factor(mode)))

Los factores viven en `emission_factors`; cada viaje guarda el factor aplicado.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import EmissionFactor, TransportMode


@dataclass(frozen=True)
class Co2Result:
    mode: TransportMode
    distance_m: float
    emission_factor_g_per_km: float
    co2_emitted_g: float
    co2_saved_g: float


def compute(distance_m: float, factor_g_per_km: float, baseline_g_per_km: float) -> tuple[float, float]:
    km = max(distance_m, 0.0) / 1000.0
    emitted = km * factor_g_per_km
    saved = max(0.0, km * (baseline_g_per_km - factor_g_per_km))
    return round(emitted, 2), round(saved, 2)


def factors(db: Session, mode: TransportMode) -> tuple[float, float]:
    """Devuelve (factor del modo, factor del automóvil de referencia)."""
    rows = dict(
        db.execute(
            select(EmissionFactor.mode, EmissionFactor.grams_per_km).where(
                EmissionFactor.mode.in_([mode, TransportMode.CAR])
            )
        ).all()
    )
    if mode not in rows or TransportMode.CAR not in rows:
        raise AppError(500, "INTERNAL_ERROR", "Factor de emisión no configurado")
    return float(rows[mode]), float(rows[TransportMode.CAR])


def estimate(db: Session, mode: TransportMode, distance_m: float) -> Co2Result:
    factor, baseline = factors(db, mode)
    emitted, saved = compute(distance_m, factor, baseline)
    return Co2Result(mode, round(distance_m, 1), factor, emitted, saved)
