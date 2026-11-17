"""Índice de prioridad de infraestructura (IPI) — explicable y configurable.

El índice NO determina que una zona "necesita" infraestructura. Señala celdas
candidatas a **estudio técnico** combinando demanda observada en la app y
brecha de cobertura respecto a la infraestructura registrada. Ver
apps/api/docs/geo/PRIORITY_INDEX.md para la metodología completa, sesgos y
limitaciones. Las entradas salen de geo.priority_inputs (db/geo/002_functions.sql).

Principios de diseño:

1. Pocos viajes NUNCA elevan el puntaje por sí solos: los componentes de
   demanda suman de forma positiva y la brecha de cobertura pesa solo como un
   término más; una celda sin demanda observada queda con puntaje bajo y,
   si la muestra es chica, como ``datos_insuficientes`` (sin puntaje).
2. Un puntaje bajo NO significa "no se necesita": puede deberse a demanda
   suprimida por falta de infraestructura o a baja adopción de la app.
3. Si falta una capa de datos (p. ej. no hay ciclovías cargadas), el componente
   se marca como no disponible y se excluye: no se interpreta como "lejos".
4. Normalización relativa al área analizada (percentiles), por lo que el
   puntaje compara celdas entre sí; no es una escala absoluta.
"""

from __future__ import annotations

import json
import os
from bisect import bisect_left, bisect_right
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any, Literal

InfraType = Literal["bike_lane", "bike_station", "bus_stop", "pedestrian"]
Confidence = Literal["insuficiente", "baja", "media", "alta"]

ENV_PRIORITY_CONFIG = "GEO_PRIORITY_CONFIG_PATH"
# geo.priority_inputs acota la búsqueda de infraestructura a este radio.
DISTANCE_CAP_M = 3000.0


@dataclass(frozen=True)
class ComponentSpec:
    key: str
    label: str
    kind: Literal["demand", "gap"]
    weight: float
    # demanda: nombre de la columna de entrada; brecha: columna de distancia
    source: str
    # solo brecha: distancia (m) a partir de la cual empieza la brecha y saturación
    ok_m: float | None = None
    far_m: float | None = None
    optional: bool = False  # si su fuente es 0 en todas las celdas => no disponible


@dataclass(frozen=True)
class Profile:
    infra: InfraType
    label: str
    components: tuple[ComponentSpec, ...]
    missing_data_notes: tuple[str, ...] = ()


@dataclass(frozen=True)
class PriorityConfig:
    version: str = "ipi-1.0"
    # Muestra mínima para emitir puntaje
    min_users_for_score: int = 10
    min_trip_ends_for_score: int = 20
    # Umbrales de confianza (usuarios distintos)
    confidence_users: tuple[int, int] = (25, 75)  # >= media, >= alta
    # Etiquetas
    high_score: float = 70.0
    medium_score: float = 40.0
    profiles: Mapping[str, Profile] = field(default_factory=dict)


