from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import select, text

from app.core.config import get_settings
from app.models import RefreshToken, User
from tests.conftest import PASSWORD, PREFIX, auth_header, register


def test_register_returns_token_pair_and_hashes_with_argon2id(client, db):
    r = client.post(f"{PREFIX}/auth/register",
                    json={"email": "  Ana@Example.COM ", "password": PASSWORD, "full_name": "Ana  López"})
    assert r.status_code == 201
    body = r.json()
    assert set(body) == {"access_token", "refresh_token", "token_type", "expires_in", "user"}
    assert body["token_type"] == "bearer" and body["expires_in"] == 900
    assert body["user"]["email"] == "ana@example.com"
    assert body["user"]["role"] == "USER" and body["user"]["is_active"] is True
    assert body["user"]["created_at"].endswith("Z")
    user = db.execute(select(User).where(User.email == "ana@example.com")).scalar_one()
    assert user.password_hash.startswith("$argon2id$")
    assert PASSWORD not in user.password_hash


def test_register_duplicate_email_conflict(client):
    register(client, email="dup@example.com")
    r = client.post(f"{PREFIX}/auth/register",
                    json={"email": "DUP@example.com", "password": PASSWORD, "full_name": "Otra"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "EMAIL_ALREADY_REGISTERED"


def test_register_rejects_weak_password_and_extra_fields(client):
    r = client.post(f"{PREFIX}/auth/register", json={"email": "a@example.com", "password": "solounaspalabras",
                                                     "full_name": "A"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    # Mass assignment: el cliente no puede autoasignarse un rol.
    r = client.post(f"{PREFIX}/auth/register", json={"email": "b@example.com", "password": PASSWORD,
                                                     "full_name": "B", "role": "SUPER_ADMIN"})
    assert r.status_code == 422


def test_validation_errors_do_not_echo_input(client):
    secret = "x" * 200  # excede max_length=128
    r = client.post(f"{PREFIX}/auth/login", json={"email": "a@example.com", "password": secret})
    assert r.status_code == 422
    assert secret not in r.text
    for d in r.json()["error"]["details"]:
        assert set(d) == {"loc", "msg", "type"}


def test_login_success_and_generic_errors(client):
    tokens = register(client, email="login@example.com")
    r = client.post(f"{PREFIX}/auth/login", json={"email": "login@example.com", "password": PASSWORD})
    assert r.status_code == 200 and r.json()["user"]["id"] == tokens["user"]["id"]

    wrong = client.post(f"{PREFIX}/auth/login", json={"email": "login@example.com", "password": "Incorrecta-123"})
    missing = client.post(f"{PREFIX}/auth/login", json={"email": "nadie@example.com", "password": "Incorrecta-123"})
    assert wrong.status_code == missing.status_code == 401
    assert wrong.json() == missing.json()  # no revela si el correo existe
    assert wrong.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_account_lockout_after_repeated_failures(client, db):
    register(client, email="lock@example.com")
    for _ in range(5):
        assert client.post(f"{PREFIX}/auth/login",
                           json={"email": "lock@example.com", "password": "Incorrecta-123"}).status_code == 401
    # Incluso con la contraseña correcta, la cuenta está bloqueada.
    r = client.post(f"{PREFIX}/auth/login", json={"email": "lock@example.com", "password": PASSWORD})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "RATE_LIMITED"
    assert int(r.headers["Retry-After"]) > 0
    user = db.execute(select(User).where(User.email == "lock@example.com")).scalar_one()
    assert user.locked_until is not None


def test_refresh_rotates_and_reuse_revokes_family(client, db):
    tokens = register(client)
    first = tokens["refresh_token"]
    r = client.post(f"{PREFIX}/auth/refresh", json={"refresh_token": first})
    assert r.status_code == 200
    second = r.json()["refresh_token"]
    assert second != first

    # Reutilizar el token ya rotado → 401 y se revoca toda la familia (incluido el nuevo).
    r = client.post(f"{PREFIX}/auth/refresh", json={"refresh_token": first})
    assert r.status_code == 401 and r.json()["error"]["code"] == "TOKEN_INVALID"
    r = client.post(f"{PREFIX}/auth/refresh", json={"refresh_token": second})
    assert r.status_code == 401

    rows = db.execute(select(RefreshToken).where(RefreshToken.user_id == tokens["user"]["id"])).scalars().all()
    assert rows and all(row.revoked_at is not None for row in rows)
    # Solo se guarda el hash, nunca el token.
    assert all(row.token_hash not in (first, second) and len(row.token_hash) == 64 for row in rows)


def test_refresh_rejects_access_token_and_garbage(client):
    tokens = register(client)
    r = client.post(f"{PREFIX}/auth/refresh", json={"refresh_token": tokens["access_token"]})
    assert r.status_code == 401 and r.json()["error"]["code"] == "TOKEN_INVALID"
    r = client.post(f"{PREFIX}/auth/refresh", json={"refresh_token": "no-es-un-jwt"})
    assert r.status_code == 401


def test_logout_revokes_refresh(client):
    tokens = register(client)
    r = client.post(f"{PREFIX}/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 204
    r = client.post(f"{PREFIX}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401


def test_expired_and_forged_access_tokens(client):
    tokens = register(client)
    s = get_settings()
    now = datetime.now(UTC)
    base = {"sub": tokens["user"]["id"], "role": "USER", "type": "access", "jti": "0" * 8 + "-0000-4000-8000-" + "0" * 12}
    expired = jwt.encode({**base, "iat": now - timedelta(hours=1), "exp": now - timedelta(minutes=1)},
                         s.jwt_secret_key.get_secret_value(), algorithm="HS256")
    r = client.get(f"{PREFIX}/users/me", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "TOKEN_EXPIRED"

    forged = jwt.encode({**base, "iat": now, "exp": now + timedelta(minutes=5)}, "otra-clave" * 5, algorithm="HS256")
    r = client.get(f"{PREFIX}/users/me", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "TOKEN_INVALID"

    unsigned = jwt.encode({**base, "iat": now, "exp": now + timedelta(minutes=5)}, None, algorithm="none")
    r = client.get(f"{PREFIX}/users/me", headers={"Authorization": f"Bearer {unsigned}"})
    assert r.status_code == 401

    assert client.get(f"{PREFIX}/users/me").status_code == 401


def test_deactivated_user_loses_access_immediately(client, db):
    tokens = register(client)
    db.execute(text("UPDATE users SET is_active = false WHERE id = :id"), {"id": tokens["user"]["id"]})
    db.commit()
    r = client.get(f"{PREFIX}/users/me", headers=auth_header(tokens))
    assert r.status_code == 403 and r.json()["error"]["code"] == "USER_INACTIVE"
    r = client.post(f"{PREFIX}/auth/login", json={"email": tokens["user"]["email"], "password": PASSWORD})
    assert r.status_code == 403 and r.json()["error"]["code"] == "USER_INACTIVE"
    r = client.post(f"{PREFIX}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 403


def test_auth_rate_limit_per_ip(client):
    statuses = [
        client.post(f"{PREFIX}/auth/login", json={"email": f"x{i}@example.com", "password": "Incorrecta-123"}).status_code
        for i in range(12)
    ]
    assert statuses[:10] == [401] * 10
    assert statuses[10] == 429
