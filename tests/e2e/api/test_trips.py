"""Viajes: IDOR, idempotencia, validación de trazas, CO₂ en servidor (API_CONTRACT.md §4, ADR-002/004)."""

from __future__ import annotations

import uuid

import pytest
from conftest import QRO_ROUTE, Account, Api, assert_error, assert_no_leak, trip_payload


@pytest.fixture(scope="module")
def trip_of_a(api: Api, user_a: Account) -> dict:
    resp = api.post("/trips", token=user_a.access_token, json=trip_payload())
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_trip_contract_shape(trip_of_a: dict) -> None:
    expected = {"id", "mode", "status", "started_at", "ended_at", "distance_m", "duration_s",
                "co2_emitted_g", "co2_saved_g", "client_trip_id", "emission_factor_g_per_km",
                "route", "created_at"}
    assert expected <= set(trip_of_a)
    assert "user_id" not in trip_of_a or trip_of_a.get("user_id")  # no obligatorio
    assert trip_of_a["status"] == "COMPLETED"
    assert trip_of_a["duration_s"] == 1200
    assert trip_of_a["route"]["type"] == "LineString"


def test_distance_and_co2_computed_server_side(trip_of_a: dict) -> None:
    # Traza de ~0.9 km en Querétaro. BICYCLE: factor 0 → emitido 0, ahorrado = km × 192.
    assert 500 < trip_of_a["distance_m"] < 1500
    assert trip_of_a["co2_emitted_g"] == 0
    km = trip_of_a["distance_m"] / 1000
    assert trip_of_a["co2_saved_g"] == pytest.approx(km * 192, rel=0.05)


def test_client_cannot_send_distance_or_co2(api: Api, user_a: Account) -> None:
    for extra in ({"distance_m": 999999}, {"co2_saved_g": 1e9}, {"user_id": str(uuid.uuid4())}):
        resp = api.post("/trips", token=user_a.access_token, json=trip_payload(**extra))
        assert resp.status_code == 422, f"{extra} aceptado: {resp.status_code} {resp.text[:200]}"


def test_idempotent_create(api: Api, user_a: Account) -> None:
    payload = trip_payload()
    first = api.post("/trips", token=user_a.access_token, json=payload)
    second = api.post("/trips", token=user_a.access_token, json=payload)
    assert first.status_code == 201 and second.status_code == 200, (first.text, second.text)
    assert first.json()["id"] == second.json()["id"]


def test_same_client_trip_id_other_user_is_independent(api: Api, user_a: Account, user_b: Account) -> None:
    payload = trip_payload()
    a = api.post("/trips", token=user_a.access_token, json=payload)
    b = api.post("/trips", token=user_b.access_token, json=payload)
    assert a.status_code == 201 and b.status_code == 201, (a.text, b.text)
    assert a.json()["id"] != b.json()["id"], "client_trip_id ajeno devolvió el viaje de otro usuario"


# ----------------------------------- IDOR -----------------------------------


def test_other_user_cannot_read_trip(api: Api, user_b: Account, trip_of_a: dict) -> None:
    assert_error(api.get(f"/trips/{trip_of_a['id']}", token=user_b.access_token), 404, "TRIP_NOT_FOUND")


def test_other_user_cannot_delete_trip(api: Api, user_a: Account, user_b: Account, trip_of_a: dict) -> None:
    assert_error(api.delete(f"/trips/{trip_of_a['id']}", token=user_b.access_token), 404, "TRIP_NOT_FOUND")
    assert api.get(f"/trips/{trip_of_a['id']}", token=user_a.access_token).status_code == 200


def test_nonexistent_and_foreign_trip_are_indistinguishable(api: Api, user_b: Account, trip_of_a: dict) -> None:
    foreign = api.get(f"/trips/{trip_of_a['id']}", token=user_b.access_token)
    missing = api.get(f"/trips/{uuid.uuid4()}", token=user_b.access_token)
    assert foreign.status_code == missing.status_code == 404
    assert foreign.json() == missing.json()


def test_list_only_returns_own_trips(api: Api, user_b: Account, trip_of_a: dict) -> None:
    resp = api.get("/trips", token=user_b.access_token, params={"page_size": 100})
    assert resp.status_code == 200
    body = resp.json()
    assert {"items", "total", "page", "page_size"} <= set(body)
    assert trip_of_a["id"] not in {t["id"] for t in body["items"]}
    assert all("route" not in t for t in body["items"]), "TripSummary no debe incluir la traza"


