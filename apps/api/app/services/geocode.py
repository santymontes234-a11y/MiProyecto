"""Búsqueda de lugares (contrato 1.2 §12.1, observación O2).

1. POIs propios (nombre y descripción, sin distinguir mayúsculas ni acentos).
2. Nominatim (OSM) acotado al área de servicio (`viewbox` + `bounded=1`), con:
   - caché en memoria de 24 h por (consulta normalizada, límite);
   - como máximo 1 petición por segundo hacia Nominatim (política de uso), global al proceso;
   - User-Agent genérico del proyecto, sin datos personales; nunca se reenvía nada del usuario salvo `q`.
Fallo o tiempo agotado de Nominatim sin resultados propios → 503 GEOCODING_UNAVAILABLE.
"""

import json
import logging
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.models import Poi
from app.services.geo_analytics import places

logger = logging.getLogger("ecomove.geocode")

_ACCENTS_FROM = "áéíóúüñàèìòùÁÉÍÓÚÜÑÀÈÌÒÙ"
_ACCENTS_TO = "aeiouunaeiouAEIOUUNAEIOU"
# Siglas frecuentes en Querétaro: si Nominatim no devuelve nada con la sigla se reintenta con el nombre.
ALIASES = {
    "upq": "Universidad Politécnica de Querétaro",
    "uaq": "Universidad Autónoma de Querétaro",
    "itq": "Instituto Tecnológico de Querétaro",
    "aiq": "Aeropuerto Intercontinental de Querétaro",
    "tapo": "Terminal de Autobuses de Querétaro",
    "centro": "Centro Histórico de Querétaro",
    "zenea": "Jardín Zenea",
    "estadio": "Estadio Corregidora",
    "tec": "Tecnológico de Monterrey Campus Querétaro",
    "itesm": "Tecnológico de Monterrey Campus Querétaro",
    "alameda": "Alameda Hidalgo",
    "cu": "Centro Universitario UAQ",
}
# Nombres genéricos de OSM (533 paradas «Parada de autobús», 81 «Estacionamiento de bicicletas»):
# no identifican un lugar, así que se excluyen de la búsqueda por nombre.
GENERIC_NAMES = ("parada de autobus", "parada", "estacionamiento de bicicletas", "estacionamiento",
                 "biciestacionamiento", "cicloestacionamiento")

_cache: dict[tuple[str, int], tuple[float, list[dict[str, Any]]]] = {}
_cache_lock = threading.Lock()
_rate_lock = threading.Lock()
_last_call = 0.0


def normalize(q: str) -> str:
    stripped = "".join(c for c in unicodedata.normalize("NFD", q) if unicodedata.category(c) != "Mn")
    return " ".join(stripped.lower().split())


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _search_pois(db: Session, q: str, limit: int, near: tuple[float, float] | None) -> list[dict[str, Any]]:
    pattern = f"%{_escape_like(normalize(q))}%"

    def folded(col: Any) -> Any:
        return func.translate(func.lower(col), _ACCENTS_FROM.lower(), _ACCENTS_TO.lower())

    stmt = select(Poi.name, Poi.category, func.ST_X(Poi.location), func.ST_Y(Poi.location)).where(
        Poi.is_active.is_(True),
        folded(Poi.name).not_in(GENERIC_NAMES),
        folded(Poi.name).like(pattern, escape="\\") | folded(func.coalesce(Poi.description, "")).like(
            pattern, escape="\\"),
    )
    if near is not None:
        stmt = stmt.order_by(func.ST_Distance(func.Geography(Poi.location),
                                              func.Geography(func.ST_SetSRID(func.ST_MakePoint(*near), 4326))))
    else:
        stmt = stmt.order_by(func.length(Poi.name), Poi.name)
    rows = db.execute(stmt.limit(limit)).all()
    return [{"name": n, "label": f"{n}, Querétaro", "position": [round(float(x), 6), round(float(y), 6)],
             "category": c.value.lower(), "source": "poi"} for n, c, x, y in rows]


def _throttle() -> None:
    global _last_call
    with _rate_lock:
        wait = 1.0 - (time.monotonic() - _last_call)
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()


def _nominatim(q: str, limit: int) -> list[dict[str, Any]]:
    s = get_settings()
    min_lng, min_lat, max_lng, max_lat = s.service_area
    params = urllib.parse.urlencode({
        "q": q, "format": "jsonv2", "limit": limit, "bounded": 1, "countrycodes": "mx",
        "viewbox": f"{min_lng},{max_lat},{max_lng},{min_lat}", "accept-language": "es", "addressdetails": 0,
    })
    req = urllib.request.Request(f"{s.nominatim_url.rstrip('/')}/search?{params}",  # noqa: S310 - URL de configuración (http/https)
                                 headers={"User-Agent": s.geocoding_user_agent, "Accept": "application/json"})
    _throttle()
    with urllib.request.urlopen(req, timeout=s.geocoding_timeout_s) as resp:  # noqa: S310 - URL de config
        data = json.loads(resp.read(1_000_000))
    out = []
    for item in data if isinstance(data, list) else []:
        try:
            lng, lat = float(item["lon"]), float(item["lat"])
        except (KeyError, TypeError, ValueError):
            continue
        if not (min_lng <= lng <= max_lng and min_lat <= lat <= max_lat):
            continue
        display = str(item.get("display_name") or "")
        name = str(item.get("name") or display.split(",")[0]).strip() or display[:120]
        label = ", ".join(p.strip() for p in display.split(",")[:4] if p.strip())
        out.append({"name": name[:200], "label": label[:300], "position": [round(lng, 6), round(lat, 6)],
                    "category": item.get("type") or None, "source": "osm"})
    return out


def _cached_nominatim(q: str, limit: int) -> list[dict[str, Any]]:
    s = get_settings()
    key = (normalize(q), limit)
    now = time.time()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and hit[0] > now:
            return hit[1]
    results = _nominatim(q, limit)
    if not results and key[0] in ALIASES:
        results = _nominatim(ALIASES[key[0]], limit)
    with _cache_lock:
        if len(_cache) > 5000:
            for k in [k for k, v in _cache.items() if v[0] <= now] or list(_cache)[:2500]:
                _cache.pop(k, None)
        _cache[key] = (now + s.geocoding_cache_hours * 3600, results)
    return results


def search(db: Session, q: str, limit: int, near: tuple[float, float] | None) -> dict[str, Any]:
    # 1) Municipios y zonas (módulo geo): «Corregidora» → cabecera municipal, no una parada.
    items = places.search_zones(db, q, limit)
    if len(items) < limit:
        items += _search_pois(db, q, limit - len(items), near)
    alias = ALIASES.get(normalize(q))
    if alias and len(items) < limit:
        items += [i for i in _search_pois(db, alias, limit - len(items), near) if i not in items]
    if len(items) < limit and get_settings().geocoding_enabled:
        try:
            osm = _cached_nominatim(q, limit)
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            logger.warning("Nominatim no disponible: %s", type(exc).__name__)
            if not items:
                raise AppError(503, "GEOCODING_UNAVAILABLE", "La búsqueda de lugares no está disponible") from None
            osm = []
        seen = {(i["name"].lower(), tuple(i["position"])) for i in items}
        for place in osm:
            if len(items) >= limit:
                break
            if (place["name"].lower(), tuple(place["position"])) not in seen:
                items.append(place)
    return {"items": items[:limit]}
