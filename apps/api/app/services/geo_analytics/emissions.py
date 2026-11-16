"""Desglose de CO₂ para analítica — NO es un segundo motor de cálculo (ADR-002).

El único cálculo por viaje es ``app/services/co2.py``: cada viaje guarda
``emission_factor_g_per_km``, ``co2_emitted_g`` y ``co2_saved_g`` al crearse.
Este módulo solo **agrega** esos valores guardados y deriva magnitudes
explicativas a partir de ellos, sin consultar factores vigentes:

=========================  ====================================================
``reference_car_g``        Emisión estimada si los mismos pasajero-km se hubieran
                           hecho en el auto de referencia:
                           ``co2_emitted_g + co2_saved_g``. Es exacto mientras
                           factor(modo) <= factor(CAR); si algún factor lo
                           supera, ``co2_saved_g`` se recorta a 0 (contrato) y
                           este valor se subestima — se informa en
                           ``clamped_trips``.
``mode_g``                 = ``co2_emitted_g``: emisión atribuida a quienes viajan.
``avoided_g``              = ``co2_saved_g`` (>= 0, contrato v1).
``per_passenger_km_g``     ``mode_g / pasajero-km``. Los factores de
                           ``emission_factors`` ya son por pasajero-km
                           (DATABASE.md §4), así que cada viaje = 1 pasajero.
``vehicle_g_estimate``     Solo modos privados: ``mode_g × ocupación supuesta``
                           (config/co2_assumptions.json). Para transporte
                           colectivo es ``None``: el vehículo circula con o sin
                           la persona usuaria.
``sensitivity``            ``avoided`` recalculado con otras ocupaciones del auto
                           de referencia (escenarios, no mediciones).
=========================  ====================================================

Todas las cifras son estimaciones con factores promedio. Ver
apps/api/docs/geo/CO2_METHODOLOGY.md.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

ASSUMPTIONS_PATH = Path(__file__).parent / "config" / "co2_assumptions.json"


@dataclass(frozen=True)
class Assumptions:
    version: str
    vehicle_occupancy: dict[str, float | None]
    baseline_occupancy_scenarios: tuple[float, ...]
    notes: tuple[str, ...]

    @classmethod
    def load(cls, path: Path = ASSUMPTIONS_PATH) -> Assumptions:
        data = json.loads(path.read_text(encoding="utf-8"))
        occ = {
            k.upper(): (None if v is None else float(v))
            for k, v in data["vehicle_occupancy"].items()
        }
        scen = tuple(float(x) for x in data["baseline_occupancy_scenarios"])
        if any(v is not None and v < 1 for v in occ.values()) or any(x < 1 for x in scen):
            raise ValueError("Las ocupaciones deben ser >= 1")
        return cls(data["version"], occ, scen, tuple(data.get("notes", [])))


@lru_cache(maxsize=1)
def get_assumptions() -> Assumptions:
    return Assumptions.load()


def breakdown(row: dict[str, Any], assumptions: Assumptions | None = None) -> dict[str, Any]:
    """Desglose para un agregado por modo.

    ``row`` requiere: mode, trips_count, distance_m, co2_emitted_g, co2_saved_g,
    clamped_trips (viajes con factor > factor de referencia).
    """
    a = assumptions or get_assumptions()
    mode = str(row["mode"]).upper()
    emitted = float(row.get("co2_emitted_g") or 0)
    saved = float(row.get("co2_saved_g") or 0)
    pkm = float(row.get("distance_m") or 0) / 1000
    reference = emitted + saved
    occ = a.vehicle_occupancy.get(mode)
    sensitivity = [
        # El auto de referencia de emission_factors supone 1 ocupante; con
        # ocupación o, cada pasajero-km en auto emitiría reference / o.
        {"baseline_occupancy": o, "avoided_g": round(max(0.0, reference / o - emitted), 1)}
        for o in a.baseline_occupancy_scenarios
    ]
    return {
        "mode": mode,
        "trips_count": int(row.get("trips_count") or 0),
        "passenger_km": round(pkm, 3),
        "reference_car_g": round(reference, 1),
        "mode_g": round(emitted, 1),
        "avoided_g": round(saved, 1),
        "per_passenger_km_g": round(emitted / pkm, 2) if pkm else None,
        "vehicle_g_estimate": round(emitted * occ, 1) if occ is not None else None,
        "vehicle_occupancy_assumed": occ,
        "clamped_trips": int(row.get("clamped_trips") or 0),
        "sensitivity": sensitivity,
    }


def totals(rows: list[dict[str, Any]]) -> dict[str, Any]:
    keys = (
        "trips_count",
        "passenger_km",
        "reference_car_g",
        "mode_g",
        "avoided_g",
        "clamped_trips",
    )
    out: dict[str, Any] = {k: round(sum(float(r[k]) for r in rows), 3) for k in keys}
    out["trips_count"] = int(out["trips_count"])
    out["clamped_trips"] = int(out["clamped_trips"])
    return out


def methodology() -> dict[str, Any]:
    a = get_assumptions()
    return {
        "assumptions_version": a.version,
        "is_estimate": True,
        "units": {"emissions": "g CO2", "distance": "pasajero-km"},
        "factor_source": (
            "Factor guardado en cada viaje (tabla emission_factors al momento del registro)."
        ),
        "vehicle_occupancy": a.vehicle_occupancy,
        "baseline_occupancy_scenarios": list(a.baseline_occupancy_scenarios),
        "notes": list(a.notes),
    }
