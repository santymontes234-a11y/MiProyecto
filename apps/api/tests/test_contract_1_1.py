"""Rutas y reglas de los contratos 1.1 y 1.2 (pruebas rápidas, sin servicios externos)."""

from datetime import UTC, datetime, timedelta

import pytest

from app.core import route_token
from tests.conftest import PASSWORD, PREFIX, ROUTE, auth_header, make_user, register, trip_payload


@pytest.fixture
def user(client):
    return register(client)


def test_estimate_batch_and_vehicle(client, user):
    h = auth_header(user)
    r = client.post(f"{PREFIX}/trips/estimate/batch", headers=h,
                    json={"modes": ["WALK", "BUS", "CAR"], "distance_m": 10000})
    assert r.status_code == 200
    items = r.json()["items"]
    assert [i["mode"] for i in items] == ["WALK", "BUS", "CAR"]
    assert items[0]["co2_saved_g"] == 1740 and items[0]["points_estimate"] == 17
    assert items[2]["vehicle_type"] == "SEDAN" and items[2]["occupants"] == 1 and items[2]["co2_saved_g"] == 0
    # Auto compartido: 3 ocupantes en SUV → emite 1/3 y ahorra 2/3 del SUV solo.
    r = client.post(f"{PREFIX}/trips/estimate", headers=h,
                    json={"mode": "CAR", "distance_m": 9000, "vehicle_type": "SUV", "occupants": 3}).json()
    assert r["co2_emitted_g"] == 672 and r["co2_saved_g"] == 1344
    bad = client.post(f"{PREFIX}/trips/estimate", headers=h,
                      json={"mode": "BICYCLE", "distance_m": 9000, "vehicle_type": "SUV"})
    assert bad.status_code == 422
    assert client.post(f"{PREFIX}/trips/estimate", headers=h,
                       json={"mode": "CARPOOL", "distance_m": 9000, "occupants": 1}).status_code == 422
    vt = client.get(f"{PREFIX}/catalog/vehicle-types").json()
    assert {v["code"] for v in vt} >= {"SEDAN", "SUV"} and "grams_per_km" not in vt[0]


def test_trip_validations(client, user):
    h = auth_header(user)
    outside = {"type": "LineString", "coordinates": [[-99.13, 19.43], [-99.12, 19.44]]}
    r = client.post(f"{PREFIX}/trips", headers=h, json=trip_payload(route=outside))
    assert r.json()["error"]["code"] == "TRIP_OUTSIDE_SERVICE_AREA"
    short = {"type": "LineString", "coordinates": [[-100.39, 20.59], [-100.3901, 20.59]]}
    assert client.post(f"{PREFIX}/trips", headers=h, json=trip_payload(route=short)).json()["error"]["code"] \
        == "TRIP_TOO_SHORT"
    end = datetime.now(UTC).replace(microsecond=0) - timedelta(days=3)
    fast = trip_payload(mode="WALK", started_at=(end - timedelta(minutes=1)).isoformat(), ended_at=end.isoformat())
    assert client.post(f"{PREFIX}/trips", headers=h, json=fast).json()["error"]["code"] == "TRIP_IMPLAUSIBLE_SPEED"
    first = trip_payload()
    assert client.post(f"{PREFIX}/trips", headers=h, json=first).status_code == 201
    dup = {**first, "client_trip_id": trip_payload()["client_trip_id"]}
    r = client.post(f"{PREFIX}/trips", headers=h, json=dup)
    assert r.status_code == 409 and r.json()["error"]["code"] == "TRIP_DUPLICATE"
    planned = trip_payload(source="PLANNED", route_token="x" * 20)
    assert client.post(f"{PREFIX}/trips", headers=h, json=planned).json()["error"]["code"] == "ROUTE_TOKEN_INVALID"
    token = route_token.sign(ROUTE["coordinates"], "BICYCLE")
    ok = client.post(f"{PREFIX}/trips", headers=h, json=trip_payload(source="PLANNED", route_token=token))
    assert ok.status_code == 201 and ok.json()["source"] == "PLANNED" and ok.json()["points"] >= 0