def _default_profiles() -> dict[str, Profile]:
    return {
        "bike_lane": Profile(
            infra="bike_lane",
            label="Ciclovía",
            components=(
                ComponentSpec(
                    "bike_routes",
                    "Rutas en bici/scooter que cruzan la celda",
                    "demand",
                    0.40,
                    "bike_like_route_trips",
                ),
                ComponentSpec(
                    "bike_ends",
                    "Orígenes/destinos en bici/scooter",
                    "demand",
                    0.15,
                    "bike_like_ends",
                ),
                ComponentSpec(
                    "short_car",
                    "Viajes cortos (< 5 km) en auto o moto registrados (demanda potencial)",
                    "demand",
                    0.15,
                    "short_car_ends",
                    optional=True,
                ),
                ComponentSpec(
                    "lane_gap",
                    "Distancia a la ciclovía registrada más cercana",
                    "gap",
                    0.30,
                    "dist_bike_lane_m",
                    ok_m=300,
                    far_m=1500,
                ),
            ),
            missing_data_notes=(
                "No se considera pendiente, seguridad vial, velocidad vehicular ni ancho de calle.",
            ),
        ),
        "bike_station": Profile(
            infra="bike_station",
            label="Estación de bici/scooter compartido",
            components=(
                ComponentSpec(
                    "bike_ends",
                    "Orígenes/destinos en bici/scooter",
                    "demand",
                    0.45,
                    "bike_like_ends",
                ),
                ComponentSpec(
                    "bus_ends",
                    "Orígenes/destinos en transporte público (intermodalidad)",
                    "demand",
                    0.15,
                    "bus_ends",
                ),
                ComponentSpec(
                    "short_car",
                    "Viajes cortos (< 5 km) en auto o moto registrados (demanda potencial)",
                    "demand",
                    0.10,
                    "short_car_ends",
                    optional=True,
                ),
                ComponentSpec(
                    "station_gap",
                    "Distancia a la estación registrada más cercana",
                    "gap",
                    0.30,
                    "dist_bike_station_m",
                    ok_m=300,
                    far_m=1000,
                ),
            ),
            missing_data_notes=(
                "No se considera disponibilidad de espacio público ni uso del suelo.",
            ),
        ),
        "bus_stop": Profile(
            infra="bus_stop",
            label="Parada de transporte público",
            components=(
                ComponentSpec(
                    "bus_ends",
                    "Orígenes/destinos en transporte público",
                    "demand",
                    0.40,
                    "bus_ends",
                ),
                ComponentSpec("walk_ends", "Orígenes/destinos a pie", "demand", 0.15, "walk_ends"),
                ComponentSpec(
                    "short_car",
                    "Viajes cortos (< 5 km) en auto o moto registrados (demanda potencial)",
                    "demand",
                    0.10,
                    "short_car_ends",
                    optional=True,
                ),
                ComponentSpec(
                    "stop_gap",
                    "Distancia a la parada registrada más cercana",
                    "gap",
                    0.35,
                    "dist_bus_stop_m",
                    ok_m=400,
                    far_m=1200,
                ),
            ),
            missing_data_notes=(
                "No se consideran rutas/frecuencias del sistema de transporte ni la red vial; "
                "una parada requiere una ruta que pase por ahí.",
            ),
        ),
        "pedestrian": Profile(
            infra="pedestrian",
            label="Infraestructura peatonal",
            components=(
                ComponentSpec(
                    "walk_routes",
                    "Rutas a pie que cruzan la celda",
                    "demand",
                    0.45,
                    "walk_route_trips",
                ),
                ComponentSpec("walk_ends", "Orígenes/destinos a pie", "demand", 0.25, "walk_ends"),
                ComponentSpec(
                    "bus_ends",
                    "Orígenes/destinos en transporte público (tramos a pie de acceso)",
                    "demand",
                    0.30,
                    "bus_ends",
                ),
            ),
            missing_data_notes=(
                "No hay capa de banquetas, cruces ni accesibilidad universal: el índice "
                "peatonal solo refleja demanda observada, no brecha de infraestructura.",
            ),
        ),
    }


DEFAULT_CONFIG = PriorityConfig(profiles=_default_profiles())


def load_config(path: str | None = None) -> PriorityConfig:
    """Carga un JSON que sobrescribe pesos/umbrales del config por defecto.

    Formato::

        {"min_users_for_score": 15,
         "profiles": {"bike_lane": {"weights": {"lane_gap": 0.2},
                                    "gap": {"lane_gap": {"ok_m": 250, "far_m": 1200}}}}}
    """
    p = path or os.environ.get(ENV_PRIORITY_CONFIG)
    if not p:
        return DEFAULT_CONFIG
    with open(p, encoding="utf-8") as fh:
        return apply_overrides(DEFAULT_CONFIG, json.load(fh))


