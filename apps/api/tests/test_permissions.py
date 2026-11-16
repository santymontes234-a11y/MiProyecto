"""RBAC: los permisos se verifican en el backend y se leen de la BD en cada petición."""

import uuid

import pytest

from tests.conftest import PREFIX, auth_header, make_user, register, set_role, trip_payload

ADMIN_ENDPOINTS = [
    ("get", "/admin/users", None),
    ("get", f"/admin/users/{uuid.uuid4()}", None),
    ("patch", f"/admin/users/{uuid.uuid4()}/status", {"is_active": False}),
    ("get", "/admin/stats/overview", None),
    ("post", "/admin/map/pois", {"name": "X", "category": "BUS_STOP",
                                 "location": {"type": "Point", "coordinates": [-100.39, 20.59]}}),
    ("patch", f"/admin/map/pois/{uuid.uuid4()}", {"name": "Y"}),
    ("delete", f"/admin/map/pois/{uuid.uuid4()}", None),
    ("get", "/admin/emission-factors", None),
]
SUPER_ENDPOINTS = [
    ("patch", f"/admin/users/{uuid.uuid4()}/role", {"role": "ADMIN"}),
    ("put", "/admin/emission-factors/CAR", {"grams_per_km": 1}),
    ("get", "/admin/audit-logs", None),
]


def _call(client, method, path, body, headers):
    kwargs = {"headers": headers}
    if body is not None:
        kwargs["json"] = body
    return getattr(client, method)(f"{PREFIX}{path}", **kwargs)


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ENDPOINTS + SUPER_ENDPOINTS)
def test_user_cannot_access_admin(client, method, path, body):
    user = make_user(client)
    r = _call(client, method, path, body, auth_header(user))
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"
    assert _call(client, method, path, body, {}).status_code == 401


@pytest.mark.parametrize(("method", "path", "body"), SUPER_ENDPOINTS)
def test_admin_cannot_access_super_admin_endpoints(client, method, path, body):
    admin = make_user(client, "ADMIN")
    assert _call(client, method, path, body, auth_header(admin)).status_code == 403


def test_forged_role_claim_is_ignored(client):
    """El claim `role` del token no autoriza: se usa el rol de la BD."""
    import jwt

    from app.core.config import get_settings

    user = make_user(client)
    s = get_settings()
    claims = jwt.decode(user["access_token"], s.jwt_secret_key.get_secret_value(), algorithms=["HS256"])
    claims["role"] = "SUPER_ADMIN"
    # Incluso si alguien obtuviera la clave, el rol sigue saliendo de la BD.
    token = jwt.encode(claims, s.jwt_secret_key.get_secret_value(), algorithm="HS256")
    assert client.get(f"{PREFIX}/admin/users", headers={"Authorization": f"Bearer {token}"}).status_code == 403


def test_demotion_takes_effect_immediately(client):
    admin = make_user(client, "ADMIN")
    h = auth_header(admin)
    assert client.get(f"{PREFIX}/admin/users", headers=h).status_code == 200
    set_role(admin["user"]["id"], "USER")
    assert client.get(f"{PREFIX}/admin/users", headers=h).status_code == 403


def test_admin_manages_users_status_rules(client):
    admin = make_user(client, "ADMIN")
    other_admin = make_user(client, "ADMIN")
    target = register(client)
    h = auth_header(admin)

    r = client.patch(f"{PREFIX}/admin/users/{target['user']['id']}/status", headers=h, json={"is_active": False})
    assert r.status_code == 200 and r.json()["is_active"] is False
    # El usuario desactivado pierde acceso y sus refresh tokens se revocan.
    assert client.get(f"{PREFIX}/users/me", headers=auth_header(target)).status_code == 403
    assert client.post(f"{PREFIX}/auth/refresh", json={"refresh_token": target["refresh_token"]}).status_code in (401, 403)

    # Un ADMIN no puede desactivar a otro ADMIN ni a sí mismo.
    assert client.patch(f"{PREFIX}/admin/users/{other_admin['user']['id']}/status", headers=h,
                        json={"is_active": False}).status_code == 403
    assert client.patch(f"{PREFIX}/admin/users/{admin['user']['id']}/status", headers=h,
                        json={"is_active": False}).status_code == 403
    assert client.patch(f"{PREFIX}/admin/users/{uuid.uuid4()}/status", headers=h,
                        json={"is_active": False}).status_code == 404


def test_super_admin_role_rules(client):
    sa = make_user(client, "SUPER_ADMIN")
    target = register(client)
    h = auth_header(sa)

    r = client.patch(f"{PREFIX}/admin/users/{target['user']['id']}/role", headers=h, json={"role": "ADMIN"})
    assert r.status_code == 200 and r.json()["role"] == "ADMIN"
    # Nadie cambia su propio rol.
    assert client.patch(f"{PREFIX}/admin/users/{sa['user']['id']}/role", headers=h,
                        json={"role": "USER"}).status_code == 403
    # Debe quedar ≥ 1 SUPER_ADMIN activo.
    sa2 = make_user(client, "SUPER_ADMIN")
    assert client.patch(f"{PREFIX}/admin/users/{sa['user']['id']}/role", headers=auth_header(sa2),
                        json={"role": "ADMIN"}).status_code == 200
    assert client.patch(f"{PREFIX}/admin/users/{sa2['user']['id']}/status", headers=auth_header(sa2),
                        json={"is_active": False}).status_code == 403  # a sí mismo