def test_patch_trip_and_points(client, user):
    h = auth_header(user)
    trip = client.post(f"{PREFIX}/trips", headers=h, json=trip_payload(mode="BUS")).json()
    r = client.patch(f"{PREFIX}/trips/{trip['id']}", headers=h, json={"mode": "BICYCLE"})
    assert r.status_code == 200 and r.json()["mode"] == "BICYCLE" and r.json()["co2_saved_g"] > trip["co2_saved_g"]
    r = client.patch(f"{PREFIX}/trips/{trip['id']}", headers=h, json={"status": "CANCELLED"})
    assert r.json()["points"] == 0
    other = auth_header(register(client))
    assert client.patch(f"{PREFIX}/trips/{trip['id']}", headers=other, json={"mode": "WALK"}).status_code == 404


def test_recurring_trips(client, user):
    h = auth_header(user)
    today = datetime.now(UTC).date()
    body = {"mode": "BICYCLE", "route": ROUTE, "start_date": str(today - timedelta(days=13)),
            "end_date": str(today - timedelta(days=1)), "weekdays": [0, 1, 2, 3, 4], "departure_time": "08:00",
            "duration_s": 1200, "utc_offset_minutes": -360}
    r = client.post(f"{PREFIX}/trips/recurring", headers=h, json=body)
    assert r.status_code == 201 and r.json()["created"] >= 8
    again = client.post(f"{PREFIX}/trips/recurring", headers=h, json=body).json()
    assert again["created"] == 0 and again["skipped_duplicates"] == r.json()["created"]


def test_achievements_notifications_gamification(client, user):
    h = auth_header(user)
    client.post(f"{PREFIX}/trips", headers=h, json=trip_payload())
    ach = client.get(f"{PREFIX}/users/me/achievements", headers=h).json()
    first = next(a for a in ach if a["achievement"]["code"] == "FIRST_TRIP")
    assert first["awarded_at"] is not None and first["progress"] == 1
    n = client.get(f"{PREFIX}/notifications", headers=h).json()
    assert n["unread_count"] >= 1 and n["items"][0]["type"] == "ACHIEVEMENT_UNLOCKED"
    assert client.post(f"{PREFIX}/notifications/{n['items'][0]['id']}/read", headers=h).status_code == 204
    assert client.post(f"{PREFIX}/notifications/read-all", headers=h).status_code == 204
    assert client.get(f"{PREFIX}/notifications", headers=h).json()["unread_count"] == 0
    g = client.get(f"{PREFIX}/gamification/me", headers=h).json()
    assert g["points_total"] > 0 and g["level"] >= 1
    rk = client.get(f"{PREFIX}/gamification/ranking", headers=h).json()
    assert rk["me"] is None and all(e["display_name"] != "Ana López" for e in rk["entries"])
    client.patch(f"{PREFIX}/users/me", headers=h, json={"ranking_opt_in": True})
    rk = client.get(f"{PREFIX}/gamification/ranking", headers=h, params={"period": "all"}).json()
    assert rk["me"]["position"] == 1 and rk["entries"][0]["display_name"] == "Ana L."


def test_preferences_export_delete(client):
    user = register(client)
    h = auth_header(user)
    p = client.put(f"{PREFIX}/users/me/preferences", headers=h,
                   json={"language": "en", "default_vehicle_type": "SUV", "weekly_goal_trips": 5})
    assert p.status_code == 200 and p.json()["default_vehicle_type"] == "SUV"
    car = client.post(f"{PREFIX}/trips/estimate", headers=h, json={"mode": "CAR", "distance_m": 1000}).json()
    assert car["vehicle_type"] == "SUV"
    client.post(f"{PREFIX}/trips", headers=h, json=trip_payload())
    exp = client.get(f"{PREFIX}/users/me/export", headers=h)
    assert exp.status_code == 200 and "attachment" in exp.headers["content-disposition"]
    assert len(exp.json()["trips"]) == 1 and exp.json()["trips"][0]["route"]["type"] == "LineString"
    assert client.request("DELETE", f"{PREFIX}/users/me", headers=h, json={"password": "mala-123"}).status_code == 422
    assert client.request("DELETE", f"{PREFIX}/users/me", headers=h, json={"password": PASSWORD}).status_code == 204
    assert client.get(f"{PREFIX}/users/me", headers=h).status_code == 401


