"""Cabeceras, CORS, manejo de errores, límites y registro sin datos sensibles."""

import json
import logging

from app.core.logging import JsonFormatter, redact
from tests.conftest import PASSWORD, PREFIX, auth_header, register


def test_security_headers(client):
    r = client.get(f"{PREFIX}/health")
    assert r.status_code == 200 and r.json() == {"status": "ok", "database": "ok"}
    h = r.headers
    assert h["X-Content-Type-Options"] == "nosniff"
    assert h["X-Frame-Options"] == "DENY"
    assert h["Referrer-Policy"] == "no-referrer"
    assert "default-src 'none'" in h["Content-Security-Policy"]
    assert h["Cache-Control"] == "no-store"
    assert len(h["X-Request-ID"]) >= 8
    assert "server" not in {k.lower() for k in h}


def test_cors_allows_only_whitelisted_origins(client):
    ok = client.options(f"{PREFIX}/auth/login", headers={
        "Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    bad = client.options(f"{PREFIX}/auth/login", headers={
        "Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in bad.headers
    assert bad.headers.get("access-control-allow-origin") != "*"


def test_unknown_route_and_method_use_contract_format(client):
    r = client.get(f"{PREFIX}/no-existe")
    assert r.status_code == 404 and r.json() == {"error": {"code": "NOT_FOUND", "message": "Recurso no encontrado",
                                                           "details": None}}
    r = client.put(f"{PREFIX}/health")
    assert r.status_code == 405 and r.json()["error"]["code"] == "METHOD_NOT_ALLOWED"


def test_internal_errors_hide_details(client, monkeypatch):
    from app.services import stats

    def boom(*a, **k):
        raise RuntimeError("detalle interno secreto /etc/passwd")

    monkeypatch.setattr(stats, "city_summary", boom)
    r = client.get(f"{PREFIX}/stats/city")
    assert r.status_code == 500
    assert r.json() == {"error": {"code": "INTERNAL_ERROR", "message": "Error interno", "details": None}}
    assert "secreto" not in r.text and "Traceback" not in r.text


def test_body_size_limit(client):
    big = "x" * (1_048_576 + 10)
    r = client.post(f"{PREFIX}/auth/login", content=big, headers={"Content-Type": "application/json"})
    assert r.status_code == 413 and r.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_sql_injection_attempts_are_inert(client):
    user = register(client)
    h = auth_header(user)
    r = client.post(f"{PREFIX}/auth/login", json={"email": "a@example.com' OR '1'='1", "password": "x"})
    assert r.status_code == 422
    r = client.get(f"{PREFIX}/trips", headers=h, params={"mode": "BICYCLE' OR 1=1--"})
    assert r.status_code == 422
    r = client.get(f"{PREFIX}/map/pois", params={"bbox": "-100.4,20.5,-100.3,20.6); DROP TABLE users;--"})
    assert r.status_code == 400
    assert client.get(f"{PREFIX}/users/me", headers=h).status_code == 200


def test_global_rate_limit_returns_contract_error(client, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "rate_limit_default_per_minute", 3)
    user = register(client)
    h = auth_header(user)
    codes = [client.get(f"{PREFIX}/users/me", headers=h).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]
    r = client.get(f"{PREFIX}/users/me", headers=h)
    assert r.json()["error"]["code"] == "RATE_LIMITED" and "Retry-After" in r.headers


def test_logs_redact_secrets():
    rec = logging.LogRecord("t", logging.INFO, __file__, 1, "Bearer eyJabc.def.ghi token", None, None)
    rec.password = PASSWORD
    rec.payload = {"refresh_token": "abc", "route": [[1, 2]], "ok": 1}
    out = json.loads(JsonFormatter().format(rec))
    assert PASSWORD not in json.dumps(out) and "eyJabc" not in out["msg"]
    assert out["payload"] == {"refresh_token": "[REDACTED]", "route": "[REDACTED]", "ok": 1}
    assert redact({"Authorization": "Bearer x"}) == {"Authorization": "[REDACTED]"}


def test_audit_payload_never_contains_secrets(client, db):
    from sqlalchemy import text

    from tests.conftest import make_user

    sa = make_user(client, "SUPER_ADMIN")
    target = register(client)
    client.patch(f"{PREFIX}/admin/users/{target['user']['id']}/role", headers=auth_header(sa), json={"role": "ADMIN"})
    payloads = db.execute(text("SELECT payload::text FROM audit_logs")).scalars().all()
    assert payloads and all(PASSWORD not in p and "eyJ" not in p for p in payloads)


def test_openapi_documents_all_contract_routes(client):
    spec = client.get(f"{PREFIX}/openapi.json").json()
    paths = set(spec["paths"])
    expected = {
        "/health", "/auth/register", "/auth/login", "/auth/refresh", "/auth/logout", "/users/me",
        "/users/me/password", "/trips/estimate", "/trips", "/trips/{trip_id}", "/map/pois", "/map/pois/{poi_id}",
        "/map/cycleways", "/stats/me", "/stats/me/timeseries", "/stats/city", "/admin/users",
        "/admin/users/{user_id}", "/admin/users/{user_id}/status", "/admin/users/{user_id}/role",
        "/admin/stats/overview", "/admin/map/pois", "/admin/map/pois/{poi_id}", "/admin/emission-factors",
        "/admin/emission-factors/{mode}", "/admin/audit-logs",
    }
    assert {p.removeprefix(PREFIX) for p in paths} == expected
