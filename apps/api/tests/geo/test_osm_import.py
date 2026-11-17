"""Importador OSM: transformación y upsert idempotente (sin red)."""

import argparse
import json
from pathlib import Path
from typing import Any

from sqlalchemy import text

from app.services.geo_analytics import osm_import as oi

SAMPLE = json.loads((Path(__file__).parent / "fixtures" / "overpass_sample.json").read_text())
BBOX = (-100.45, 20.53, -100.33, 20.65)


def test_cycleway_parsing_and_protection_rules() -> None:
    rows = {r.osm_id: r for r in oi.parse_cycleways(SAMPLE["cycleways"])}
    assert set(rows) == {900001, 900002, 900003}  # 900004 es degenerada (un solo punto)
    assert rows[900001].is_protected and rows[900001].name == "Prueba Ciclopista"
    assert not rows[900002].is_protected  # carril pintado
    assert rows[900003].is_protected  # cycleway=track
    assert rows[900001].wkt.startswith("LINESTRING(-100.39 20.59")  # [lng lat]


def test_poi_parsing_categories_and_attributes() -> None:
    rows = {r.osm_id: r for r in oi.parse_pois(SAMPLE["pois"])}
    assert {r.category for r in rows.values()} == {
        "BIKE_PARKING",
        "BIKE_SHARING",
        "BUS_STOP",
        "EV_CHARGER",
        "REPAIR_STATION",
    }
    assert 800006 not in rows  # banca: fuera de alcance
    park = rows[800001]
    assert park.name == "Estacionamiento de bicicletas" and park.attributes["capacity"] == 12
    assert park.attributes["source"] == "osm" and park.attributes["attribution"].startswith("©")
    stop = rows[800003]
    assert stop.attributes["ref"] == "P-17" and stop.attributes["lines"] == ["12", "45", "77"]
    assert all("code" not in r.attributes for r in rows.values())  # code solo lo asigna un admin
    assert rows[800007].attributes["ref"] == "P-17"  # ref repetido: se importan ambas paradas
    assert rows[800002].osm_type == "way" and rows[800002].lon == -100.391
    assert "capacity" not in rows[800004].attributes  # "n/a" no es número


def _args(**kw: Any) -> argparse.Namespace:
    base = {
        "dry_run": False,
        "prune": False,
        "from_raw": None,
        "save_raw": None,
        "overpass_url": oi.OVERPASS_URL,
    }
    return argparse.Namespace(**{**base, **kw})


def _admin_poi(db: Any) -> str:
    pid = db.execute(
        text("""
        INSERT INTO pois (id, name, category, attributes, location)
        VALUES (gen_random_uuid(), 'Ciclopuerto creado por admin', 'BIKE_PARKING',
                '{"capacity": 5}', ST_SetSRID(ST_MakePoint(-100.39, 20.59), 4326))
        RETURNING id""")
    ).scalar_one()
    db.commit()
    return str(pid)


def test_upsert_is_idempotent_and_keeps_admin_pois(geo_db: Any) -> None:
    admin_id = _admin_poi(geo_db)
    cyc, pois = oi.parse_cycleways(SAMPLE["cycleways"]), oi.parse_pois(SAMPLE["pois"])

    first_c = oi.upsert_cycleways(geo_db, cyc, BBOX, prune=False)
    first_p = oi.upsert_pois(geo_db, pois, BBOX, prune=False)
    geo_db.commit()
    assert (first_c["inserted"], first_c["updated"]) == (3, 0)
    assert (first_p["inserted"], first_p["updated"]) == (6, 0)

    again_c = oi.upsert_cycleways(geo_db, cyc, BBOX, prune=False)
    again_p = oi.upsert_pois(geo_db, pois, BBOX, prune=False)
    geo_db.commit()
    assert (again_c["inserted"], again_c["updated"]) == (0, 0)
    assert (again_p["inserted"], again_p["updated"]) == (0, 0)

    assert geo_db.execute(text("SELECT count(*) FROM pois")).scalar_one() == 7
    admin = geo_db.execute(
        text("SELECT name, attributes FROM pois WHERE id = :i"), {"i": admin_id}
    ).one()
    assert admin.name == "Ciclopuerto creado por admin" and "source" not in admin.attributes


def test_changes_update_and_prune_soft_deletes(geo_db: Any) -> None:
    pois = oi.parse_pois(SAMPLE["pois"])
    oi.upsert_pois(geo_db, pois, BBOX, prune=False)
    geo_db.commit()
    # Un ADMIN desactiva un POI de OSM: la reimportación no debe reactivarlo
    geo_db.execute(text("UPDATE pois SET is_active = false WHERE attributes->>'osm_id' = '800005'"))
    geo_db.commit()

    renamed = [
        p if p.osm_id != 800003 else oi.PoiRow(**{**p.__dict__, "name": "Parada renombrada"})
        for p in pois
        if p.osm_id != 800001
    ]  # 800001 desaparece de OSM
    res = oi.upsert_pois(geo_db, renamed, BBOX, prune=True)
    geo_db.commit()
    assert res["updated"] == 1 and res["deactivated"] == 1 and res["inserted"] == 0
    state = dict(geo_db.execute(text("SELECT attributes->>'osm_id', is_active FROM pois")).all())
    assert state["800001"] is False and state["800005"] is False and state["800003"] is True


def test_cli_from_raw_and_dry_run(geo_db: Any, tmp_path: Path) -> None:
    for layer in ("cycleways", "pois"):
        (tmp_path / f"{layer}.json").write_text(json.dumps(SAMPLE[layer]))
    summary = oi.run(geo_db, ["cycleways", "pois"], BBOX, _args(from_raw=str(tmp_path)))
    assert summary["pois"]["inserted"] == 6
    summary = oi.run(geo_db, ["pois"], BBOX, _args(from_raw=str(tmp_path)))
    assert summary["pois"]["inserted"] == 0
    dry = _args(from_raw=str(tmp_path), dry_run=True)
    geo_db.execute(text("TRUNCATE pois CASCADE"))
    geo_db.commit()
    oi.run(geo_db, ["pois"], BBOX, dry)
    assert geo_db.execute(text("SELECT count(*) FROM pois")).scalar_one() == 0


def test_bbox_validation() -> None:
    import pytest

    with pytest.raises(argparse.ArgumentTypeError):
        oi._parse_bbox("-101,20,-99,22")
    assert oi._parse_bbox("-100.62,20.40,-100.15,20.85") == oi.DEFAULT_BBOX
