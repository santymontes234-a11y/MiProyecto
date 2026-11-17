"""Pruebas de caja negra de la API contra docs/API_CONTRACT.md (v1.0.0) y docs/SECURITY.md.

Propiedad: agente QA/seguridad. No importan código de `apps/api`: hablan HTTP con una instancia
en ejecución, así que validan el sistema desplegado (Docker Compose) y no la implementación.

Variables de entorno:
  E2E_API_BASE_URL         URL base (def. http://localhost:8000/api/v1)
  E2E_SUPERADMIN_EMAIL     Credenciales de PRUEBA del SUPER_ADMIN de arranque
  E2E_SUPERADMIN_PASSWORD  (las mismas que BOOTSTRAP_SUPER_ADMIN_* del .env de desarrollo)
  E2E_RUN_RATE_LIMIT=1     Activa las pruebas que agotan el rate limit (bloquean la IP ~1 min)
  E2E_REQUIRE_API=1        Falla (en vez de omitir) si la API no responde — usar en CI
  E2E_STRICT_CONTRACT=1    Falla (en vez de omitir) si una ruta del contrato no está implementada
  E2E_MAILPIT_URL          API HTTP de un buzón Mailpit que recibe el SMTP de la API (reset/verificación)

Nunca usar datos reales: todos los usuarios se generan como qa-<aleatorio>@example.com.
"""

from __future__ import annotations

import itertools
import os
import re
import time
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest

BASE_URL = os.environ.get("E2E_API_BASE_URL", "http://localhost:8000/api/v1").rstrip("/")
# Contraseña de prueba que cumple la política (≥8, letra y número). No es un secreto real.
TEST_PASSWORD = "QaPrueba-2026-segura"  # noqa: S105
MAX_RATE_LIMIT_WAIT_S = 70


def unique_email() -> str:
    return f"qa-{uuid.uuid4().hex[:16]}@example.com"


# ---------------------------------------------------------------------------
# Cliente HTTP
# ---------------------------------------------------------------------------


class Api:
    """Envoltorio de httpx que espera y reintenta ante 429 (respeta el rate limit, no lo evade)."""

    def __init__(self, client: httpx.Client) -> None:
        self.raw = client

    def request(self, method: str, path: str, *, token: str | None = None, retry_429: bool = True,
                **kwargs: Any) -> httpx.Response:
        headers = dict(kwargs.pop("headers", {}) or {})
        if token:
            headers["Authorization"] = f"Bearer {token}"
        deadline = time.monotonic() + MAX_RATE_LIMIT_WAIT_S * 3
        while True:
            resp = self.raw.request(method, path, headers=headers, **kwargs)
            if resp.status_code != 429 or not retry_429 or time.monotonic() > deadline:
                return resp
            wait = min(int(resp.headers.get("Retry-After", "5") or 5), MAX_RATE_LIMIT_WAIT_S)
            time.sleep(max(wait, 1))

    def get(self, path: str, **kw: Any) -> httpx.Response:
        return self.request("GET", path, **kw)

    def post(self, path: str, **kw: Any) -> httpx.Response:
        return self.request("POST", path, **kw)

    def patch(self, path: str, **kw: Any) -> httpx.Response:
        return self.request("PATCH", path, **kw)

    def put(self, path: str, **kw: Any) -> httpx.Response:
        return self.request("PUT", path, **kw)

    def delete(self, path: str, **kw: Any) -> httpx.Response:
        return self.request("DELETE", path, **kw)


@pytest.fixture(scope="session")
def api() -> Iterator[Api]:
    with httpx.Client(base_url=BASE_URL, timeout=20.0) as client:
        try:
            health = client.get("/health")
        except httpx.HTTPError as exc:
            msg = f"API no disponible en {BASE_URL}: {exc!r}"
            if os.environ.get("E2E_REQUIRE_API") == "1":  # en CI: no ocultar el fallo como skip
                pytest.fail(msg)
            pytest.skip(msg)
        if health.status_code != 200:
            pytest.fail(f"/health respondió {health.status_code}: {health.text[:300]}")
        yield Api(client)