def test_admin_cannot_read_individual_trace(api: Api, make_admin, trip_of_a: dict) -> None:
    """SECURITY.md §5: los administradores nunca ven trazas individuales."""
    admin: Account = make_admin()
    assert_error(api.get(f"/trips/{trip_of_a['id']}", token=admin.access_token), 404)


def test_owner_can_delete(api: Api, user_a: Account) -> None:
    created = api.post("/trips", token=user_a.access_token, json=trip_payload()).json()
    assert api.delete(f"/trips/{created['id']}", token=user_a.access_token).status_code == 204
    assert_error(api.get(f"/trips/{created['id']}", token=user_a.access_token), 404)


def test_trip_requires_auth(api: Api) -> None:
    assert_error(api.get("/trips"), 401)
    assert_error(api.post("/trips", json=trip_payload()), 401)


# ------------------------------ Validación ----------------------------------


@pytest.mark.parametrize(("overrides", "label"), [
    ({"route": {"type": "LineString", "coordinates": [[-100.39, 20.59]]}}, "1 punto"),
    ({"route": {"type": "Point", "coordinates": [-100.39, 20.59]}}, "no LineString"),
    ({"route": {"type": "LineString", "coordinates": [[-200, 20.59], [-100.39, 95]]}}, "fuera de rango"),
    ({"route": {"type": "LineString", "coordinates": [["a", "b"], [1, 2]]}}, "no numérico"),
    ({"mode": "TELEPORT"}, "modo inválido"),
    ({"mode": "bicycle"}, "modo en minúsculas"),
    ({"client_trip_id": "no-uuid"}, "client_trip_id inválido"),
])
def test_invalid_trip_payloads(api: Api, user_a: Account, overrides: dict, label: str) -> None:
    resp = api.post("/trips", token=user_a.access_token, json=trip_payload(**overrides))
    assert_error(resp, 422, "VALIDATION_ERROR")
    assert_no_leak(resp)


def test_ended_before_started(api: Api, user_a: Account) -> None:
    p = trip_payload()
    p["started_at"], p["ended_at"] = p["ended_at"], p["started_at"]
    assert_error(api.post("/trips", token=user_a.access_token, json=p), 422, "VALIDATION_ERROR")


def test_route_point_limit(api: Api, user_a: Account) -> None:
    """Máx. 10 000 puntos (ADR-004). 10 001 → 422 (o 413 si lo corta el límite de 1 MB)."""
    coords = [[-100.39 + i * 1e-6, 20.59] for i in range(10_001)]
    resp = api.post("/trips", token=user_a.access_token,
                    json=trip_payload(route={"type": "LineString", "coordinates": coords}))
    assert resp.status_code in (413, 422), resp.status_code


def test_body_size_limit(api: Api, user_a: Account) -> None:
    resp = api.post("/trips", token=user_a.access_token,
                    content=b'{"pad":"' + b"x" * 1_100_000 + b'"}',
                    headers={"Content-Type": "application/json"})
    assert resp.status_code in (413, 422), resp.status_code


@pytest.mark.parametrize("params", [
    {"mode": "' OR 1=1 --"},
    {"from": "2026-01-01'; DROP TABLE trips; --"},
    {"page_size": 101},
    {"page": 0},
    {"page_size": "1;SELECT 1"},
])
def test_trip_list_query_validation(api: Api, user_a: Account, params: dict) -> None:
    resp = api.get("/trips", token=user_a.access_token, params=params)
    assert_error(resp, 422, "VALIDATION_ERROR")
    assert_no_leak(resp)


def test_estimate(api: Api, user_a: Account) -> None:
    by_distance = api.post("/trips/estimate", token=user_a.access_token,
                           json={"mode": "CAR", "route": None, "distance_m": 10_000})
    assert by_distance.status_code == 200, by_distance.text
    body = by_distance.json()
    assert body["co2_emitted_g"] == pytest.approx(1920, rel=0.01)
    assert body["co2_saved_g"] == 0
    by_route = api.post("/trips/estimate", token=user_a.access_token,
                        json={"mode": "BUS", "route": {"type": "LineString", "coordinates": QRO_ROUTE},
                              "distance_m": None})
    assert by_route.status_code == 200, by_route.text


@pytest.mark.parametrize("body", [
    {"mode": "CAR", "route": None, "distance_m": None},
    {"mode": "CAR", "route": None, "distance_m": -5},
])
def test_estimate_validation(api: Api, user_a: Account, body: dict) -> None:
    assert_error(api.post("/trips/estimate", token=user_a.access_token, json=body), 422)
