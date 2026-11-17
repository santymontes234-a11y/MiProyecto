"""Mapa y estadísticas: límites de bbox, inyección, k-anonimato (API_CONTRACT.md §5–6)."""

from __future__ import annotations

import uuid

import pytest
from conftest import QRO_BBOX, Account, Api, assert_error, assert_no_leak


def test_pois_public_geojson(api: Api) -> None:
    resp = api.get("/map/pois", params={"bbox": QRO_BBOX})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["type"] == "FeatureCollection"
    for f in body["features"]:
        lng, lat = f["geometry"]["coordinates"]
        assert -101 < lng < -99 and 20 < lat < 22, "orden [lng, lat] incorrecto"


def test_cycleways_public(api: Api) -> None:
    resp = api.get("/map/cycleways", params={"bbox": QRO_BBOX})
    assert resp.status_code == 200, resp.text
    assert resp.json()["type"] == "FeatureCollection"


@pytest.mark.parametrize("path", ["/map/pois", "/map/cycleways"])
def test_bbox_required(api: Api, path: str) -> None:
    assert_error(api.get(path), (400, 422))


@pytest.mark.parametrize("path", ["/map/pois", "/map/cycleways"])
def test_bbox_too_large(api: Api, path: str) -> None:
    assert_error(api.get(path, params={"bbox": "-101,20,-99,22"}), 400, "BBOX_TOO_LARGE")


@pytest.mark.parametrize("bbox", [
    "a,b,c,d", "1,2,3", "-100.4,20.6,-100.5,20.5", "-200,20,-199.9,20.1",
    "-100.4,20.5,-100.3,20.6;DROP TABLE pois", "NaN,NaN,NaN,NaN", "1e308,1,1e308,1",
])
def test_bbox_malformed(api: Api, bbox: str) -> None:
    resp = api.get("/map/pois", params={"bbox": bbox})
    assert 400 <= resp.status_code < 500, f"bbox={bbox!r} → {resp.status_code}"
    assert_no_leak(resp)


def test_poi_limit_bounds(api: Api) -> None:
    assert_error(api.get("/map/pois", params={"bbox": QRO_BBOX, "limit": 501}), 422)
    assert_error(api.get("/map/pois", params={"bbox": QRO_BBOX, "category": "ROCKET"}), 422)


def test_poi_not_found(api: Api) -> None:
    assert_error(api.get(f"/map/pois/{uuid.uuid4()}"), 404)


def test_poi_xss_is_returned_as_json_data(api: Api, make_admin) -> None:
    """La API almacena texto, pero debe servirlo como JSON (no HTML) con CSP y nosniff."""
    admin: Account = make_admin()
    payload = {"name": "<img src=x onerror=alert(1)>", "category": "BIKE_PARKING",
               "description": "<script>alert('xss')</script>",
               "location": {"type": "Point", "coordinates": [-100.39, 20.59]}, "attributes": {}}
    resp = api.post("/admin/map/pois", token=admin.access_token, json=payload)
    assert resp.status_code == 201, resp.text
    assert resp.headers["content-type"].startswith("application/json")
    assert resp.headers.get("x-content-type-options") == "nosniff"
    poi_id = resp.json()["id"]
    assert api.delete(f"/admin/map/pois/{poi_id}", token=admin.access_token).status_code == 204
    # Borrado lógico: deja de ser visible públicamente.
    assert api.get(f"/map/pois/{poi_id}").status_code == 404


def test_stats_me_requires_auth_and_is_scoped(api: Api, user_b: Account) -> None:
    assert_error(api.get("/stats/me"), 401)
    resp = api.get("/stats/me", token=user_b.access_token)
    assert resp.status_code == 200, resp.text
    assert {"trips_count", "distance_m", "co2_emitted_g", "co2_saved_g", "by_mode"} <= set(resp.json())


def test_timeseries_validation(api: Api, user_b: Account) -> None:
    ok = api.get("/stats/me/timeseries", token=user_b.access_token,
                 params={"granularity": "week", "from": "2026-01-01T00:00:00Z", "to": "2026-12-31T00:00:00Z"})
    assert ok.status_code == 200, ok.text
    bad = api.get("/stats/me/timeseries", token=user_b.access_token,
                  params={"granularity": "hour", "from": "2026-01-01T00:00:00Z", "to": "2026-12-31T00:00:00Z"})
    assert_error(bad, 422)


def test_city_stats_k_anonymity(api: Api) -> None:
    """Rango vacío/minúsculo → ceros (k-anonimato ≥ 10 viajes)."""
    resp = api.get("/stats/city", params={"from": "2001-01-01T00:00:00Z", "to": "2001-01-01T00:01:00Z"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["trips_count"] == 0 and body["distance_m"] == 0
    assert "user" not in resp.text.lower() and "email" not in resp.text.lower()