@pytest.fixture(scope="session")
def implemented_routes(api: Api) -> set[tuple[str, str]]:
    spec = api.raw.get("/openapi.json")
    if spec.status_code != 200:
        return set()
    prefix = "/api/v1"
    return {(m.upper(), path.removeprefix(prefix)) for path, ops in spec.json()["paths"].items() for m in ops}


@pytest.fixture(scope="session")
def require_route(implemented_routes: set[tuple[str, str]]) -> Callable[[str, str], None]:
    """Omite (o falla con E2E_STRICT_CONTRACT=1) si la ruta del contrato aún no existe en la API."""

    def _req(method: str, path: str) -> None:
        if (method.upper(), path) in implemented_routes:
            return
        msg = f"{method} {path} (contrato 1.1.0) no está implementada en la API"
        if os.environ.get("E2E_STRICT_CONTRACT") == "1":
            pytest.fail(msg)
        pytest.skip(msg)

    return _req


# ---------------------------------------------------------------------------
# Buzón de correo (Mailpit) para enlaces de reset y verificación
# ---------------------------------------------------------------------------

TOKEN_RE = re.compile(r"token=([A-Za-z0-9_\-\.~%]+)")


class Mailbox:
    def __init__(self, base: str) -> None:
        self.http = httpx.Client(base_url=base.rstrip("/"), timeout=10.0)

    def tokens_for(self, email: str, *, wait_s: float = 10.0, at_least: int = 1) -> list[str]:
        """Tokens de los enlaces enviados a `email`, del más reciente al más antiguo."""
        deadline = time.monotonic() + wait_s
        while True:
            found: list[str] = []
            res = self.http.get("/api/v1/search", params={"query": f"to:{email}"})
            res.raise_for_status()
            for msg in res.json().get("messages", []):
                body = self.http.get(f"/api/v1/message/{msg['ID']}").json()
                text = (body.get("Text") or "") + (body.get("HTML") or "")
                found.extend(m for m in TOKEN_RE.findall(text) if m not in found)
            if len(found) >= at_least or time.monotonic() > deadline:
                return found
            time.sleep(0.5)

    def count_for(self, email: str) -> int:
        res = self.http.get("/api/v1/search", params={"query": f"to:{email}"})
        res.raise_for_status()
        return int(res.json().get("messages_count", 0))


@pytest.fixture(scope="session")
def mailbox() -> Mailbox:
    url = os.environ.get("E2E_MAILPIT_URL")
    if not url:
        pytest.skip("Define E2E_MAILPIT_URL (tests/e2e/run-local.sh levanta Mailpit)")
    return Mailbox(url)


# ---------------------------------------------------------------------------
# Usuarios de prueba
# ---------------------------------------------------------------------------


@dataclass
class Account:
    email: str
    password: str
    access_token: str
    refresh_token: str
    user: dict[str, Any] = field(default_factory=dict)

    @property
    def id(self) -> str:
        return str(self.user["id"])


def _account_from_pair(email: str, password: str, pair: dict[str, Any]) -> Account:
    return Account(email, password, pair["access_token"], pair["refresh_token"], pair["user"])


def login(api: Api, email: str, password: str) -> Account:
    resp = api.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"login falló: {resp.status_code} {resp.text[:300]}"
    return _account_from_pair(email, password, resp.json())


@pytest.fixture(scope="session")
def make_user(api: Api) -> Callable[..., Account]:
    def _make(full_name: str = "Usuario QA") -> Account:
        email = unique_email()
        resp = api.post("/auth/register",
                        json={"email": email, "password": TEST_PASSWORD, "full_name": full_name})
        assert resp.status_code == 201, f"registro falló: {resp.status_code} {resp.text[:300]}"
        return _account_from_pair(email, TEST_PASSWORD, resp.json())

    return _make


