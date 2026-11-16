"""Importación de ciclovías y POIs desde OpenStreetMap (Overpass API).

Uso (desde apps/api, con las variables de entorno de la API)::

    python -m app.services.geo_analytics.osm_import          # ZM de Querétaro, ambas capas
    python -m app.services.geo_analytics.osm_import --layers pois --dry-run
    python -m app.services.geo_analytics.osm_import --save-raw /tmp/osm  # guarda las respuestas
    python -m app.services.geo_analytics.osm_import --from-raw /tmp/osm  # reimporta sin red

Destino: tablas canónicas ``cycleways`` y ``pois`` (DATABASE.md §3). Nunca ``geo.demo_*``.

* **Idempotente:** upsert por ``cycleways.osm_id`` y por ``pois.attributes->>'osm_type'/'osm_id'``.
  Volver a ejecutarlo no duplica nada.
* **POIs de administración:** los que no tienen ``attributes.source = 'osm'`` nunca se tocan.
  Si un ADMIN desactivó un POI de OSM, la reimportación lo actualiza pero **no** lo reactiva.
* **Bajas (opcional, ``--prune``):** los POIs de OSM que ya no aparecen en el bbox se desactivan
  (borrado lógico) y las ciclovías de OSM que desaparecieron se eliminan.
* **Overpass:** una consulta por capa, sin paralelismo, User-Agent genérico del proyecto y como
  máximo un reintento si el servidor pide esperar o falla temporalmente (429/502/503/504).
* **Licencia:** datos © OpenStreetMap contributors, ODbL 1.0. La atribución es obligatoria en los
  mapas (DESIGN_SYSTEM §4) y queda registrada en ``attributes`` de cada POI.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "EcoMoveQueretaro-OSMImport/1.0 (+https://www.openstreetmap.org/copyright)"
ATTRIBUTION = "© OpenStreetMap contributors"
LICENSE = "ODbL-1.0"

# Envolvente aproximada de la Zona Metropolitana de Querétaro (Querétaro, Corregidora,
# El Marqués y Huimilpan). Es solo el área de búsqueda: amplíala o redúcela con --bbox.
DEFAULT_BBOX = (-100.62, 20.40, -100.15, 20.85)  # minLng, minLat, maxLng, maxLat
MAX_BBOX_DEGREES = 1.0
HTTP_TIMEOUT_S = 200
QUERY_TIMEOUT_S = 180

BBox = tuple[float, float, float, float]

_LANE_VALUES = "track|opposite_track|lane|opposite_lane|shared_lane"
_PROTECTED_VALUES = {"track", "opposite_track"}

POI_CATEGORIES = {
    ("amenity", "bicycle_parking"): "BIKE_PARKING",
    ("amenity", "bicycle_rental"): "BIKE_SHARING",
    ("highway", "bus_stop"): "BUS_STOP",
    ("amenity", "charging_station"): "EV_CHARGER",
    ("amenity", "bicycle_repair_station"): "REPAIR_STATION",
}
DEFAULT_NAMES = {
    "BIKE_PARKING": "Estacionamiento de bicicletas",
    "BIKE_SHARING": "Estación de bicicleta compartida",
    "BUS_STOP": "Parada de autobús",
    "EV_CHARGER": "Cargador para vehículo eléctrico",
    "REPAIR_STATION": "Estación de reparación de bicicletas",
}
# Etiquetas OSM que se copian a attributes (clave destino ← clave OSM)
_COPIED_TAGS = {
    "operator": "operator",
    "network": "network",
    "covered": "covered",
    "opening_hours": "opening_hours",
    "fee": "fee",
    "bicycle_parking": "bicycle_parking",
    "socket_types": "socket",
    "shelter": "shelter",
    "bench": "bench",
    "wheelchair": "wheelchair",
}


class OverpassError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# Consultas Overpass
# ---------------------------------------------------------------------------
def _ql_bbox(b: BBox) -> str:
    # Overpass usa (sur, oeste, norte, este)
    return f"{b[1]},{b[0]},{b[3]},{b[2]}"


def cycleways_query(b: BBox) -> str:
    q = _ql_bbox(b)
    return f"""[out:json][timeout:{QUERY_TIMEOUT_S}];
(
  way["highway"="cycleway"]({q});
  way["highway"~"^(path|footway)$"]["bicycle"="designated"]({q});
  way["cycleway"~"^({_LANE_VALUES})$"]({q});
  way["cycleway:both"~"^({_LANE_VALUES})$"]({q});
  way["cycleway:left"~"^({_LANE_VALUES})$"]({q});
  way["cycleway:right"~"^({_LANE_VALUES})$"]({q});
);
out tags geom;"""


def pois_query(b: BBox) -> str:
    q = _ql_bbox(b)
    return f"""[out:json][timeout:{QUERY_TIMEOUT_S}];