def apply_overrides(base: PriorityConfig, data: Mapping[str, Any]) -> PriorityConfig:
    profiles = dict(base.profiles)
    for infra, ov in (data.get("profiles") or {}).items():
        if infra not in profiles:
            raise ValueError(f"Perfil desconocido: {infra}")
        weights = ov.get("weights", {})
        gaps = ov.get("gap", {})
        comps = []
        for c in profiles[infra].components:
            w = float(weights.get(c.key, c.weight))
            if w < 0:
                raise ValueError(f"Peso negativo en {infra}.{c.key}")
            g = gaps.get(c.key, {})
            if c.kind == "gap":
                ok_m = float(g.get("ok_m", c.ok_m))
                far_m = float(g.get("far_m", c.far_m))
                if not (0 <= ok_m < far_m <= DISTANCE_CAP_M):
                    raise ValueError(
                        f"{infra}.{c.key}: se requiere 0 <= ok_m < far_m <= {DISTANCE_CAP_M:.0f}"
                    )
            comps.append(
                ComponentSpec(
                    c.key,
                    c.label,
                    c.kind,
                    w,
                    c.source,
                    float(g.get("ok_m", c.ok_m)) if c.ok_m is not None else None,
                    float(g.get("far_m", c.far_m)) if c.far_m is not None else None,
                    c.optional,
                )
            )
        profiles[infra] = Profile(
            profiles[infra].infra,
            profiles[infra].label,
            tuple(comps),
            profiles[infra].missing_data_notes,
        )
    kwargs = {
        k: data[k]
        for k in (
            "version",
            "min_users_for_score",
            "min_trip_ends_for_score",
            "high_score",
            "medium_score",
        )
        if k in data
    }
    if "confidence_users" in data:
        kwargs["confidence_users"] = tuple(data["confidence_users"])
    return PriorityConfig(**{**base.__dict__, **kwargs, "profiles": profiles})


# ---------------------------------------------------------------------------
# Cálculo
# ---------------------------------------------------------------------------
def _percentile_ranker(values: Iterable[float]) -> Callable[[float], float]:
    """Rango percentil (empates = punto medio) en [0, 1]. Robusto a outliers."""
    s = sorted(values)
    n = len(s)
    if n == 0 or s[0] == s[-1]:
        return lambda v: 0.0 if not s or v <= 0 else 0.5

    def rank(v: float) -> float:
        lo, hi = bisect_left(s, v), bisect_right(s, v)
        return ((lo + hi) / 2) / n

    return rank


def _gap(distance_m: float, ok_m: float, far_m: float) -> float:
    if distance_m <= ok_m:
        return 0.0
    if distance_m >= far_m:
        return 1.0
    return (distance_m - ok_m) / (far_m - ok_m)


def _confidence(users: int, trip_ends: int, cfg: PriorityConfig) -> Confidence:
    if users < cfg.min_users_for_score or trip_ends < cfg.min_trip_ends_for_score:
        return "insuficiente"
    med, high = cfg.confidence_users
    if users >= high:
        return "alta"
    if users >= med:
        return "media"
    return "baja"


NO_CELLS_NOTE = "Sin extremos de viaje en el área y el periodo: no hay celdas que evaluar."