@pytest.fixture(scope="session")
def super_admin(api: Api) -> Account:
    email = os.environ.get("E2E_SUPERADMIN_EMAIL")
    password = os.environ.get("E2E_SUPERADMIN_PASSWORD")
    if not email or not password:
        pytest.skip("Define E2E_SUPERADMIN_EMAIL/E2E_SUPERADMIN_PASSWORD (credenciales de prueba)")
    acc = login(api, email, password)
    assert acc.user["role"] == "SUPER_ADMIN", "la cuenta de arranque no es SUPER_ADMIN"
    return acc


def set_role(api: Api, actor: Account, target_id: str, role: str) -> httpx.Response:
    return api.patch(f"/admin/users/{target_id}/role", token=actor.access_token, json={"role": role})


@pytest.fixture(scope="session")
def make_admin(api: Api, make_user: Callable[..., Account], super_admin: Account) -> Callable[[], Account]:
    def _make() -> Account:
        acc = make_user("Admin QA")
        resp = set_role(api, super_admin, acc.id, "ADMIN")
        assert resp.status_code == 200, f"promoción a ADMIN falló: {resp.text[:300]}"
        return login(api, acc.email, acc.password)

    return _make


@pytest.fixture(scope="session")
def user_a(make_user: Callable[..., Account]) -> Account:
    return make_user("Usuaria A")


@pytest.fixture(scope="session")
def user_b(make_user: Callable[..., Account]) -> Account:
    return make_user("Usuario B")


# ---------------------------------------------------------------------------
# Datos geográficos de prueba (Querétaro centro, [lng, lat])
# ---------------------------------------------------------------------------

QRO_ROUTE = [[-100.3899, 20.5888], [-100.3870, 20.5902], [-100.3842, 20.5921], [-100.3815, 20.5937]]
QRO_BBOX = "-100.45,20.55,-100.35,20.65"


_TRIP_SLOT = itertools.count(1)


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


def trip_payload(**overrides: Any) -> dict[str, Any]:
    """Cada llamada usa una franja de 1 h distinta (hacia el pasado) para no solaparse entre tests."""
    start = datetime.now(UTC).replace(minute=0, second=0, microsecond=0) - timedelta(hours=next(_TRIP_SLOT) + 1)
    data: dict[str, Any] = {
        "client_trip_id": str(uuid.uuid4()),
        "mode": "BICYCLE",
        "started_at": iso(start),
        "ended_at": iso(start + timedelta(minutes=20)),
        "route": {"type": "LineString", "coordinates": QRO_ROUTE},
    }
    data.update(overrides)
    return data


# ---------------------------------------------------------------------------
# Aserciones
# ---------------------------------------------------------------------------


def assert_error(resp: httpx.Response, status: int | tuple[int, ...], code: str | None = None) -> dict:
    """Valida código HTTP y el formato de error del contrato §0."""
    statuses = (status,) if isinstance(status, int) else status
    assert resp.status_code in statuses, f"esperado {statuses}, recibido {resp.status_code}: {resp.text[:400]}"
    body = resp.json()
    assert isinstance(body, dict) and "error" in body, f"formato de error fuera de contrato: {body}"
    err = body["error"]
    assert {"code", "message"} <= set(err), f"error sin code/message: {err}"
    assert err["code"] == err["code"].upper(), f"code debe ir en UPPER_SNAKE_CASE: {err['code']}"
    if code is not None:
        assert err["code"] == code, f"code esperado {code}, recibido {err['code']}"
    return err


def assert_no_leak(resp: httpx.Response) -> None:
    """Ninguna respuesta debe exponer trazas, SQL ni secretos."""
    text = resp.text.lower()
    for needle in ("traceback", "sqlalchemy", "psycopg", "select ", "password_hash", "jwt_secret"):
        assert needle not in text, f"la respuesta filtra '{needle}': {resp.text[:400]}"
