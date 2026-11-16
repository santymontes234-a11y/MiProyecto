"""Desglose de CO₂ (sin recalcular) y filtros."""

from datetime import UTC, datetime, timedelta

import pytest

from app.core.errors import AppError
from app.services.geo_analytics import emissions
from app.services.geo_analytics.filters import build_filters


def test_breakdown_derives_from_stored_values_only():
    # 10 km en bus con factor 68: emitido 680, ahorrado (192-68)*10 = 1240
    b = emissions.breakdown(
        {
            "mode": "BUS",
            "trips_count": 2,
            "distance_m": 10_000,
            "co2_emitted_g": 680,
            "co2_saved_g": 1240,
            "clamped_trips": 0,
        }
    )
    assert b["reference_car_g"] == 1920  # = emitido + ahorrado = 192 g/km × 10 km
    assert b["avoided_g"] == 1240
    assert b["per_passenger_km_g"] == 68
    assert b["vehicle_g_estimate"] is None  # colectivo: no atribuible


def test_breakdown_carpool_vehicle_estimate_and_sensitivity():
    b = emissions.breakdown(
        {
            "mode": "CARPOOL",
            "trips_count": 1,
            "distance_m": 1000,
            "co2_emitted_g": 64,
            "co2_saved_g": 128,
            "clamped_trips": 0,
        }
    )
    assert b["vehicle_g_estimate"] == 64 * 3
    sens = {s["baseline_occupancy"]: s["avoided_g"] for s in b["sensitivity"]}
    assert sens[1.0] == 128
    assert sens[1.5] < sens[1.0]  # con más ocupación del auto de referencia, se evita menos
    assert all(v >= 0 for v in sens.values())


def test_methodology_has_no_emission_factors():
    m = emissions.methodology()
    assert m["is_estimate"] is True
    assert "grams_per_km" not in str(m)


def test_filters_defaults_and_validation():
    now = datetime(2026, 11, 15, tzinfo=UTC)
    f = build_filters(None, None, ["bicycle"], now=now)
    assert f.date_to == now and f.date_from == now - timedelta(days=90)
    assert f.modes == ("BICYCLE",) and not f.is_demo
    with pytest.raises(AppError):
        build_filters(now, now - timedelta(days=1))
    with pytest.raises(AppError):
        build_filters(now - timedelta(days=800), now)
    assert build_filters(None, None, dataset="demo", now=now).is_demo