def score_cells(
    cells: list[Mapping[str, Any]],
    infra: InfraType,
    cfg: PriorityConfig = DEFAULT_CONFIG,
) -> dict[str, Any]:
    """Calcula el IPI para cada celda.

    ``cells``: filas de ``geo.priority_inputs`` (dict-like).
    Devuelve ``{"cells": [...], "components": [...], "notes": [...]}``.
    """
    profile = cfg.profiles.get(infra)
    if profile is None:
        raise ValueError(f"Tipo de infraestructura desconocido: {infra}")

    # Disponibilidad de cada componente en el área analizada
    available: dict[str, bool] = {}
    for c in profile.components:
        vals = [r.get(c.source) for r in cells]
        if c.kind == "gap":
            available[c.key] = any(v is not None for v in vals)
        else:
            available[c.key] = not c.optional or any((v or 0) > 0 for v in vals)

    rankers = {
        c.key: _percentile_ranker(float(r.get(c.source) or 0) for r in cells)
        for c in profile.components
        if c.kind == "demand"
    }
    active = [c for c in profile.components if available[c.key] and c.weight > 0]
    total_w = sum(c.weight for c in active)
    demand_w = sum(c.weight for c in active if c.kind == "demand")

    notes = list(profile.missing_data_notes)
    if not cells:
        notes.append(
            f"{NO_CELLS_NOTE} Resultado: datos insuficientes; no se afirma necesidad en el área."
        )
    for c in profile.components:
        if not available[c.key]:
            notes.append(
                f"Componente '{c.label}' no disponible en el área (sin datos); "
                "se excluyó y los pesos se renormalizaron."
            )
    if demand_w == 0:
        notes.append("No hay componentes de demanda disponibles: no se emiten puntajes.")

    out = []
    for r in cells:
        users = int(r.get("users") or 0)
        ends = int(r.get("trip_ends") or 0)
        conf = _confidence(users, ends, cfg)
        comps = []
        score: float | None = 0.0
        for c in profile.components:
            raw = r.get(c.source)
            if not available[c.key] or c.weight == 0:
                comps.append(
                    {
                        "key": c.key,
                        "label": c.label,
                        "kind": c.kind,
                        "raw": raw,
                        "normalized": None,
                        "weight": 0.0,
                        "contribution": 0.0,
                        "available": False,
                    }
                )
                continue
            if c.kind == "demand":
                norm = rankers[c.key](float(raw or 0))
            else:
                # sin dato para esta celda concreta => brecha desconocida, aporta 0
                norm = 0.0 if raw is None else _gap(float(raw), c.ok_m or 0, c.far_m or 1)
            w = c.weight / total_w if total_w else 0.0
            contrib = 100 * w * norm
            score = (score or 0) + contrib
            comps.append(
                {
                    "key": c.key,
                    "label": c.label,
                    "kind": c.kind,
                    "raw": raw,
                    "normalized": round(norm, 4),
                    "weight": round(w, 4),
                    "contribution": round(contrib, 2),
                    "available": True,
                }
            )

        demand_contrib = sum(x["contribution"] for x in comps if x["kind"] == "demand")
        if conf == "insuficiente" or demand_w == 0:
            score, label = None, "datos_insuficientes"
        elif score >= cfg.high_score and conf in ("media", "alta"):
            label = "candidata_prioritaria_para_estudio"
        elif score >= cfg.medium_score:
            label = "candidata_para_evaluar"
        else:
            label = "sin_senal_prioritaria"

        out.append(
            {
                "cell_i": r.get("cell_i"),
                "cell_j": r.get("cell_j"),
                "zone_name": r.get("zone_name"),
                "geometry": r.get("geometry"),
                "score": None if score is None else round(score, 1),
                "label": label,
                # Contrato §13: confianza 0..1 = usuarios distintos / umbral de confianza alta
                "confidence": round(min(1.0, users / max(cfg.confidence_users[1], 1)), 3),
                "confidence_level": conf,
                "sample": {"users": users, "trip_ends": ends},
                "demand_share": 0.0 if not score else round(demand_contrib / score, 3),
                "components": comps,
                "explanation": _explain(label, conf, comps, users),
            }
        )

    out.sort(key=lambda x: (x["score"] is None, -(x["score"] or 0)))
    return {
        "infra": infra,
        "profile_label": profile.label,
        "config_version": cfg.version,
        "components": [
            {
                "key": c.key,
                "label": c.label,
                "kind": c.kind,
                "weight": c.weight,
                "source": c.source,
                "ok_m": c.ok_m,
                "far_m": c.far_m,
                "available": available[c.key],
            }
            for c in profile.components
        ],
        "notes": notes,
        "cells": out,
    }


_LABELS_ES = {
    "candidata_prioritaria_para_estudio": "Candidata prioritaria para estudio técnico",
    "candidata_para_evaluar": "Candidata a evaluar",
    "sin_senal_prioritaria": "Sin señal prioritaria en los datos de la app",
    "datos_insuficientes": "Datos insuficientes para estimar",
}


def _explain(label: str, conf: str, comps: list[dict[str, Any]], users: int) -> str:
    if label == "datos_insuficientes":
        return (
            f"Solo {users} usuarios distintos registran actividad aquí; la muestra no permite "
            "concluir nada (ni que haga falta ni que no haga falta infraestructura)."
        )
    top = sorted(
        (c for c in comps if c["available"] and c["contribution"] > 0),
        key=lambda c: -c["contribution"],
    )[:2]
    drivers = (
        "; ".join(f"{c['label'].lower()} (+{c['contribution']:.0f})" for c in top)
        or "ningún componente destacado"
    )
    txt = f"{_LABELS_ES[label]} (confianza {conf}). Principales factores: {drivers}."
    if label == "sin_senal_prioritaria":
        txt += " Un puntaje bajo no implica que la infraestructura no sea necesaria."
    return txt
