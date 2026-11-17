"""Autorización RBAC y reglas de /admin (API_CONTRACT.md §7, SECURITY.md §2)."""

from __future__ import annotations

import uuid

import pytest
from conftest import Account, Api, assert_error, login, set_role

ADMIN_READ_ENDPOINTS = [
    ("GET", "/admin/users"),
    ("GET", "/admin/stats/overview"),
    ("GET", "/admin/emission-factors"),
]
SUPER_ONLY = [
    ("PUT", "/admin/emission-factors/CAR", {"grams_per_km": 1.0}),
    ("GET", "/admin/audit-logs", None),
]


# ------------------------------- USER → /admin -------------------------------


@pytest.mark.parametrize(("method", "path"), ADMIN_READ_ENDPOINTS)
def test_user_cannot_read_admin(api: Api, user_a: Account, method: str, path: str) -> None:
    assert_error(api.request(method, path, token=user_a.access_token), 403, "FORBIDDEN")


@pytest.mark.parametrize(("method", "path"), ADMIN_READ_ENDPOINTS)
def test_anonymous_cannot_read_admin(api: Api, method: str, path: str) -> None:
    assert_error(api.request(method, path), 401)


def test_user_cannot_mutate_admin(api: Api, user_a: Account, user_b: Account) -> None:
    t = user_a.access_token
    cases = [
        api.patch(f"/admin/users/{user_b.id}/status", token=t, json={"is_active": False}),
        api.patch(f"/admin/users/{user_a.id}/role", token=t, json={"role": "SUPER_ADMIN"}),
        api.post("/admin/map/pois", token=t, json={
            "name": "x", "category": "BUS_STOP", "description": None,
            "location": {"type": "Point", "coordinates": [-100.39, 20.59]}, "attributes": {}}),
        api.put("/admin/emission-factors/CAR", token=t, json={"grams_per_km": 0}),
    ]
    for resp in cases:
        assert_error(resp, 403, "FORBIDDEN")
    me = api.get("/users/me", token=t).json()
    assert me["role"] == "USER"


def test_user_cannot_escalate_via_profile(api: Api, make_user) -> None:
    acc: Account = make_user("Escalada")
    resp = api.patch("/users/me", token=acc.access_token,
                     json={"full_name": "Hacker", "role": "SUPER_ADMIN", "is_active": True})
    assert resp.status_code == 422, f"PATCH /users/me debe rechazar campos extra: {resp.text}"
    me = api.get("/users/me", token=acc.access_token).json()
    assert me["role"] == "USER"


def test_user_cannot_change_own_email_via_profile(api: Api, make_user) -> None:
    acc: Account = make_user("Email")
    resp = api.patch("/users/me", token=acc.access_token, json={"email": "otro@example.com"})
    assert resp.status_code == 422, resp.text


# ------------------------------ ADMIN → SUPER_ADMIN --------------------------


@pytest.fixture(scope="module")
def admin(make_admin) -> Account:
    return make_admin()


def test_admin_can_read_admin(api: Api, admin: Account) -> None:
    for method, path in ADMIN_READ_ENDPOINTS:
        resp = api.request(method, path, token=admin.access_token)
        assert resp.status_code == 200, f"{path}: {resp.text[:200]}"


@pytest.mark.parametrize(("method", "path", "body"), SUPER_ONLY)
def test_admin_cannot_do_super_admin_actions(api: Api, admin: Account, method: str, path: str,
                                             body: dict | None) -> None:
    resp = api.request(method, path, token=admin.access_token, json=body)
    assert_error(resp, 403, "FORBIDDEN")


def test_admin_cannot_change_roles(api: Api, admin: Account, make_user) -> None:
    target: Account = make_user("Objetivo rol")
    for role in ("ADMIN", "SUPER_ADMIN", "USER"):
        assert_error(set_role(api, admin, target.id, role), 403, "FORBIDDEN")
    assert_error(set_role(api, admin, admin.id, "SUPER_ADMIN"), 403, "FORBIDDEN")


def test_admin_cannot_deactivate_admin_or_super(api: Api, admin: Account, make_admin,
                                                super_admin: Account) -> None:
    other_admin: Account = make_admin()
    for target in (other_admin.id, super_admin.id):
        resp = api.patch(f"/admin/users/{target}/status", token=admin.access_token,
                         json={"is_active": False})
        assert_error(resp, 403, "FORBIDDEN")


def test_nobody_deactivates_self(api: Api, admin: Account, super_admin: Account) -> None:
    for actor in (admin, super_admin):
        resp = api.patch(f"/admin/users/{actor.id}/status", token=actor.access_token,
                         json={"is_active": False})
        assert_error(resp, 403, "FORBIDDEN")


