"""Filtros comunes del módulo de analítica geoespacial.

* Rango de fechas semiabierto [date_from, date_to). Por defecto, últimos 90 días.
* ``dataset``: ``official`` (por defecto) o ``demo``. Nunca se mezclan: con
  ``demo`` se consultan SOLO las tablas aisladas geo.demo_* y las zonas DEMO.
* ``min_users``: k-anonimato. Ninguna celda/zona/flujo con menos usuarios
  distintos se devuelve.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from app.core.errors import AppError

Dataset = Literal["official", "demo"]

DEFAULT_WINDOW_DAYS = 90
MAX_WINDOW_DAYS = 731
# k-anonimato espacial. Configurable por entorno; nunca menor que 3.
MIN_USERS = max(3, int(os.environ.get("GEO_MIN_USERS", "5")))
# Muestra mínima para emitir el índice de prioridad (ver priority_index.py)
SUSTAINABLE_EXCLUDED = ("CAR", "MOTORCYCLE")


@dataclass(frozen=True)
class AnalyticsFilters:
    date_from: datetime
    date_to: datetime
    modes: tuple[str, ...] | None
    dataset: Dataset

    @property
    def is_demo(self) -> bool:
        return self.dataset == "demo"

    def params(self) -> dict[str, Any]:
        return {
            "f": self.date_from,
            "t": self.date_to,
            "modes": list(self.modes) if self.modes else None,
            "demo": self.is_demo,
        }

    def meta(self) -> dict[str, Any]:
        return {
            "from": self.date_from,
            "to": self.date_to,
            "modes": list(self.modes) if self.modes else None,
            "dataset": self.dataset,
            "is_demo": self.is_demo,
            "min_users": MIN_USERS,
        }


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=UTC)


def build_filters(
    date_from: datetime | None,
    date_to: datetime | None,
    modes: list[str] | None = None,
    dataset: Dataset = "official",
    *,
    now: datetime | None = None,
) -> AnalyticsFilters:
    now = now or datetime.now(UTC)
    to = _aware(date_to) if date_to else now
    frm = _aware(date_from) if date_from else to - timedelta(days=DEFAULT_WINDOW_DAYS)
    if frm >= to:
        raise AppError(400, "DATE_RANGE_INVALID", "from debe ser anterior a to")
    if to - frm > timedelta(days=MAX_WINDOW_DAYS):
        raise AppError(400, "DATE_RANGE_TOO_LARGE", f"El rango máximo es de {MAX_WINDOW_DAYS} días")
    if dataset not in ("official", "demo"):
        raise AppError(400, "BAD_REQUEST", "dataset debe ser official o demo")
    clean = tuple(sorted({m.upper() for m in modes})) if modes else None
    return AnalyticsFilters(frm, to, clean, dataset)
