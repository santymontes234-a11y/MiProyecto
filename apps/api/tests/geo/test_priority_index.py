"""Índice de prioridad: propiedades que la metodología promete."""

import pytest

from app.services.geo_analytics.priority_index import (
    DEFAULT_CONFIG,
    apply_overrides,
    score_cells,
)


def cell(i, users=40, ends=60, bike_routes=0, bike_ends=0, dist_lane=None, **kw):
    return {
        "cell_i": i,
        "cell_j": 0,
        "users": users,
        "trip_ends": ends,
        "bike_like_route_trips": bike_routes,
        "bike_like_ends": bike_ends,
        "walk_ends": kw.get("walk_ends", 0),
        "bus_ends": kw.get("bus_ends", 0),
        "short_car_ends": kw.get("short_car", 0),
        "walk_route_trips": kw.get("walk_routes", 0),
        "bus_route_trips": 0,
        "dist_bike_lane_m": dist_lane,
        "dist_bike_station_m": None,
        "dist_bus_stop_m": None,
        "geometry": None,
    }


def by_i(res):
    return {c["cell_i"]: c for c in res["cells"]}


def test_low_demand_far_from_lane_is_not_prioritized():
    """Pocos viajes + lejos de ciclovía NO debe dar prioridad alta."""
    cells = [
        cell(0, bike_routes=200, bike_ends=80, dist_lane=1400),
        cell(1, bike_routes=150, bike_ends=60, dist_lane=900),
        cell(2, bike_routes=2, bike_ends=1, dist_lane=3000),
    ]
    c = by_i(score_cells(cells, "bike_lane"))
    assert c[2]["score"] < c[0]["score"]
    assert c[2]["label"] != "candidata_prioritaria_para_estudio"


def test_insufficient_sample_has_no_score_and_says_so():
    c = by_i(
        score_cells(
            [
                cell(0, users=4, ends=6, bike_routes=50, dist_lane=2000),
                cell(1, bike_routes=10, dist_lane=100),
            ],
            "bike_lane",
        )
    )
    assert c[0]["score"] is None
    assert c[0]["label"] == "datos_insuficientes"
    assert "ni que haga falta ni que no" in c[0]["explanation"]


def test_missing_layer_is_unavailable_not_far():
    """Sin capa de ciclovías la brecha se excluye en lugar de tratarse como 'lejos'."""
    res = score_cells([cell(0, bike_routes=100), cell(1, bike_routes=5)], "bike_lane")
    gap = next(x for x in res["components"] if x["key"] == "lane_gap")
    assert gap["available"] is False
    assert any("no disponible" in n for n in res["notes"])
    for c in res["cells"]:
        comp = next(x for x in c["components"] if x["key"] == "lane_gap")
        assert comp["contribution"] == 0


def test_contributions_add_up_to_score_and_weights_renormalize():
    res = score_cells(
        [cell(i, bike_routes=i * 10, bike_ends=i, dist_lane=300 + i * 200) for i in range(6)],
        "bike_lane",
    )
    for c in res["cells"]:
        if c["score"] is not None:
            assert c["score"] == pytest.approx(
                sum(x["contribution"] for x in c["components"]), abs=0.2
            )
            assert sum(x["weight"] for x in c["components"]) == pytest.approx(1, abs=1e-3)


def test_low_score_explanation_warns_it_is_not_absence_of_need():
    res = score_cells(
        [cell(0, bike_routes=100, dist_lane=2000), cell(1, bike_routes=0, dist_lane=0)], "bike_lane"
    )
    low = by_i(res)[1]
    assert low["label"] == "sin_senal_prioritaria"
    assert "no implica" in low["explanation"]


def test_pedestrian_profile_declares_missing_sidewalk_data():
    res = score_cells([cell(0, walk_routes=10, walk_ends=5)], "pedestrian")
    assert any("banquetas" in n for n in res["notes"])


def test_overrides_validate_and_apply():
    cfg = apply_overrides(
        DEFAULT_CONFIG,
        {"min_users_for_score": 50, "profiles": {"bike_lane": {"weights": {"lane_gap": 0}}}},
    )
    assert cfg.min_users_for_score == 50
    res = score_cells([cell(0, users=40, bike_routes=10, dist_lane=2000)], "bike_lane", cfg)
    assert res["cells"][0]["label"] == "datos_insuficientes"
    with pytest.raises(ValueError):
        apply_overrides(
            DEFAULT_CONFIG, {"profiles": {"bike_lane": {"gap": {"lane_gap": {"far_m": 9000}}}}}
        )
    with pytest.raises(ValueError):
        apply_overrides(DEFAULT_CONFIG, {"profiles": {"bike_lane": {"weights": {"lane_gap": -1}}}})
