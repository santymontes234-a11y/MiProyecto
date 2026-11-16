import uuid
from datetime import UTC, datetime, timedelta

import pytest

from tests.conftest import PREFIX, ROUTE, auth_header, register, trip_payload


@pytest.fixture
def user(client):
    return register(client)


def test_create_trip_computes_distance_and_co2_on_server(client, user):
    r = client.post(f"{PREFIX}/trips", headers=auth_header(user), json=trip_payload(mode="BICYCLE"))
    assert r.status_code == 201, r.text
    t = r.json()
    # ~1.17 km calculados por PostGIS (ST_Length geography), no por el cliente.
    assert 1100 < t["distance_m"] < 1250
    assert t["duration_s"] == 1200
    assert t["emission_factor_g_per_km"] == 0
    assert t["co2_emitted_g"] == 0
    assert t["co2_saved_g"] == pytest.approx(t["distance_m"] / 1000 * 192, rel=1e-3)
    assert t["status"] == "COMPLETED"
    assert t["route"]["type"] == "LineString" and len(t["route"]["coordinates"]) == 3
    assert t["started_at"].endswith("Z")


def test_bus_trip_partial_savings_and_car_trip_zero(client, user):
    bus = client.post(f"{PREFIX}/trips", headers=auth_header(user), json=trip_payload(mode="BUS")).json()
    km = bus["distance_m"] / 1000
    assert bus["co2_emitted_g"] == pytest.approx(km * 68, rel=1e-3)
    assert bus["co2_saved_g"] == pytest.approx(km * (192 - 68), rel=1e-3)
    car = client.post(f"{PREFIX}/trips", headers=auth_header(user), json=trip_payload(mode="CAR")).json()
    assert car["co2_saved_g"] == 0


def test_client_distance_is_ignored(client, user):
    r = client.post(f"{PREFIX}/trips", headers=auth_header(user), json=trip_payload(distance_m=999999))
    assert r.status_code == 422  # campo desconocido: extra="forbid"


def test_idempotent_by_client_trip_id(client, user):
    payload = trip_payload()
    first = client.post(f"{PREFIX}/trips", headers=auth_header(user), json=payload)
    again = client.post(f"{PREFIX}/trips", headers=auth_header(user), json=payload)
    assert first.status_code == 201 and again.status_code == 200
    assert first.json()["id"] == again.json()["id"]
    assert client.get(f"{PREFIX}/trips", headers=auth_header(user)).json()["total"] == 1


@pytest.mark.parametrize(
    "override",
    [
        {"mode": "TELEPORT"},
        {"route": {"type": "LineString", "coordinates": [[-100.39, 20.59]]}},
        {"route": {"type": "LineString", "coordinates": [[-200, 20.59], [-100.38, 20.59]]}},
        {"route": {"type": "LineString", "coordinates": [[-100.39, 95], [-100.38, 20.59]]}},
        {"route": {"type": "Point", "coordinates": [-100.39, 20.59]}},
        {"route": {"type": "LineString", "coordinates": [[-100.39, 20.59], [-100.39, 20.59]]}},
        {"client_trip_id": "no-es-uuid"},
        {"started_at": "2026-11-15T08:00:00"},  # sin zona horaria
    ],
)
def test_invalid_trips_rejected(client, user, override):
    r = client.post(f"{PREFIX}/trips", headers=auth_header(user), json=trip_payload(**override))
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_time_rules(client, user):
    end = datetime.now(UTC) - timedelta(hours=1)
    inverted = trip_payload(started_at=end.isoformat(), ended_at=(end - timedelta(minutes=5)).isoformat())
    future = trip_payload(started_at=datetime.now(UTC).isoformat(),
                          ended_at=(datetime.now(UTC) + timedelta(hours=2)).isoformat())
    too_long = trip_payload(started_at=(end - timedelta(hours=30)).isoformat(), ended_at=end.isoformat())
    for p in (inverted, future, too_long):
        assert client.post(f"{PREFIX}/trips", headers=auth_header(user), json=p).status_code == 422


