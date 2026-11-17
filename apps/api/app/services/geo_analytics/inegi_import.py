"""Importa zonas del Marco Geoestadístico 2020 y población del Censo 2020 (INEGI).

Uso (los archivos se descargan a mano desde inegi.org.mx; ver docs/report/DATASETS.md)::

    python -m app.services.geo_analytics.inegi_import \
        --mg DIR/conjunto_de_datos --censo DIR/conjunto_de_datos_ageb_urbana_22_cpv2020.csv

* ``22mun`` → ``geo.mobility_zones`` kind ``municipio``; ``22a`` (AGEB urbanas) → kind ``ageb``.
  ``code`` = CVEGEO; ``source`` = ``INEGI-MG-2020``. Nunca DEMO.
* Proyección de origen: MEXICO_ITRF_2008_LCC (EPSG:6372); se transforma a 4326 en PostGIS.
* Los anillos se reconstruyen con ``ST_BuildArea`` (respeta huecos) y se validan con
  ``ST_MakeValid``.
* Censo: filas de total por AGEB (MZA = 000) y por municipio (LOC = 0000, AGEB = 0000) →
  ``geo.zone_census`` (``INEGI-CPV-2020``). «*» y «N/D» se guardan como NULL.
* Idempotente: upsert por ``code`` y por (zone_code, source).
"""

from __future__ import annotations

import argparse
import csv
import struct
import sys
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

MG_SOURCE = "INEGI-MG-2020"
CPV_SOURCE = "INEGI-CPV-2020"
SRID_INEGI = 6372
CENSUS_COLS = ("POBTOT", "TVIVPARHAB", "VPH_AUTOM", "VPH_MOTO", "VPH_BICI")


def _read_dbf(path: Path, encoding: str) -> Iterator[dict[str, str]]:
    with path.open("rb") as f:
        hdr = f.read(32)
        n, hlen, rlen = struct.unpack("<IHH", hdr[4:12])
        fields: list[tuple[str, int]] = []
        while (d := f.read(32))[0] != 0x0D:
            fields.append((d[:11].split(b"\0")[0].decode(), d[16]))
        f.seek(hlen)
        for _ in range(n):
            r, pos, row = f.read(rlen), 1, {}
            for name, ln in fields:
                row[name] = r[pos : pos + ln].decode(encoding).strip()
                pos += ln
            yield row


def _read_rings_wkt(path: Path) -> Iterator[str | None]:
    """Polígonos del .shp como MULTILINESTRING de anillos (ST_BuildArea arma el polígono)."""
    with path.open("rb") as f:
        f.seek(100)
        while len(h := f.read(8)) == 8:
            c = f.read(struct.unpack(">ii", h)[1] * 2)
            if struct.unpack("<i", c[:4])[0] == 0:  # null shape
                yield None
                continue
            nparts, npts = struct.unpack("<ii", c[36:44])
            parts = [*struct.unpack(f"<{nparts}i", c[44 : 44 + 4 * nparts]), npts]
            off = 44 + 4 * nparts
            pts = struct.unpack(f"<{2 * npts}d", c[off : off + 16 * npts])
            rings = (
                "(" + ",".join(f"{pts[2 * i]:.3f} {pts[2 * i + 1]:.3f}" for i in range(a, b)) + ")"
                for a, b in zip(parts, parts[1:], strict=False)
            )
            yield "MULTILINESTRING(" + ",".join(rings) + ")"


def _encoding(base: Path) -> str:
    cpg = base.with_suffix(".cpg")
    raw = cpg.read_text().strip().upper() if cpg.exists() else ""
    return "latin-1" if "8859" in raw.replace(" ", "") or raw == "ISO 88591" else "utf-8"


def load_zones(db: Session, mg_dir: Path) -> dict[str, int]:
    counts: dict[str, int] = {}
    for stem, kind in (("22mun", "municipio"), ("22a", "ageb")):
        base = mg_dir / stem
        mun_names: dict[str, str] = {}
        n = 0
        for attrs, wkt in zip(
            _read_dbf(base.with_suffix(".dbf"), _encoding(base)),
            _read_rings_wkt(base.with_suffix(".shp")),
            strict=True,
        ):
            if wkt is None:
                continue
            code = attrs["CVEGEO"]
            if kind == "municipio":
                name = attrs["NOMGEO"]
            else:
                name = f"AGEB {attrs['CVE_AGEB']} · mun. {attrs['CVE_MUN']} loc. {attrs['CVE_LOC']}"
            mun_names[code] = name
            db.execute(
                text(
                    """
                    INSERT INTO geo.mobility_zones (code, name, kind, geom, source, is_demo)
                    VALUES (:code, :name, :kind,
                            ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Transform(
                                ST_BuildArea(ST_GeomFromText(:wkt, :srid)), 4326)), 3)),
                            :src, false)
                    ON CONFLICT (code) DO UPDATE
                       SET name = EXCLUDED.name, kind = EXCLUDED.kind,
                           geom = EXCLUDED.geom, source = EXCLUDED.source
                    """
                ),
                {
                    "code": code,
                    "name": name,
                    "kind": kind,
                    "wkt": wkt,
                    "srid": SRID_INEGI,
                    "src": MG_SOURCE,
                },
            )
            n += 1
        counts[kind] = n
    return counts


def _num(v: str) -> int | None:
    v = v.strip()
    return int(v) if v.isdigit() else None  # «*», «N/D» y vacíos → NULL


def load_census(db: Session, csv_path: Path) -> int:
    known = {
        r[0]
        for r in db.execute(
            text("SELECT code FROM geo.mobility_zones WHERE source = :s"), {"s": MG_SOURCE}
        )
    }
    rows = []
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            if r["MZA"] != "000" or r["MUN"] == "000":
                continue
            if r["AGEB"] != "0000":
                code = r["ENTIDAD"] + r["MUN"] + r["LOC"] + r["AGEB"]
            elif r["LOC"] == "0000":
                code = r["ENTIDAD"] + r["MUN"]
            else:
                continue  # total de localidad: no hay polígono de localidad cargado
            if code in known:
                rows.append(
                    {
                        "code": code,
                        "src": CPV_SOURCE,
                        **{c.lower(): _num(r[c]) for c in CENSUS_COLS},
                    }
                )
    if rows:
        db.execute(
            text(
                """
                INSERT INTO geo.zone_census
                       (zone_code, source, pobtot, tvivparhab, vph_autom, vph_moto, vph_bici)
                VALUES (:code, :src, :pobtot, :tvivparhab, :vph_autom, :vph_moto, :vph_bici)
                ON CONFLICT (zone_code, source) DO UPDATE
                   SET pobtot = EXCLUDED.pobtot, tvivparhab = EXCLUDED.tvivparhab,
                       vph_autom = EXCLUDED.vph_autom, vph_moto = EXCLUDED.vph_moto,
                       vph_bici = EXCLUDED.vph_bici
                """
            ),
            rows,
        )
    return len(rows)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--mg", type=Path, required=True, help="carpeta con 22mun.* y 22a.*")
    p.add_argument("--censo", type=Path, help="CSV AGEB urbana del Censo 2020")
    args = p.parse_args(argv)

    from app.db.session import SessionLocal

    with SessionLocal() as db:
        zones = load_zones(db, args.mg)
        census = load_census(db, args.censo) if args.censo else 0
        db.commit()
    print(f"zonas: {zones}; filas de censo: {census}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
