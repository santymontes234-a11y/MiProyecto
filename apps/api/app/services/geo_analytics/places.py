"""Lugares de referencia para /geocode (contrato 1.2 §12.1, observación O2).

Busca por nombre en ``geo.mobility_zones`` (municipios del INEGI y zonas capturadas por ADMIN;
nunca DEMO) y devuelve un punto representativo (``ST_PointOnSurface``, siempre dentro del
polígono). Para un municipio se usa el centro de su cabecera urbana. Así «Corregidora» o
«El Marqués» se resuelven sin Nominatim.

Lo llama Backend desde app/services/geocode.py; el formato de cada elemento es el de
GeocodeResult (``source = "zone"``). Las AGEB se excluyen: su nombre es una clave, no un lugar.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

_SEARCHABLE_KINDS = ("municipio", "colonia", "distrito", "custom")
_FROM = "áéíóúüñ"
_TO = "aeiouun"


def search_zones(db: Session, q: str, limit: int = 5) -> list[dict[str, Any]]:
    q = " ".join(q.split()).lower()
    if len(q) < 2 or limit <= 0:
        return []
    pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    rows = db.execute(
        text(
            f"""
            SELECT z.name, z.kind,
                   ST_X(p) AS lng, ST_Y(p) AS lat
            FROM geo.mobility_zones z
            CROSS JOIN LATERAL (
                -- Municipio: centro de las AGEB urbanas de su cabecera (localidad 0001), que es
                -- lo que la gente entiende por «ir a Corregidora»; si no hay, un punto interior.
                SELECT COALESCE(
                    (SELECT ST_Centroid(ST_Collect(a.geom)) FROM geo.mobility_zones a
                     WHERE z.kind = 'municipio' AND a.kind = 'ageb' AND NOT a.is_demo
                       AND a.code LIKE z.code || '0001%'),
                    ST_PointOnSurface(z.geom)) AS p
            ) pt
            WHERE NOT z.is_demo
              AND z.kind = ANY (CAST(:kinds AS text[]))
              AND translate(lower(z.name), '{_FROM}', '{_TO}')
                  LIKE translate(:pattern, '{_FROM}', '{_TO}') ESCAPE '\\'
            ORDER BY (translate(lower(z.name), '{_FROM}', '{_TO}')
                      = translate(:exact, '{_FROM}', '{_TO}')) DESC,
                     CASE z.kind WHEN 'municipio' THEN 0 ELSE 1 END,
                     length(z.name), z.name
            LIMIT :lim
            """  # noqa: S608 - solo constantes del módulo
        ),
        {"kinds": list(_SEARCHABLE_KINDS), "pattern": pattern, "exact": q, "lim": limit},
    ).all()
    return [
        {
            "name": r.name,
            "label": f"{r.name}, Querétaro" + (" (municipio)" if r.kind == "municipio" else ""),
            "position": [round(float(r.lng), 6), round(float(r.lat), 6)],
            "category": r.kind,
            "source": "zone",
        }
        for r in rows
    ]
