"""Contrato 1.2.0: tipo de vehículo y ocupantes (§4.3), catálogo de vehículos y /geocode (§12.1).

Mientras backend no publique las rutas, los casos se omiten (o fallan con E2E_STRICT_CONTRACT=1).
`GET /catalog/vehicle-types` se usa como indicador de que §4.3 está implementado.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

import pytest
from conftest import Account, Api, assert_error, trip_payload

VEHICLE_TYPES = {"COMPACT", "SEDAN", "SUV", "PICKUP", "MINIVAN", "HYBRID", "ELECTRIC"}
REPO = Path(__file__).resolve().parents[3]


@pytest.fixture
def v12(require_route) -> None:
    require_route("GET", "/catalog/vehicle-types")


# ------------------------------ §4.3 / catálogo ------------------------------


def test_vehicle_types_catalog_has_no_emission_factor(api: Api, v12: None) -> None:
    resp = api.get("/catalog/vehicle-types")
    assert resp.status_code == 200, resp.text
    items = resp.json()
    assert {i["code"] for i in items} <= VEHICLE_TYPES and items
    for item in items:
        assert {"code", "max_occupants", "is_active"} <= set(item)
        assert not any("factor" in k or "co2" in k for k in item), "ADR-002: sin factores en clientes"


def test_co2_with_occupants_is_split_between_them(api: Api, user_a: Account, v12: None) -> None:
    """CAR/CARPOOL: emitido = km·f(v)/ocupantes; ahorrado = km·f(v) − emitido."""
    alone = api.post("/trips", token=user_a.access_token,
                     json=trip_payload(mode="CAR", vehicle_type="SUV", occupants=1))
    assert alone.status_code == 201, alone.text
    resp = api.post("/trips", token=user_a.access_token,
                    json=trip_payload(mode="CARPOOL", vehicle_type="SUV", occupants=3))
    assert resp.status_code == 201, resp.text
    trip = resp.json()
    assert trip["vehicle_type"] == "SUV" and trip["occupants"] == 3
    km_f = alone.json()["co2_emitted_g"]  # misma traza, un ocupante → km·f(SUV)
    assert km_f > 0 and alone.json()["distance_m"] == pytest.approx(trip["distance_m"], rel=0.001)
    assert trip["co2_emitted_g"] == pytest.approx(km_f / 3, rel=0.01)
    assert trip["co2_saved_g"] == pytest.approx(km_f * 2 / 3, rel=0.01)


def test_car_alone_saves_nothing(api: Api, user_a: Account, v12: None) -> None:
    resp = api.post("/trips", token=user_a.access_token,
                    json=trip_payload(mode="CAR", vehicle_type="SEDAN", occupants=1))
    assert resp.status_code == 201, resp.text
    assert resp.json()["co2_saved_g"] == pytest.approx(0, abs=0.5)


@pytest.mark.parametrize("mode", ["BICYCLE", "WALK", "BUS"])
def test_vehicle_fields_rejected_for_non_car_modes(api: Api, user_a: Account, v12: None, mode: str) -> None:
    resp = api.post("/trips", token=user_a.access_token, json=trip_payload(mode=mode, vehicle_type="SUV"))
    assert_error(resp, 422, "VALIDATION_ERROR")


@pytest.mark.parametrize("extra", [{"mode": "CARPOOL", "occupants": 1}, {"mode": "CAR", "occupants": 9},
                                   {"mode": "CAR", "vehicle_type": "TANQUE"}],
                         ids=["carpool<2", "ocupantes>8", "tipo-inexistente"])
def test_occupants_and_vehicle_type_bounds(api: Api, user_a: Account, v12: None, extra: dict) -> None:
    resp = api.post("/trips", token=user_a.access_token, json=trip_payload(**extra))
    assert_error(resp, 422, "VALIDATION_ERROR")


# --------------------------------- §12.1 geocode ---------------------------------


def test_geocode_requires_auth_and_validates_query(api: Api, user_a: Account, require_route) -> None:
    require_route("GET", "/geocode")
    assert_error(api.get("/geocode", params={"q": "Alameda"}), 401)
    assert_error(api.get("/geocode", token=user_a.access_token, params={"q": "a"}), 422, "VALIDATION_ERROR")


@pytest.mark.skipif(os.environ.get("E2E_RUN_RATE_LIMIT") != "1",
                    reason="Agota el límite de /geocode del usuario; activar con E2E_RUN_RATE_LIMIT=1")
def test_geocode_rate_limit_30_per_minute(api: Api, make_user, require_route) -> None:
    require_route("GET", "/geocode")
    user = make_user()
    statuses = [api.get("/geocode", token=user.access_token, retry_429=False,
                        params={"q": "Alameda Hidalgo"}).status_code for _ in range(31)]
    assert 429 not in statuses[:30], statuses
    assert statuses[30] == 429, f"la petición 31 en un minuto debe dar 429: {statuses}"


def test_clients_never_call_nominatim_directly() -> None:
    """Prueba estática: ni la web ni la app Android contienen llamadas a Nominatim (solo vía /geocode)."""
    # Hosts/URL de Nominatim (los comentarios que lo mencionan no cuentan).
    pattern = re.compile(r"nominatim\.[a-z]|https?://[^\s'\"]*nominatim", re.IGNORECASE)
    hits = []
    for app in ("apps/web/src", "apps/mobile/src", "packages/shared/src"):
        for path in (REPO / app).rglob("*"):
            if path.suffix in {".ts", ".tsx", ".js", ".jsx", ".json"} and path.is_file():
                for n, line in enumerate(path.read_text(errors="ignore").splitlines(), 1):
                    if pattern.search(line) and not line.lstrip().startswith(("//", "*", "/*")):
                        hits.append(f"{path.relative_to(REPO)}:{n}")
    assert not hits, f"llamadas a Nominatim desde clientes: {hits}"
