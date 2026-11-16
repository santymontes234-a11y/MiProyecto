from tests.conftest import PASSWORD, PREFIX, auth_header, register


def test_get_and_update_profile(client):
    tokens = register(client)
    h = auth_header(tokens)
    r = client.get(f"{PREFIX}/users/me", headers=h)
    assert r.status_code == 200
    assert set(r.json()) == {"id", "email", "full_name", "role", "is_active", "created_at"}

    r = client.patch(f"{PREFIX}/users/me", headers=h, json={"full_name": "  Ana   L. "})
    assert r.status_code == 200 and r.json()["full_name"] == "Ana L."


def test_profile_update_cannot_escalate_role_or_change_email(client):
    tokens = register(client)
    h = auth_header(tokens)
    for body in ({"role": "SUPER_ADMIN"}, {"is_active": True}, {"email": "otro@example.com"}):
        assert client.patch(f"{PREFIX}/users/me", headers=h, json=body).status_code == 422
    assert client.get(f"{PREFIX}/users/me", headers=h).json()["role"] == "USER"


def test_change_password_revokes_refresh_tokens(client):
    tokens = register(client)
    h = auth_header(tokens)
    r = client.post(f"{PREFIX}/users/me/password", headers=h,
                    json={"current_password": "Incorrecta-123", "new_password": "Nueva-clave-2026"})
    assert r.status_code == 422

    r = client.post(f"{PREFIX}/users/me/password", headers=h,
                    json={"current_password": PASSWORD, "new_password": "Nueva-clave-2026"})
    assert r.status_code == 204
    assert client.post(f"{PREFIX}/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401
    assert client.post(f"{PREFIX}/auth/login",
                       json={"email": tokens["user"]["email"], "password": PASSWORD}).status_code == 401
    assert client.post(f"{PREFIX}/auth/login",
                       json={"email": tokens["user"]["email"], "password": "Nueva-clave-2026"}).status_code == 200
