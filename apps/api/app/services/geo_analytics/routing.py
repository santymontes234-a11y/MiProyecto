"""Ruteo origen → destino con OSRM propio (API_CONTRACT 1.1.0 §12).

Perfiles: ``foot`` (WALK), ``bicycle`` (BICYCLE, E_SCOOTER) y ``car`` (BUS, CARPOOL, MOTORCYCLE,
CAR). Cada perfil es una instancia de ``osrm-routed`` con su propio grafo preprocesado. Las URLs
salen del entorno (``OSRM_FOOT_URL``, ``OSRM_BICYCLE_URL``, ``OSRM_CAR_URL``); por defecto apuntan a
los servicios del compose.

Limitaciones que el cliente debe conocer:
* BUS usa el perfil ``car``: la ruta y la duración son de un auto, no del recorrido del autobús.
* E_SCOOTER usa ``bicycle``.
* Las duraciones son las del perfil OSRM (sin tráfico en tiempo real).

La firma del ``route_token`` es única y vive en ``app/core/route_token.py`` (Backend). Se firma la
misma lista de coordenadas que se devuelve, ya redondeada.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from app.core import route_token
from app.core.config import get_settings
from app.core.errors import AppError

PROFILE_BY_MODE = {
    "WALK": "foot",
    "BICYCLE": "bicycle",
    "E_SCOOTER": "bicycle",
    "BUS": "car",
    "CARPOOL": "car",
    "MOTORCYCLE": "car",
    "CAR": "car",
}
_DEFAULT_URLS = {
    "foot": "http://osrm-foot:5000",
    "bicycle": "http://osrm-bicycle:5000",
    "car": "http://osrm-car:5000",
}
# Nombre de perfil en la URL de la API de OSRM (osrm-routed ignora el valor, pero es obligatorio).
_URL_PROFILE = {"foot": "foot", "bicycle": "bike", "car": "driving"}
TIMEOUT_S = float(os.environ.get("OSRM_TIMEOUT_S", "5"))
MAX_ROUTE_POINTS = 10_000
PROVIDER = "osrm"


@dataclass(frozen=True)
class RouteResult:
    mode: str
    distance_m: float
    duration_s: int
    coordinates: list[list[float]]
    route_token: str
    provider: str = PROVIDER

    def to_contract(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "distance_m": self.distance_m,
            "duration_s": self.duration_s,
            "route": {"type": "LineString", "coordinates": self.coordinates},
            "route_token": self.route_token,
            "provider": self.provider,
        }


def base_url(profile: str) -> str:
    return os.environ.get(f"OSRM_{profile.upper()}_URL", _DEFAULT_URLS[profile]).rstrip("/")


def _in_service_area(lng: float, lat: float) -> bool:
    x0, y0, x1, y1 = get_settings().service_area
    return x0 <= lng <= x1 and y0 <= lat <= y1


def _fetch(url: str) -> dict[str, Any]:
    """GET a OSRM. Separado para poder sustituirlo en tests."""
    req = urllib.request.Request(url, headers={"Accept": "application/json"})  # noqa: S310
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:  # noqa: S310 - URL de config
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        # OSRM responde 400 con JSON {"code": "NoRoute" | "NoSegment" | ...}
        try:
            return json.load(exc)
        except (ValueError, OSError):
            raise AppError(503, "ROUTING_UNAVAILABLE", "Servicio de ruteo no disponible") from exc
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        raise AppError(503, "ROUTING_UNAVAILABLE", "Servicio de ruteo no disponible") from exc


def _request(profile: str, origin: tuple[float, float], dest: tuple[float, float], overview: str):
    coords = f"{origin[0]:.6f},{origin[1]:.6f};{dest[0]:.6f},{dest[1]:.6f}"
    query = urllib.parse.urlencode(
        {"overview": overview, "geometries": "geojson", "steps": "false", "alternatives": "false"}
    )
    return _fetch(f"{base_url(profile)}/route/v1/{_URL_PROFILE[profile]}/{coords}?{query}")


def route(mode: str, origin: tuple[float, float], destination: tuple[float, float]) -> RouteResult:
    profile = PROFILE_BY_MODE.get(mode)
    if profile is None:
        raise AppError(400, "BAD_REQUEST", "mode inválido")
    if not (_in_service_area(*origin) and _in_service_area(*destination)):
        raise AppError(
            422, "TRIP_OUTSIDE_SERVICE_AREA", "Origen o destino fuera del área de servicio"
        )
    if round(origin[0], 6) == round(destination[0], 6) and round(origin[1], 6) == round(
        destination[1], 6
    ):
        raise AppError(400, "BAD_REQUEST", "origin y destination no pueden ser iguales")

    data = _request(profile, origin, destination, "full")
    code = data.get("code")
    if code in ("NoRoute", "NoSegment"):
        raise AppError(404, "ROUTE_NOT_FOUND", "No se encontró una ruta entre esos puntos")
    if code != "Ok" or not data.get("routes"):
        raise AppError(503, "ROUTING_UNAVAILABLE", "Servicio de ruteo no disponible")

    best = data["routes"][0]
    coords = best["geometry"]["coordinates"]
    if len(coords) > MAX_ROUTE_POINTS:  # trazas muy largas: geometría simplificada de OSRM
        simplified = _request(profile, origin, destination, "simplified")
        if simplified.get("code") == "Ok" and simplified.get("routes"):
            coords = simplified["routes"][0]["geometry"]["coordinates"]
    # Redondeo ANTES de firmar: el cliente reenvía exactamente esta geometría en /trips.
    rounded: list[list[float]] = []
    for lng, lat in coords:
        pt = [round(float(lng), 6), round(float(lat), 6)]
        if not rounded or rounded[-1] != pt:
            rounded.append(pt)
    if len(rounded) < 2:
        raise AppError(404, "ROUTE_NOT_FOUND", "No se encontró una ruta entre esos puntos")
    return RouteResult(
        mode=mode,
        distance_m=round(float(best["distance"]), 1),
        duration_s=int(round(float(best["duration"]))),
        coordinates=rounded,
        route_token=route_token.sign(rounded, mode),
    )
