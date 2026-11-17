"""Endurecimiento transversal: cabeceras, CORS, formato de error, rate limiting (SECURITY.md §3)."""

from __future__ import annotations

import os
import uuid

import pytest
from conftest import Api, assert_error, assert_no_leak, unique_email


def test_health_contract(api: Api) -> None:
    resp = api.get("/health")
    assert resp.json() == {"status": "ok", "database": "ok"}


def test_security_headers(api: Api) -> None:
    resp = api.get("/health")
    h = resp.headers
    assert h.get("x-content-type-options") == "nosniff"
    assert "server" not in h or "uvicorn" not in h["server"].lower(), "cabecera Server revela tecnología"
    assert "x-powered-by" not in h


def test_unknown_route_uses_error_format(api: Api) -> None:
    assert_error(api.get(f"/no-existe-{uuid.uuid4().hex}"), 404)


def test_method_not_allowed_uses_error_format(api: Api) -> None:
    resp = api.request("DELETE", "/health")
    assert resp.status_code == 405
    assert "error" in resp.json()


def test_malformed_json_is_422_not_500(api: Api) -> None:
    resp = api.post("/auth/login", content=b"{no es json", headers={"Content-Type": "application/json"})
    assert_error(resp, (400, 422))
    assert_no_leak(resp)


def test_validation_error_does_not_echo_password(api: Api) -> None:
    secret = "NoDebeAparecer-99"
    resp = api.post("/auth/register", json={"email": "malo", "password": secret, "full_name": "x"})
    assert resp.status_code == 422
    assert secret not in resp.text, "VALIDATION_ERROR refleja la contraseña en details (input)"


# ------------------------------------ CORS ------------------------------------


def test_cors_rejects_unknown_origin(api: Api) -> None:
    resp = api.raw.options("/auth/login", headers={
        "Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    acao = resp.headers.get("access-control-allow-origin")
    assert acao not in ("*", "https://evil.example"), f"CORS permite origen arbitrario: {acao}"


def test_cors_allows_configured_origin_without_wildcard(api: Api) -> None:
    origin = os.environ.get("E2E_ALLOWED_ORIGIN", "http://localhost:3000")
    resp = api.raw.options("/auth/login", headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
    acao = resp.headers.get("access-control-allow-origin")
    if acao is None:
        pytest.skip(f"{origin} no está en CORS_ORIGINS de esta instancia")
    assert acao == origin and acao != "*"


# ------------------------------- Rate limiting --------------------------------


@pytest.mark.skipif(os.environ.get("E2E_RUN_RATE_LIMIT") != "1",
                    reason="Agota el límite de /auth/* para esta IP; activar con E2E_RUN_RATE_LIMIT=1")
def test_auth_rate_limit(api: Api) -> None:
    """SECURITY.md §3: /auth/* 10 req/min/IP → 429 RATE_LIMITED con Retry-After."""
    email = unique_email()
    statuses = []
    for _ in range(15):
        r = api.post("/auth/login", json={"email": email, "password": "Incorrecta-123"}, retry_429=False)
        statuses.append(r.status_code)
        if r.status_code == 429:
            assert_error(r, 429, "RATE_LIMITED")
            assert int(r.headers.get("Retry-After", "0")) > 0
            break
    assert 429 in statuses, f"sin rate limit tras 15 intentos: {statuses}"


@pytest.mark.skipif(os.environ.get("E2E_RUN_RATE_LIMIT") != "1", reason="ver test_auth_rate_limit")
def test_rate_limit_ignores_spoofed_forwarded_for(api: Api) -> None:
    """X-Forwarded-For no debe permitir evadir el límite (solo se confía en proxies conocidos)."""
    email = unique_email()
    statuses = []
    for i in range(15):
        r = api.post("/auth/login", json={"email": email, "password": "Incorrecta-123"},
                     headers={"X-Forwarded-For": f"203.0.113.{i}"}, retry_429=False)
        statuses.append(r.status_code)
    assert 429 in statuses, "X-Forwarded-For falsificado evade el rate limit"