def test_super_admin_cannot_change_own_role(api: Api, super_admin: Account) -> None:
    resp = set_role(api, super_admin, super_admin.id, "USER")
    assert_error(resp, (403, 409))
    assert api.get("/users/me", token=super_admin.access_token).json()["role"] == "SUPER_ADMIN"


def test_invalid_role_value(api: Api, super_admin: Account, make_user) -> None:
    target: Account = make_user("Rol inválido")
    assert_error(set_role(api, super_admin, target.id, "ROOT"), 422, "VALIDATION_ERROR")


def test_unknown_user_returns_404(api: Api, admin: Account) -> None:
    resp = api.get(f"/admin/users/{uuid.uuid4()}", token=admin.access_token)
    assert_error(resp, 404)
    assert_error(api.get("/admin/users/no-es-uuid", token=admin.access_token), 422)


# --------------------- Revalidación inmediata del rol/estado ------------------


def test_deactivation_revokes_access_immediately(api: Api, admin: Account, make_user) -> None:
    victim: Account = make_user("Desactivada")
    assert api.get("/users/me", token=victim.access_token).status_code == 200
    resp = api.patch(f"/admin/users/{victim.id}/status", token=admin.access_token,
                     json={"is_active": False})
    assert resp.status_code == 200 and resp.json()["is_active"] is False, resp.text

    # El access token aún no expiró, pero la cuenta ya no debe operar.
    assert api.get("/users/me", token=victim.access_token).status_code in (401, 403)
    assert_error(api.post("/auth/refresh", json={"refresh_token": victim.refresh_token}), (401, 403))
    assert_error(api.post("/auth/login", json={"email": victim.email, "password": victim.password}),
                 403, "USER_INACTIVE")


def test_demotion_removes_admin_rights_immediately(api: Api, super_admin: Account, make_admin) -> None:
    demoted: Account = make_admin()
    assert api.get("/admin/users", token=demoted.access_token).status_code == 200
    assert set_role(api, super_admin, demoted.id, "USER").status_code == 200
    # 403 (rol revisado en cada petición) o 401 (la API revoca las sesiones al cambiar el rol): ambos
    # quitan el acceso de inmediato; lo que nunca debe pasar es un 200.
    assert_error(api.get("/admin/users", token=demoted.access_token), (401, 403))


def test_role_change_is_audited(api: Api, super_admin: Account, make_user) -> None:
    target: Account = make_user("Auditada")
    assert set_role(api, super_admin, target.id, "ADMIN").status_code == 200
    logs = api.get("/admin/audit-logs", token=super_admin.access_token,
                   params={"action": "USER_ROLE_CHANGED", "page_size": 100})
    assert logs.status_code == 200, logs.text
    items = logs.json()["items"]
    assert any(i.get("entity_id") == target.id for i in items), "cambio de rol sin AuditLog"
    for item in items:
        blob = str(item.get("payload", {})).lower()
        assert "password" not in blob and "token" not in blob, "auditoría con secretos"
    set_role(api, super_admin, target.id, "USER")


def test_last_super_admin_cannot_be_removed(api: Api, super_admin: Account) -> None:
    """Debe existir siempre ≥ 1 SUPER_ADMIN activo. Con un único SA, degradarse/desactivarse falla."""
    users = api.get("/admin/users", token=super_admin.access_token,
                    params={"role": "SUPER_ADMIN", "is_active": True, "page_size": 100}).json()
    if users["total"] != 1:
        pytest.skip("Hay más de un SUPER_ADMIN activo; la regla se cubre en tests de backend")
    assert_error(set_role(api, super_admin, super_admin.id, "ADMIN"), (403, 409))
    me = login(api, super_admin.email, super_admin.password)
    assert me.user["role"] == "SUPER_ADMIN"


# ------------------------- Datos sensibles en /admin --------------------------


def test_admin_user_listing_has_no_secrets(api: Api, admin: Account) -> None:
    resp = api.get("/admin/users", token=admin.access_token, params={"page_size": 100})
    assert resp.status_code == 200
    text = resp.text.lower()
    assert "password" not in text and "hash" not in text and "refresh" not in text


def test_admin_search_injection(api: Api, admin: Account) -> None:
    for q in ("' OR 1=1 --", "%' UNION SELECT password_hash FROM users --", "\\", "%_%"):
        resp = api.get("/admin/users", token=admin.access_token, params={"q": q})
        assert resp.status_code == 200, f"q={q!r}: {resp.status_code}"
        assert "hash" not in resp.text.lower()