def test_citizen_reports_and_admin(client, user):
    h = auth_header(user)
    body = {"category": "SAFETY", "title": "Bache peligroso", "description": "En la ciclovía",
            "location": {"type": "Point", "coordinates": [-100.39, 20.59]}}
    rep = client.post(f"{PREFIX}/citizen-reports", headers=h, json=body)
    assert rep.status_code == 201 and rep.json()["status"] == "OPEN"
    assert client.get(f"{PREFIX}/citizen-reports/mine", headers=h).json()["total"] == 1
    admin = auth_header(make_user(client, "ADMIN"))
    lst = client.get(f"{PREFIX}/admin/citizen-reports", headers=admin).json()
    assert lst["total"] == 1 and "email" not in lst["items"][0]
    r = client.patch(f"{PREFIX}/admin/citizen-reports/{rep.json()['id']}", headers=admin,
                     json={"status": "RESOLVED", "resolution_note": "Reparado"})
    assert r.status_code == 200 and r.json()["status"] == "RESOLVED"
    assert client.get(f"{PREFIX}/admin/citizen-reports", headers=h).status_code == 403


def test_admin_trips_reports_and_modes(client, user):
    h = auth_header(user)
    trip = client.post(f"{PREFIX}/trips", headers=h, json=trip_payload()).json()
    admin = auth_header(make_user(client, "ADMIN"))
    page = client.get(f"{PREFIX}/admin/trips", headers=admin).json()
    assert page["total"] == 1 and "route" not in page["items"][0] and page["items"][0]["user_id"] == user["user"]["id"]
    rep = client.post(f"{PREFIX}/admin/reports", headers=admin, json={"report_type": "trips", "format": "csv"})
    assert rep.status_code == 201 and rep.json()["row_count"] == 1
    dl = client.get(f"{PREFIX}/admin/reports/{rep.json()['id']}/download", headers=admin)
    assert dl.status_code == 200 and dl.headers["content-type"].startswith("text/csv") and "LineString" not in dl.text
    pdf = client.post(f"{PREFIX}/admin/reports", headers=admin, json={"report_type": "users", "format": "pdf"}).json()
    assert client.get(f"{PREFIX}/admin/reports/{pdf['id']}/download", headers=admin).content.startswith(b"%PDF")
    assert client.post(f"{PREFIX}/admin/reports", headers=admin,
                       json={"report_type": "audit_logs"}).status_code == 403
    r = client.request("DELETE", f"{PREFIX}/admin/trips/{trip['id']}", headers=admin, json={"reason": "Prueba de borrado"})
    assert r.status_code == 204
    sa = auth_header(make_user(client, "SUPER_ADMIN"))
    m = client.patch(f"{PREFIX}/admin/transport-modes/E_SCOOTER", headers=sa, json={"is_active": False})
    assert m.status_code == 200 and m.json()["is_active"] is False
    r = client.post(f"{PREFIX}/trips/estimate", headers=h, json={"mode": "E_SCOOTER", "distance_m": 1000})
    assert r.json()["error"]["code"] == "MODE_INACTIVE"
    assert client.request("DELETE", f"{PREFIX}/admin/users/{user['user']['id']}", headers=admin,
                          json={"reason": "No autorizado"}).status_code == 403
    assert client.request("DELETE", f"{PREFIX}/admin/users/{user['user']['id']}", headers=sa,
                          json={"reason": "Solicitud del titular"}).status_code == 204
