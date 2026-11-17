"""Integración del módulo geo sobre el esquema real (Alembic) + SQL de db/geo."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.errors import register_error_handlers
from app.routers import geo_analytics
from app.services.geo_analytics import analytics, priority_index, repository
from app.services.geo_analytics.filters import build_filters
from tests.conftest import PREFIX, auth_header, make_user, trip_payload
from tests.geo.conftest import insert_official_trips

NOW = datetime.now(UTC)
RANGE = {
    "from": (NOW - timedelta(days=400)).isoformat(),
    "to": (NOW + timedelta(days=1)).isoformat(),
}
BBOX = "-100.45,20.53,-100.33,20.65"
BBOX_T = (-100.45, 20.53, -100.33, 20.65)


def filters(dataset: str = "official"):
    return build_filters(NOW - timedelta(days=400), NOW + timedelta(days=1), None, dataset)  # type: ignore[arg-type]


@pytest.fixture
def geo_client(geo_schema: None) -> Iterator[TestClient]:
    """App mínima con el router geo montado (en producción NO está montado aún)."""
    app = FastAPI()
    register_error_handlers(app)
    app.include_router(geo_analytics.router, prefix=PREFIX)
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def test_adapter_detects_contract_schema(geo_db: Any) -> None:
    variant = geo_db.execute(text("SELECT geo.rebuild_adapters()")).scalar_one()
    geo_db.commit()
    assert variant == "contract-v1"


def test_demo_and_official_never_mix(geo_db: Any) -> None:
    insert_official_trips(geo_db, n_users=12, per_user=3)
    official = analytics.summary(geo_db, filters("official"))
    demo = analytics.summary(geo_db, filters("demo"))
    assert official["trips_count"] == 36
    assert (
        demo["trips_count"]
        == geo_db.execute(text("SELECT count(*) FROM geo.demo_trips")).scalar_one()
    )
    # Las tablas oficiales nunca reciben datos DEMO (/stats/city lee public.trips)
    assert geo_db.execute(text("SELECT count(*) FROM trips")).scalar_one() == 36


def test_trip_created_through_api_is_visible_with_backend_co2(geo_db: Any, client: Any) -> None:
    user = make_user(client)
    r = client.post(f"{PREFIX}/trips", json=trip_payload(), headers=auth_header(user))
    assert r.status_code == 201, r.text
    row = (
        geo_db.execute(
            text(
                "SELECT mode_code, co2_saved_g, is_demo, "
                "ST_Distance(origin_utm, destination_utm) > 0 AS moved "
                "FROM geo.v_trips WHERE id = :id"
            ),
            {"id": r.json()["id"]},
        )
        .mappings()
        .one()
    )
    assert row["mode_code"] == "BICYCLE"
    assert row["co2_saved_g"] == pytest.approx(r.json()["co2_saved_g"])
    assert row["moved"] and not row["is_demo"]


def test_k_anonymity_on_zones(geo_db: Any) -> None:
    insert_official_trips(geo_db, n_users=12, per_user=3)
    # Las zonas oficiales no existen (solo DEMO): sin zonas no hay filas
    assert repository.trips_by_zone(geo_db, filters("official"), None) == []
    rows = repository.trips_by_zone(geo_db, filters("demo"), None)
    assert rows and all(r["users"] >= 5 for r in rows)
    assert rows[0]["geometry"]["type"] == "MultiPolygon"


def test_trips_in_zone_paginates(geo_db: Any) -> None:
    zone = geo_db.execute(text("SELECT id FROM geo.v_zones WHERE code = 'DEMO-B2'")).scalar_one()
    p1, total = repository.trips_in_zone(geo_db, zone, "any", filters("demo"), 1, 10)
    p2, total2 = repository.trips_in_zone(geo_db, zone, "any", filters("demo"), 2, 10)
    assert len(p1) == 10 and total == total2 and total > 20
    assert {r["trip_id"] for r in p1}.isdisjoint({r["trip_id"] for r in p2})


def test_spatial_endpoints(geo_client: TestClient, client: Any) -> None:
    admin = auth_header(make_user(client, role="ADMIN"))
    q = {**RANGE, "dataset": "demo", "bbox": BBOX}

    r = geo_client.get(f"{PREFIX}/admin/analytics/grid", params={**q, "cell_m": 500}, headers=admin)
    assert r.status_code == 200, r.text
    fc = r.json()
    assert fc["type"] == "FeatureCollection" and fc["features"]
    assert fc["meta"]["is_demo"] is True and any("DEMO" in n for n in fc["meta"]["notes"])
    assert "trips_count" in fc["features"][0]["properties"]
    assert all(f["properties"]["users"] >= fc["meta"]["min_users"] for f in fc["features"])

    r = geo_client.get(f"{PREFIX}/admin/analytics/heatmap", params=q, headers=admin)
    hm = r.json()
    assert r.status_code == 200 and hm["type"] == "FeatureCollection" and hm["features"]
    lng, lat = hm["features"][0]["geometry"]["coordinates"]  # contrato §0: [lng, lat]
    assert -101 < lng < -100 and 20 < lat < 21
    assert hm["max_weight"] >= hm["features"][0]["properties"]["weight"] >= 1

    r = geo_client.get(f"{PREFIX}/admin/analytics/corridors", params=q, headers=admin)
    assert r.status_code == 200 and r.json()["features"]

    r = geo_client.get(
        f"{PREFIX}/admin/analytics/od-flows", params={**RANGE, "dataset": "demo"}, headers=admin
    )
    assert r.status_code == 200 and r.json()["features"][0]["geometry"]["type"] == "LineString"

    r = geo_client.get(
        f"{PREFIX}/admin/analytics/bike-lane-coverage",
        params={**RANGE, "dataset": "demo"},
        headers=admin,
    )
    assert r.status_code == 200 and r.json()["items"]

    r = geo_client.post(
        f"{PREFIX}/admin/analytics/route-crossings",
        params={**RANGE, "dataset": "demo"},
        json={
            "geometry": {"type": "LineString", "coordinates": [[-100.39, 20.55], [-100.39, 20.63]]},
            "buffer_m": 20,
        },
        headers=admin,
    )
    assert r.status_code == 200 and r.json()["total"] > 0
    crossing = r.json()["items"][0]
    assert set(crossing) == {"trip_id", "mode", "started_at", "overlap_m"}

    zone = geo_client.get(
        f"{PREFIX}/admin/analytics/zones",
        params={**RANGE, "dataset": "demo", "kind": "custom"},
        headers=admin,
    ).json()["features"][0]["id"]
    r = geo_client.get(
        f"{PREFIX}/admin/analytics/zones/{zone}/trips",
        params={**RANGE, "dataset": "demo", "relation": "both", "page_size": 5},
        headers=admin,
    )
    page = r.json()
    assert r.status_code == 200 and len(page["items"]) <= 5 and page["total"] > 0
    assert all(t["relation"] == "both" and t["source"] == "GPS" for t in page["items"])
    a, b = page["items"][0]["trip_id"], page["items"][1]["trip_id"]
    r = geo_client.get(
        f"{PREFIX}/admin/analytics/route-overlap", params={"trip_a": a, "trip_b": b}, headers=admin
    )
    assert r.status_code == 200 and {"share_a", "share_b", "tolerance_m"} <= set(r.json())
    missing = "00000000-0000-0000-0000-000000000000"
    r = geo_client.get(f"{PREFIX}/admin/analytics/zones/{missing}/trips", headers=admin)
    assert r.status_code == 404 and r.json()["error"]["code"] == "ZONE_NOT_FOUND"

    r = geo_client.get(
        f"{PREFIX}/admin/analytics/distance",
        params={"origin": "-100.39,20.59", "destination": "-100.38,20.60"},
        headers=admin,
    )
    assert r.status_code == 200 and 1400 < r.json()["distance_m"] < 1600
    assert r.json()["meta"]["dataset"] == "official"
    assert fc["meta"]["bbox"] == [float(x) for x in BBOX.split(",")]

    r = geo_client.get(
        f"{PREFIX}/admin/analytics/bike-lane-coverage",
        params={**RANGE, "dataset": "demo"},
        headers=admin,
    )
    item = r.json()["items"][0]
    assert set(item) == {"mode", "trips_count", "covered_share"} and 0 <= item["covered_share"] <= 1


def test_indicator_endpoints(geo_client: TestClient, client: Any) -> None:
    admin = auth_header(make_user(client, role="ADMIN"))
    q = {**RANGE, "dataset": "demo"}
    s = geo_client.get(f"{PREFIX}/admin/analytics/summary", params=q, headers=admin).json()
    assert s["trips_count"] > 0 and s["co2"]["reference_car_g"] >= s["co2_saved_g"]
    assert s["meta"]["is_estimate"] is True
    m = geo_client.get(f"{PREFIX}/admin/analytics/modes", params=q, headers=admin).json()["items"]
    assert m == sorted(m, key=lambda x: -x["trips_count"])
    ts = geo_client.get(
        f"{PREFIX}/admin/analytics/timeseries", params={**q, "granularity": "month"}, headers=admin
    ).json()
    assert len(ts["points"]) >= 12 and ts["points"][0]["period_start"].endswith("Z")
    ph = geo_client.get(f"{PREFIX}/admin/analytics/peak-hours", params=q, headers=admin).json()
    assert {p["hour"] for p in ph["items"]} <= set(range(24))
    ph = geo_client.get(
        f"{PREFIX}/admin/analytics/peak-hours", params={**q, "by_weekday": True}, headers=admin
    ).json()
    assert {p["weekday"] for p in ph["items"]} <= set(range(7))
    ug = geo_client.get(f"{PREFIX}/admin/analytics/users-growth", params=q, headers=admin).json()
    totals = [p["total_users"] for p in ug["points"]]
    assert totals == sorted(totals) and totals[-1] > 0
    assert sum(p["new_users"] for p in ug["points"]) <= totals[-1]
    inf = geo_client.get(f"{PREFIX}/admin/analytics/infrastructure", params=q, headers=admin).json()
    assert set(inf["pois_by_category"]) == {
        "BIKE_PARKING",
        "BIKE_SHARING",
        "BUS_STOP",
        "EV_CHARGER",
        "REPAIR_STATION",
    }
    assert inf["cycleways_length_m"] > 0 and inf["meta"]["bbox"] is not None
    cm = geo_client.get(f"{PREFIX}/admin/analytics/co2-methodology", headers=admin).json()
    assert {"assumptions", "units", "notes", "meta"} <= set(cm)


def test_priority_endpoint_is_explainable(geo_client: TestClient, client: Any) -> None:
    admin = auth_header(make_user(client, role="ADMIN"))
    r = geo_client.get(
        f"{PREFIX}/admin/analytics/infrastructure-priority",
        params={**RANGE, "dataset": "demo", "bbox": BBOX, "infra": "bike_lane"},
        headers=admin,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    scored = [f for f in body["features"] if f["properties"]["score"] is not None]
    assert scored, "debe haber celdas con muestra suficiente en DEMO"
    top = scored[0]["properties"]
    assert top["explanation"] and top["components"] and 0 <= top["confidence"] <= 1
    assert set(top) == {
        "score",
        "label",
        "confidence",
        "sample",
        "demand_share",
        "components",
        "explanation",
    }
    assert any("estudio técnico" in n for n in body["meta"]["notes"])

    # Sin infraestructura oficial cargada, la brecha queda "no disponible", no "lejos"
    r = geo_client.get(
        f"{PREFIX}/admin/analytics/infrastructure-priority",
        params={**RANGE, "bbox": BBOX, "infra": "bus_stop"},
        headers=admin,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert any("no disponible" in n for n in body["notes"])
    if not body["features"]:
        # Sin viajes oficiales en el área: respuesta vacía y explícita, nunca un puntaje.
        assert any(priority_index.NO_CELLS_NOTE in n for n in body["notes"])
    else:
        cell = body["features"][0]["properties"]
        gap = next(c for c in cell["components"] if c["kind"] == "gap")
        assert gap["available"] is False


def test_authorization_and_errors(geo_client: TestClient, client: Any) -> None:
    user = auth_header(make_user(client))
    admin = auth_header(make_user(client, role="ADMIN"))
    assert geo_client.get(f"{PREFIX}/admin/analytics/summary").status_code == 401
    assert geo_client.get(f"{PREFIX}/admin/analytics/summary", headers=user).status_code == 403

    r = geo_client.get(
        f"{PREFIX}/admin/analytics/grid", params={"bbox": "-101,20,-99,22"}, headers=admin
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "BBOX_TOO_LARGE"
    r = geo_client.get(
        f"{PREFIX}/admin/analytics/grid",
        params={"bbox": "-100.7,20.3,-100.2,20.8", "cell_m": 100},
        headers=admin,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "GRID_TOO_LARGE"
    r = geo_client.get(
        f"{PREFIX}/admin/analytics/summary",
        params={"from": "2026-01-01T00:00:00Z", "to": "2025-01-01T00:00:00Z"},
        headers=admin,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "DATE_RANGE_INVALID"
    r = geo_client.get(
        f"{PREFIX}/admin/analytics/summary", params={"dataset": "mixed"}, headers=admin
    )
    assert r.status_code == 422


def test_small_official_sample_is_suppressed(geo_db: Any) -> None:
    insert_official_trips(geo_db, n_users=2, per_user=2)  # 4 viajes < 10
    s = analytics.summary(geo_db, filters("official"))
    assert s["suppressed"] and s["trips_count"] == 0 and s["by_mode"] == []