def test_route_point_limit(client, user):
    coords = [[-100.39 + i * 1e-6, 20.59] for i in range(10_001)]
    r = client.post(f"{PREFIX}/trips", headers=auth_header(user),
                    json=trip_payload(route={"type": "LineString", "coordinates": coords}))
    assert r.status_code in (413, 422)


def test_list_filters_and_pagination(client, user):
    h = auth_header(user)
    for mode in ("BICYCLE", "BICYCLE", "WALK"):
        assert client.post(f"{PREFIX}/trips", headers=h, json=trip_payload(mode=mode)).status_code == 201
    r = client.get(f"{PREFIX}/trips", headers=h, params={"page": 1, "page_size": 2})
    body = r.json()
    assert body["total"] == 3 and len(body["items"]) == 2 and body["page_size"] == 2
    assert "route" not in body["items"][0]  # TripSummary no incluye la traza
    assert client.get(f"{PREFIX}/trips", headers=h, params={"mode": "WALK"}).json()["total"] == 1
    assert client.get(f"{PREFIX}/trips", headers=h, params={"page_size": 101}).status_code == 422


def test_idor_other_users_trips_are_404(client, user):
    other = register(client)
    trip = client.post(f"{PREFIX}/trips", headers=auth_header(user), json=trip_payload()).json()
    r = client.get(f"{PREFIX}/trips/{trip['id']}", headers=auth_header(other))
    assert r.status_code == 404 and r.json()["error"]["code"] == "TRIP_NOT_FOUND"
    assert client.delete(f"{PREFIX}/trips/{trip['id']}", headers=auth_header(other)).status_code == 404
    assert client.get(f"{PREFIX}/trips", headers=auth_header(other)).json()["total"] == 0
    # El dueño sí lo ve y lo puede borrar.
    assert client.get(f"{PREFIX}/trips/{trip['id']}", headers=auth_header(user)).status_code == 200
    assert client.delete(f"{PREFIX}/trips/{trip['id']}", headers=auth_header(user)).status_code == 204
    assert client.get(f"{PREFIX}/trips/{trip['id']}", headers=auth_header(user)).status_code == 404


def test_same_client_trip_id_from_other_user_is_independent(client, user):
    other = register(client)
    payload = trip_payload()
    a = client.post(f"{PREFIX}/trips", headers=auth_header(user), json=payload)
    b = client.post(f"{PREFIX}/trips", headers=auth_header(other), json=payload)
    assert a.status_code == b.status_code == 201 and a.json()["id"] != b.json()["id"]


def test_estimate(client, user):
    h = auth_header(user)
    r = client.post(f"{PREFIX}/trips/estimate", headers=h, json={"mode": "BICYCLE", "distance_m": 4200})
    assert r.json() == {"mode": "BICYCLE", "distance_m": 4200, "co2_emitted_g": 0, "co2_saved_g": 806.4,
                        "emission_factor_g_per_km": 0}
    r = client.post(f"{PREFIX}/trips/estimate", headers=h, json={"mode": "BUS", "route": ROUTE})
    assert r.status_code == 200 and r.json()["distance_m"] > 1000
    both = client.post(f"{PREFIX}/trips/estimate", headers=h, json={"mode": "BUS", "route": ROUTE, "distance_m": 10})
    assert both.status_code == 422
    assert client.post(f"{PREFIX}/trips/estimate", json={"mode": "BUS", "distance_m": 10}).status_code == 401


def test_unknown_trip_id_formats(client, user):
    h = auth_header(user)
    assert client.get(f"{PREFIX}/trips/{uuid.uuid4()}", headers=h).status_code == 404
    assert client.get(f"{PREFIX}/trips/1 OR 1=1", headers=h).status_code == 422