def test_super_admin_can_manage_other_super_admins(client):
    sa = make_user(client, "SUPER_ADMIN")
    sa2 = make_user(client, "SUPER_ADMIN")
    r = client.patch(f"{PREFIX}/admin/users/{sa2['user']['id']}/status", headers=auth_header(sa),
                     json={"is_active": False})
    assert r.status_code == 200 and r.json()["is_active"] is False
    r = client.patch(f"{PREFIX}/admin/users/{sa2['user']['id']}/role", headers=auth_header(sa), json={"role": "USER"})
    assert r.status_code == 200 and r.json()["role"] == "USER"


def test_last_active_super_admin_guard(client, db):
    """Por la API la regla se cumple porque nadie actúa sobre sí mismo; el servicio la protege igualmente (409)."""
    from app.core.errors import AppError
    from app.models import Role, User
    from app.services import admin as admin_service

    lone = make_user(client, "SUPER_ADMIN")
    actor = User(id=uuid.uuid4(), email="sistema@example.com", password_hash="x", full_name="Sistema",
                 role=Role.SUPER_ADMIN, is_active=False)
    db.add(actor)
    db.commit()
    for call in (lambda: admin_service.set_role(db, actor, uuid.UUID(lone["user"]["id"]), Role.ADMIN),
                 lambda: admin_service.set_status(db, actor, uuid.UUID(lone["user"]["id"]), False)):
        with pytest.raises(AppError) as exc:
            call()
        assert exc.value.status_code == 409
        db.rollback()


def test_admin_overview_and_lists(client):
    admin = make_user(client, "ADMIN")
    user = register(client)
    client.post(f"{PREFIX}/trips", headers=auth_header(user), json=trip_payload())
    h = auth_header(admin)
    ov = client.get(f"{PREFIX}/admin/stats/overview", headers=h).json()
    assert ov["users_total"] == 2 and ov["trips_total"] == 1 and ov["users_active_30d"] == 1
    r = client.get(f"{PREFIX}/admin/users", headers=h, params={"q": "%", "page_size": 5})
    assert r.status_code == 200 and r.json()["total"] == 0  # el comodín se escapa
    r = client.get(f"{PREFIX}/admin/users", headers=h, params={"role": "ADMIN"})
    assert r.json()["total"] == 1
    # Los admins nunca ven trazas individuales: no hay endpoint admin de viajes en 1.0.0.
    assert client.get(f"{PREFIX}/trips", headers=h).json()["total"] == 0


def test_emission_factor_update_is_audited_and_keeps_history(client):
    sa = make_user(client, "SUPER_ADMIN")
    user = register(client)
    old = client.post(f"{PREFIX}/trips", headers=auth_header(user), json=trip_payload(mode="BUS")).json()
    r = client.put(f"{PREFIX}/admin/emission-factors/BUS", headers=auth_header(sa), json={"grams_per_km": 80})
    assert r.status_code == 200 and r.json()["grams_per_km"] == 80 and r.json()["updated_by"] == sa["user"]["id"]
    # El viaje anterior conserva el factor con el que se calculó.
    assert client.get(f"{PREFIX}/trips/{old['id']}", headers=auth_header(user)).json()["emission_factor_g_per_km"] == 68
    new = client.post(f"{PREFIX}/trips", headers=auth_header(user), json=trip_payload(mode="BUS")).json()
    assert new["emission_factor_g_per_km"] == 80

    logs = client.get(f"{PREFIX}/admin/audit-logs", headers=auth_header(sa),
                      params={"action": "EMISSION_FACTOR_UPDATED"}).json()
    assert logs["total"] == 1 and logs["items"][0]["actor_id"] == sa["user"]["id"]
    assert client.put(f"{PREFIX}/admin/emission-factors/BUS", headers=auth_header(sa),
                      json={"grams_per_km": -1}).status_code == 422


def test_admin_mutations_write_audit_logs(client):
    sa = make_user(client, "SUPER_ADMIN")
    target = register(client)
    h = auth_header(sa)
    client.patch(f"{PREFIX}/admin/users/{target['user']['id']}/role", headers=h, json={"role": "ADMIN"})
    client.patch(f"{PREFIX}/admin/users/{target['user']['id']}/status", headers=h, json={"is_active": False})
    poi = client.post(f"{PREFIX}/admin/map/pois", headers=h, json={
        "name": "Ciclopuerto", "category": "BIKE_PARKING",
        "location": {"type": "Point", "coordinates": [-100.39, 20.59]}}).json()
    client.patch(f"{PREFIX}/admin/map/pois/{poi['id']}", headers=h, json={"name": "Ciclopuerto Centro"})
    client.delete(f"{PREFIX}/admin/map/pois/{poi['id']}", headers=h)
    actions = {i["action"] for i in client.get(f"{PREFIX}/admin/audit-logs", headers=h,
                                               params={"page_size": 100}).json()["items"]}
    assert {"USER_ROLE_CHANGED", "USER_DEACTIVATED", "POI_CREATED", "POI_UPDATED", "POI_DELETED"} <= actions
