from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from tests.conftest import PREFIX, auth_header, make_user, register, trip_payload

BBOX = "-100.45,20.55,-100.35,20.65"


def _poi(client, h, **kw):
    body = {"name": "Parada Centro", "category": "BUS_STOP", "description": None,
            "location": {"type": "Point", "coordinates": [-100.39, 20.59]}, "attributes": {"lines": ["L1"]}}
    body.update(kw)
    return client.post(f"{PREFIX}/admin/map/pois", headers=h, json=body)


def test_pois_bbox_category_and_soft_delete(client):
    h = auth_header(make_user(client, "ADMIN"))
    r = _poi(client, h)
    assert r.status_code == 201
    feature = r.json()
    assert feature["type"] == "Feature" and feature["geometry"]["coordinates"] == [-100.39, 20.59]
    _poi(client, h, name="Lejos", location={"type": "Point", "coordinates": [-99.0, 19.4]})
    _poi(client, h, name="Ciclo", category="BIKE_PARKING")

    fc = client.get(f"{PREFIX}/map/pois", params={"bbox": BBOX}).json()
    assert fc["type"] == "FeatureCollection" and len(fc["features"]) == 2
    only = client.get(f"{PREFIX}/map/pois", params={"bbox": BBOX, "category": "BIKE_PARKING"}).json()
    assert [f["properties"]["name"] for f in only["features"]] == ["Ciclo"]

    assert client.delete(f"{PREFIX}/admin/map/pois/{feature['id']}", headers=h).status_code == 204
    assert client.get(f"{PREFIX}/map/pois/{feature['id']}").status_code == 404
    assert len(client.get(f"{PREFIX}/map/pois", params={"bbox": BBOX}).json()["features"]) == 1


def test_bbox_validation(client):
    assert client.get(f"{PREFIX}/map/pois").status_code == 422
    r = client.get(f"{PREFIX}/map/pois", params={"bbox": "-101,20,-100,21"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "BBOX_TOO_LARGE"
    for bad in ("a,b,c,d", "1,2,3", "-100.3,20.6,-100.4,20.5", "-190,20,-100,21"):
        r = client.get(f"{PREFIX}/map/pois", params={"bbox": bad})
        assert r.status_code == 400 and r.json()["error"]["code"] == "BBOX_INVALID"
    assert client.get(f"{PREFIX}/map/pois", params={"bbox": BBOX, "limit": 501}).status_code == 422


def test_cycleways(client, db):
    db.execute(text(
        "INSERT INTO cycleways (id, name, is_protected, geom) VALUES (gen_random_uuid(), 'Ciclovía Zaragoza', true, "
        "ST_SetSRID(ST_GeomFromText('LINESTRING(-100.40 20.59, -100.38 20.59)'), 4326))"
    ))
    db.commit()
    fc = client.get(f"{PREFIX}/map/cycleways", params={"bbox": BBOX}).json()
    props = fc["features"][0]["properties"]
    assert props["name"] == "Ciclovía Zaragoza" and props["is_protected"] is True
    assert 2000 < props["length_m"] < 2200


def test_personal_stats_and_timeseries(client):
    user = register(client)
    h = auth_header(user)
    for mode in ("BICYCLE", "BICYCLE", "BUS"):
        client.post(f"{PREFIX}/trips", headers=h, json=trip_payload(mode=mode))
    s = client.get(f"{PREFIX}/stats/me", headers=h).json()
    assert s["trips_count"] == 3 and s["from"] is None and "from_" not in s
    assert {m["mode"]: m["trips_count"] for m in s["by_mode"]} == {"BICYCLE": 2, "BUS": 1}
    assert s["duration_s"] == 3600

    now = datetime.now(UTC)
    ts = client.get(f"{PREFIX}/stats/me/timeseries", headers=h, params={
        "granularity": "day", "from": (now - timedelta(days=2)).isoformat(), "to": (now + timedelta(days=1)).isoformat(),
    }).json()
    assert ts["granularity"] == "day" and sum(p["trips_count"] for p in ts["points"]) == 3
    assert ts["points"][0]["period_start"].endswith("Z")
    # Otro usuario no ve estos datos.
    assert client.get(f"{PREFIX}/stats/me", headers=auth_header(register(client))).json()["trips_count"] == 0


def test_city_stats_k_anonymity(client):
    user = register(client)
    h = auth_header(user)
    for _ in range(3):
        client.post(f"{PREFIX}/trips", headers=h, json=trip_payload())
    s = client.get(f"{PREFIX}/stats/city").json()
    assert s["trips_count"] == 0 and s["co2_saved_g"] == 0 and s["by_mode"] == []
    for _ in range(8):
        client.post(f"{PREFIX}/trips", headers=h, json=trip_payload())
    s = client.get(f"{PREFIX}/stats/city").json()
    assert s["trips_count"] == 11 and s["by_mode"][0]["mode"] == "BICYCLE"


def test_osm_reference_is_unique_only_for_osm_pois(client):
    h = auth_header(make_user(client, "ADMIN"))
    osm = {"source": "osm", "osm_type": "node", "osm_id": "123456"}
    assert _poi(client, h, attributes=osm).status_code == 201
    dup = _poi(client, h, name="Duplicado", attributes=osm)
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "CONFLICT"
    # Otro tipo OSM con el mismo id, o POIs no OSM con los mismos atributos, sí se permiten.
    assert _poi(client, h, attributes={**osm, "osm_type": "way"}).status_code == 201
    manual = {"source": "manual", "osm_type": "node", "osm_id": "123456"}
    assert _poi(client, h, attributes=manual).status_code == 201
    assert _poi(client, h, attributes=manual).status_code == 201