(
  nwr["amenity"~"^(bicycle_parking|bicycle_rental|charging_station|bicycle_repair_station)$"]({q});
  node["highway"="bus_stop"]({q});
);
out tags center;"""


def fetch_overpass(query: str, url: str = OVERPASS_URL) -> dict[str, Any]:
    body = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request(  # noqa: S310 - URL fija https configurable por CLI
        url, data=body, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
    )
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as resp:  # noqa: S310
                data = json.load(resp)
            if data.get("remark") and "error" in str(data["remark"]).lower():
                raise OverpassError(f"Overpass devolvió un error: {data['remark']}")
            return data
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 502, 503, 504) and attempt == 1:
                wait = min(int(exc.headers.get("Retry-After") or 60), 120)
                print(
                    f"Overpass respondió {exc.code}; reintento único en {wait} s", file=sys.stderr
                )
                time.sleep(wait)
                continue
            raise OverpassError(f"Overpass HTTP {exc.code}") from exc
    raise OverpassError("Overpass no respondió")  # pragma: no cover


# ---------------------------------------------------------------------------
# Transformación OSM → filas canónicas
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class CyclewayRow:
    osm_id: int
    name: str | None
    is_protected: bool
    wkt: str


@dataclass(frozen=True)
class PoiRow:
    osm_type: str
    osm_id: int
    category: str
    name: str
    description: str | None
    lon: float
    lat: float
    attributes: dict[str, Any] = field(default_factory=dict)


def is_protected(tags: dict[str, str]) -> bool:
    """Infraestructura segregada del tráfico motorizado."""
    hw = tags.get("highway")
    if hw == "cycleway":
        return tags.get("segregated") != "no" or tags.get("foot") in (None, "no")
    if hw in ("path", "footway") and tags.get("bicycle") == "designated":
        return tags.get("segregated") == "yes"
    sides = (tags.get(k) for k in ("cycleway", "cycleway:both", "cycleway:left", "cycleway:right"))
    return any(v in _PROTECTED_VALUES for v in sides)


def parse_cycleways(data: dict[str, Any]) -> list[CyclewayRow]:
    rows: dict[int, CyclewayRow] = {}
    for el in data.get("elements", []):
        if el.get("type") != "way":
            continue
        pts: list[tuple[float, float]] = []
        for p in el.get("geometry") or []:
            if p is None:  # nodos fuera del área en respuestas recortadas
                continue
            xy = (round(float(p["lon"]), 7), round(float(p["lat"]), 7))
            if not pts or pts[-1] != xy:
                pts.append(xy)
        if len(set(pts)) < 2:
            continue
        tags = el.get("tags", {})
        name = (tags.get("name") or "").strip()[:160] or None
        wkt = "LINESTRING(" + ", ".join(f"{x} {y}" for x, y in pts) + ")"
        rows[int(el["id"])] = CyclewayRow(int(el["id"]), name, is_protected(tags), wkt)
    return list(rows.values())


def _category(tags: dict[str, str]) -> str | None:
    for (k, v), cat in POI_CATEGORIES.items():
        if tags.get(k) == v:
            return cat
    return None


def _int_or_none(v: str | None) -> int | None:
    try:
        return int(v) if v is not None else None
    except ValueError:
        return None


def parse_pois(data: dict[str, Any]) -> list[PoiRow]:
    rows: dict[tuple[str, int], PoiRow] = {}
    for el in data.get("elements", []):
        tags = el.get("tags", {})
        cat = _category(tags)
        if cat is None:
            continue
        if el["type"] == "node":
            lon, lat = el.get("lon"), el.get("lat")
        else:
            center = el.get("center") or {}
            lon, lat = center.get("lon"), center.get("lat")
        if lon is None or lat is None:
            continue
        attrs: dict[str, Any] = {
            "source": "osm",
            "osm_type": el["type"],
            "osm_id": int(el["id"]),
            "license": LICENSE,
            "attribution": ATTRIBUTION,
        }
        for dst, src in _COPIED_TAGS.items():
            if src in tags:
                attrs[dst] = tags[src]
        if (cap := _int_or_none(tags.get("capacity"))) is not None:
            attrs["capacity"] = cap
        if cat == "BUS_STOP":
            if code := tags.get("ref") or tags.get("local_ref"):
                attrs["code"] = code
            if lines := tags.get("route_ref"):
                attrs["lines"] = [
                    x.strip() for x in lines.replace(",", ";").split(";") if x.strip()
                ]
        name = (tags.get("name") or "").strip()[:160] or DEFAULT_NAMES[cat]
        desc = (tags.get("description") or "").strip()[:2000] or None
        key = (el["type"], int(el["id"]))
        rows[key] = PoiRow(
            el["type"],
            int(el["id"]),
            cat,
            name,
            desc,
            round(float(lon), 7),
            round(float(lat), 7),
            attrs,
        )
    return list(rows.values())


# ---------------------------------------------------------------------------
# Carga en la base de datos
# ---------------------------------------------------------------------------
def _envelope(b: BBox) -> str:
    return f"ST_MakeEnvelope({b[0]}, {b[1]}, {b[2]}, {b[3]}, 4326)"


def upsert_cycleways(
    db: Session, rows: list[CyclewayRow], bbox: BBox, prune: bool
) -> dict[str, int]:
    db.execute(
        text("""
        CREATE TEMP TABLE osm_cycleways (osm_id bigint PRIMARY KEY, name text,
                                         is_protected boolean, wkt text) ON COMMIT DROP
    """)
    )
    if rows:
        db.execute(
            text("INSERT INTO osm_cycleways VALUES (:osm_id, :name, :is_protected, :wkt)"),
            [r.__dict__ for r in rows],
        )
    res = (
        db.execute(
            text("""
        WITH src AS (
            SELECT osm_id, name, is_protected, ST_SetSRID(ST_GeomFromText(wkt), 4326) AS geom
            FROM osm_cycleways
        )
        INSERT INTO cycleways AS c (id, name, is_protected, osm_id, geom)
        SELECT CAST(md5('osm-way-' || osm_id) AS uuid), name, is_protected, osm_id, geom FROM src
        ON CONFLICT (osm_id) DO UPDATE
            SET name = EXCLUDED.name, is_protected = EXCLUDED.is_protected, geom = EXCLUDED.geom
            WHERE (c.name, c.is_protected) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.is_protected)
               OR NOT ST_Equals(c.geom, EXCLUDED.geom)
        RETURNING (xmax = 0) AS inserted
    """)
        )
        .scalars()
        .all()
    )
    pruned = 0
    if prune:
        pruned = db.execute(
            text(f"""
            DELETE FROM cycleways c
            WHERE c.osm_id IS NOT NULL AND ST_CoveredBy(c.geom, {_envelope(bbox)})
              AND NOT EXISTS (SELECT 1 FROM osm_cycleways o WHERE o.osm_id = c.osm_id)
        """)  # noqa: S608 - solo se interpolan el bbox numérico validado o fragmentos constantes
        ).rowcount
    return {
        "fetched": len(rows),
        "inserted": sum(res),
        "updated": len(res) - sum(res),
        "removed": pruned,
    }


def upsert_pois(db: Session, rows: list[PoiRow], bbox: BBox, prune: bool) -> dict[str, int]:
    db.execute(
        text("""
        CREATE TEMP TABLE osm_pois (osm_type text, osm_id bigint, category text, name text,
                                    description text, lon float8, lat float8, attributes jsonb,
                                    PRIMARY KEY (osm_type, osm_id)) ON COMMIT DROP
    """)
    )
    if rows:
        db.execute(
            text(
                "INSERT INTO osm_pois VALUES (:osm_type, :osm_id, :category, :name, :description, "
                ":lon, :lat, CAST(:attributes AS jsonb))"
            ),
            [
                {**r.__dict__, "attributes": json.dumps(r.attributes, ensure_ascii=False)}
                for r in rows
            ],
        )
    match = """p.attributes->>'source' = 'osm'
               AND p.attributes->>'osm_type' = o.osm_type
               AND p.attributes->>'osm_id' = o.osm_id::text"""
    updated = db.execute(
        text(f"""
        UPDATE pois p
        SET name = o.name, category = CAST(o.category AS poi_category), description = o.description,
            attributes = p.attributes || o.attributes,
            location = ST_SetSRID(ST_MakePoint(o.lon, o.lat), 4326), updated_at = now()
        FROM osm_pois o
        WHERE {match}
          AND ((p.name, p.category::text, p.description)
                   IS DISTINCT FROM (o.name, o.category, o.description)
               OR NOT (p.attributes @> o.attributes)
               OR NOT ST_Equals(p.location, ST_SetSRID(ST_MakePoint(o.lon, o.lat), 4326)))
    """)  # noqa: S608
    ).rowcount
    inserted = db.execute(
        text(f"""
        INSERT INTO pois (id, name, category, description, attributes, location, is_active)
        SELECT CAST(md5('osm-' || o.osm_type || '-' || o.osm_id) AS uuid), o.name,
               CAST(o.category AS poi_category), o.description, o.attributes,
               ST_SetSRID(ST_MakePoint(o.lon, o.lat), 4326), true
        FROM osm_pois o
        WHERE NOT EXISTS (SELECT 1 FROM pois p WHERE {match})
    """)  # noqa: S608
    ).rowcount
    pruned = 0
    if prune:
        pruned = db.execute(
            text(f"""
            UPDATE pois p SET is_active = false, updated_at = now()
            WHERE p.attributes->>'source' = 'osm' AND p.is_active
              AND ST_CoveredBy(p.location, {_envelope(bbox)})
              AND NOT EXISTS (SELECT 1 FROM osm_pois o WHERE {match})
        """)  # noqa: S608
        ).rowcount
    by_cat: dict[str, int] = {}
    for r in rows:
        by_cat[r.category] = by_cat.get(r.category, 0) + 1
    return {
        "fetched": len(rows),
        "inserted": inserted,
        "updated": updated,
        "deactivated": pruned,
        "by_category": by_cat,
    }  # type: ignore[dict-item]


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _parse_bbox(raw: str) -> BBox:
    try:
        x0, y0, x1, y1 = (float(v) for v in raw.split(","))
    except ValueError:
        raise argparse.ArgumentTypeError("bbox debe ser minLng,minLat,maxLng,maxLat") from None
    if not (-180 <= x0 < x1 <= 180 and -90 <= y0 < y1 <= 90):
        raise argparse.ArgumentTypeError("bbox fuera de rango o invertido")
    if x1 - x0 > MAX_BBOX_DEGREES or y1 - y0 > MAX_BBOX_DEGREES:
        raise argparse.ArgumentTypeError(
            f"bbox máximo {MAX_BBOX_DEGREES}° por lado (política Overpass)"
        )
    return x0, y0, x1, y1


def _load(layer: str, bbox: BBox, args: argparse.Namespace) -> dict[str, Any]:
    if args.from_raw:
        return json.loads((Path(args.from_raw) / f"{layer}.json").read_text(encoding="utf-8"))
    query = cycleways_query(bbox) if layer == "cycleways" else pois_query(bbox)
    data = fetch_overpass(query, args.overpass_url)
    if args.save_raw:
        out = Path(args.save_raw)
        out.mkdir(parents=True, exist_ok=True)
        (out / f"{layer}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def run(db: Session, layers: list[str], bbox: BBox, args: argparse.Namespace) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "bbox": list(bbox),
        "dry_run": args.dry_run,
        "attribution": ATTRIBUTION,
    }
    for layer in layers:
        data = _load(layer, bbox, args)
        if layer == "cycleways":
            rows_c = parse_cycleways(data)
            if args.prune and not rows_c:
                raise SystemExit("Respuesta vacía de ciclovías: se cancela --prune por seguridad")
            summary[layer] = upsert_cycleways(db, rows_c, bbox, args.prune)
        else:
            rows_p = parse_pois(data)
            if args.prune and not rows_p:
                raise SystemExit("Respuesta vacía de POIs: se cancela --prune por seguridad")
            summary[layer] = upsert_pois(db, rows_p, bbox, args.prune)
        summary[layer]["osm_timestamp"] = (data.get("osm3s") or {}).get("timestamp_osm_base")
        if args.dry_run:
            db.rollback()
        else:
            db.commit()
        if layer != layers[-1] and not args.from_raw:
            time.sleep(5)  # cortesía con el servidor público entre consultas
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--bbox",
        type=_parse_bbox,
        default=DEFAULT_BBOX,
        help="minLng,minLat,maxLng,maxLat (por defecto: ZM de Querétaro)",
    )
    parser.add_argument(
        "--layers", default="cycleways,pois", help="cycleways, pois o ambas separadas por coma"
    )
    parser.add_argument("--dry-run", action="store_true", help="calcula cambios y hace rollback")
    parser.add_argument(
        "--prune",
        action="store_true",
        help="desactiva POIs y elimina ciclovías de OSM que ya no existen en el bbox",
    )
    parser.add_argument("--save-raw", metavar="DIR", help="guarda las respuestas de Overpass")
    parser.add_argument("--from-raw", metavar="DIR", help="usa respuestas guardadas (sin red)")
    parser.add_argument("--overpass-url", default=OVERPASS_URL)
    args = parser.parse_args(argv)
    layers = [x.strip() for x in args.layers.split(",") if x.strip()]
    if not layers or any(x not in ("cycleways", "pois") for x in layers):
        parser.error("--layers admite cycleways y/o pois")

    from app.db.session import SessionLocal

    with SessionLocal() as db:
        summary = run(db, layers, args.bbox, args)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
