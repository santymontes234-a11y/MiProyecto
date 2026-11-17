"""/routes: OSRM simulado, firma con app.core.route_token, errores del contrato §12."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import route_token
from app.core.deps import get_current_user
from app.core.errors import register_error_handlers
from app.routers import routes
from app.services.geo_analytics import routing

OK = {
    "code": "Ok",
    "routes": [
        {
            "distance": 1523.44,
            "duration": 362.6,
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [-100.3899991, 20.5888],
                    [-100.3899991, 20.5888],
                    [-100.385, 20.59],
                    [-100.3801234567, 20.5932],
                ],
            },
        }
    ],
}


@pytest.fixture
def api(monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[TestClient, list[str]]]:
    calls: list[str] = []
    replies: dict[str, Any] = {"next": OK}

    def fake_fetch(url: str) -> dict[str, Any]:
        calls.append(url)
        r = replies["next"]
        if isinstance(r, Exception):
            raise r
        return r

    monkeypatch.setattr(routing, "_fetch", fake_fetch)
    app = FastAPI()
    register_error_handlers(app)
    app.include_router(routes.router, prefix="/api/v1")
    app.dependency_overrides[get_current_user] = lambda: object()
    with TestClient(app, raise_server_exceptions=False) as c:
        c.replies = replies  # type: ignore[attr-defined]
        yield c, calls


Q = {"origin": "-100.39,20.5888", "destination": "-100.38,20.5932"}


def test_route_ok_signed_and_profile(api: Any) -> None:
    c, calls = api
    r = c.get("/api/v1/routes", params={**Q, "mode": "E_SCOOTER"})
    assert r.status_code == 200, r.text
    body = r.json()
    coords = body["route"]["coordinates"]
    assert coords[0] == [-100.389999, 20.5888] and len(coords) == 3  # redondeo y sin duplicados
    assert body["distance_m"] == 1523.4 and body["duration_s"] == 363 and body["provider"] == "osrm"
    assert route_token.verify(body["route_token"], coords, "E_SCOOTER")
    assert not route_token.verify(body["route_token"], coords, "CAR")
    assert "osrm-bicycle" in calls[0] and "/route/v1/bike/" in calls[0]


@pytest.mark.parametrize(
    ("reply", "status", "code"),
    [
        ({"code": "NoRoute"}, 404, "ROUTE_NOT_FOUND"),
        ({"code": "InvalidQuery"}, 503, "ROUTING_UNAVAILABLE"),
    ],
)
def test_route_errors(api: Any, reply: Any, status: int, code: str) -> None:
    c, _ = api
    c.replies["next"] = reply
    r = c.get("/api/v1/routes", params={**Q, "mode": "WALK"})
    assert r.status_code == status and r.json()["error"]["code"] == code


def test_routing_down_is_503(api: Any) -> None:
    c, _ = api
    c.replies["next"] = routing.AppError(503, "ROUTING_UNAVAILABLE", "x")
    r = c.get("/api/v1/routes", params={**Q, "mode": "CAR"})
    assert r.status_code == 503


def test_outside_service_area_and_bad_input(api: Any) -> None:
    c, calls = api
    r = c.get(
        "/api/v1/routes",
        params={"origin": "-99.13,19.43", "destination": "-100.38,20.59", "mode": "BUS"},
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "TRIP_OUTSIDE_SERVICE_AREA"
    r = c.get(
        "/api/v1/routes", params={"origin": "x", "destination": "-100.38,20.59", "mode": "BUS"}
    )
    assert r.status_code == 400
    r = c.get(
        "/api/v1/routes",
        params={"origin": "-100.38,20.59", "destination": "-100.38,20.59", "mode": "BUS"},
    )
    assert r.status_code == 400
    assert calls == []  # ninguna llamada a OSRM con entradas inválidas
