"""Autenticación: registro, login, tokens, refresh con rotación, logout, sesiones (SECURITY.md §1)."""

from __future__ import annotations

import base64
import json
import uuid

import pytest
from conftest import TEST_PASSWORD, Account, Api, assert_error, assert_no_leak, login, unique_email


def _b64(data: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()


def _claims(token: str) -> dict:
    payload = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


# ------------------------------- Registro ----------------------------------


def test_register_returns_contract_token_pair(api: Api) -> None:
    email = unique_email()
    resp = api.post("/auth/register", json={"email": email, "password": TEST_PASSWORD,
                                            "full_name": "Ana QA"})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert {"access_token", "refresh_token", "token_type", "expires_in", "user"} <= set(body)
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 900
    user = body["user"]
    assert {"id", "email", "full_name", "role", "is_active", "created_at"} <= set(user)
    assert user["role"] == "USER" and user["is_active"] is True
    assert "password" not in json.dumps(user).lower(), "el usuario expone campos de contraseña"


def test_register_normalizes_email_and_rejects_duplicates(api: Api) -> None:
    email = unique_email()
    first = api.post("/auth/register", json={"email": email.upper(), "password": TEST_PASSWORD,
                                             "full_name": "Duplicado"})
    assert first.status_code == 201, first.text
    assert first.json()["user"]["email"] == email, "el email debe guardarse en minúsculas"
    dup = api.post("/auth/register", json={"email": email, "password": TEST_PASSWORD,
                                           "full_name": "Duplicado"})
    assert_error(dup, 409, "EMAIL_ALREADY_REGISTERED")


def test_register_new_email_is_never_reported_as_duplicate(api: Api) -> None:
    """Regresión 2026-11-16: un fallo de FK al crear user_preferences se traducía en
    409 EMAIL_ALREADY_REGISTERED para correos nuevos. Un correo nunca usado debe dar 201/202."""
    for _ in range(3):  # varios registros seguidos: el fallo aparecía en altas consecutivas
        email = unique_email()
        resp = api.post("/auth/register", json={"email": email, "password": TEST_PASSWORD,
                                                "full_name": "Regresión FK"})
        assert resp.status_code in (201, 202), f"{email}: {resp.status_code} {resp.text[:300]}"
        assert "EMAIL_ALREADY_REGISTERED" not in resp.text


@pytest.mark.parametrize(
    "password",
    ["corta1", "solo-letras-sin-numero", "1234567890123", "a1" + "x" * 127, ""],
    ids=["<8", "sin-numero", "sin-letra", ">128", "vacia"],
)
def test_register_rejects_weak_passwords(api: Api, password: str) -> None:
    resp = api.post("/auth/register", json={"email": unique_email(), "password": password,
                                            "full_name": "Débil"})
    assert_error(resp, 422, "VALIDATION_ERROR")
    assert password not in resp.text or password == "", "la respuesta refleja la contraseña"


@pytest.mark.parametrize("extra", [{"role": "SUPER_ADMIN"}, {"is_active": False}, {"id": str(uuid.uuid4())}])
def test_register_cannot_set_privileged_fields(api: Api, extra: dict) -> None:
    """Asignación masiva: extra="forbid" → 422; en ningún caso se crea un usuario privilegiado."""
    body = {"email": unique_email(), "password": TEST_PASSWORD, "full_name": "Mass Assign", **extra}
    resp = api.post("/auth/register", json=body)
    if resp.status_code == 201:
        user = resp.json()["user"]
        assert user["role"] == "USER" and user["is_active"] is True
        pytest.fail("Entrada con campos extra aceptada: SECURITY.md §3 exige extra='forbid' (422)")
    assert_error(resp, 422, "VALIDATION_ERROR")


def test_register_invalid_email(api: Api) -> None:
    resp = api.post("/auth/register", json={"email": "no-es-email", "password": TEST_PASSWORD,
                                            "full_name": "X"})
    assert_error(resp, 422, "VALIDATION_ERROR")


# --------------------------------- Login -----------------------------------


def test_login_ok_and_case_insensitive(api: Api, user_a: Account) -> None:
    acc = login(api, user_a.email.upper(), user_a.password)
    assert acc.user["id"] == user_a.id


def test_login_does_not_enumerate_users(api: Api, user_a: Account) -> None:
    wrong_pw = api.post("/auth/login", json={"email": user_a.email, "password": "Incorrecta-123"})
    no_user = api.post("/auth/login", json={"email": unique_email(), "password": "Incorrecta-123"})
    e1 = assert_error(wrong_pw, 401, "INVALID_CREDENTIALS")
    e2 = assert_error(no_user, 401, "INVALID_CREDENTIALS")
    assert e1["message"] == e2["message"], "mensajes distintos permiten enumerar usuarios"


def test_register_duplicate_is_only_enumeration_vector_documented(api: Api, user_a: Account) -> None:
    """El contrato acepta 409 en registro (vector conocido). Se documenta, no se exige ocultarlo."""
    resp = api.post("/auth/register", json={"email": user_a.email, "password": TEST_PASSWORD,
                                            "full_name": "x"})
    assert_error(resp, 409, "EMAIL_ALREADY_REGISTERED")


@pytest.mark.parametrize("payload", [
    {"email": "' OR '1'='1", "password": "' OR '1'='1"},
    {"email": "admin@example.com' --", "password": "x"},
    {"email": {"$ne": None}, "password": {"$ne": None}},
])
def test_login_injection_payloads_rejected(api: Api, payload: dict) -> None:
    resp = api.post("/auth/login", json=payload)
    assert resp.status_code in (401, 422), resp.text
    assert_no_leak(resp)


# --------------------------------- Tokens ----------------------------------


def test_access_token_claims(user_a: Account) -> None:
    claims = _claims(user_a.access_token)
    assert claims["type"] == "access"
    assert claims["sub"] == user_a.id
    assert {"exp", "iat", "jti"} <= set(claims)
    assert claims["exp"] - claims["iat"] <= 15 * 60 + 5, "access token debe durar ≤ 15 min"
    assert "password" not in json.dumps(claims).lower() and "email" not in claims


def test_protected_endpoint_requires_token(api: Api) -> None:
    assert_error(api.get("/users/me"), 401)
    assert_error(api.get("/users/me", headers={"Authorization": "Basic Zm9vOmJhcg=="}), 401)
    # "Bearer " con espacio final es una cabecera ilegal para httpx; "Bearer" sin token cubre el caso.
    assert_error(api.get("/users/me", headers={"Authorization": "Bearer"}), 401)


def test_tampered_and_forged_tokens_rejected(api: Api, user_a: Account) -> None:
    header, payload, sig = user_a.access_token.split(".")
    claims = _claims(user_a.access_token)
    escalated = _b64({**claims, "role": "SUPER_ADMIN"})
    cases = {
        "firma-alterada": f"{header}.{payload}.{sig[:-2]}AA",
        "payload-alterado": f"{header}.{escalated}.{sig}",
        "alg-none": f"{_b64({'alg': 'none', 'typ': 'JWT'})}.{escalated}.",
        "basura": "esto.no.es-un-jwt",
    }
    for name, token in cases.items():
        resp = api.get("/users/me", token=token)
        assert resp.status_code == 401, f"{name}: aceptado ({resp.status_code})"
        assert_no_leak(resp)


def test_refresh_token_not_usable_as_access(api: Api, user_a: Account) -> None:
    assert_error(api.get("/users/me", token=user_a.refresh_token), 401)


def test_access_token_not_usable_as_refresh(api: Api, user_a: Account) -> None:
    resp = api.post("/auth/refresh", json={"refresh_token": user_a.access_token})
    assert_error(resp, 401)


def test_role_in_token_is_not_trusted(api: Api, user_a: Account) -> None:
    """El rol se revalida contra la BD: aunque el token diga ADMIN, /admin debe negar."""
    resp = api.get("/admin/users", token=user_a.access_token)
    assert_error(resp, 403)


# ------------------------- Refresh con rotación -----------------------------


def test_refresh_rotates_and_detects_reuse(api: Api, make_user) -> None:
    acc: Account = make_user("Rotación")
    r1 = api.post("/auth/refresh", json={"refresh_token": acc.refresh_token})
    assert r1.status_code == 200, r1.text
    pair1 = r1.json()
    assert pair1["refresh_token"] != acc.refresh_token, "el refresh no rota"
    assert pair1["access_token"] != acc.access_token

    # Reutilizar el refresh viejo = robo probable → 401 TOKEN_INVALID y revocar TODA la familia.
    reuse = api.post("/auth/refresh", json={"refresh_token": acc.refresh_token})
    assert_error(reuse, 401, "TOKEN_INVALID")
    after = api.post("/auth/refresh", json={"refresh_token": pair1["refresh_token"]})
    assert_error(after, 401, "TOKEN_INVALID")


def test_refresh_families_are_independent(api: Api, make_user) -> None:
    acc: Account = make_user("Familias")
    other = login(api, acc.email, acc.password)  # segunda sesión = otra familia
    api.post("/auth/refresh", json={"refresh_token": acc.refresh_token})
    api.post("/auth/refresh", json={"refresh_token": acc.refresh_token})  # reutilización
    ok = api.post("/auth/refresh", json={"refresh_token": other.refresh_token})
    assert ok.status_code == 200, "revocar una familia no debe cerrar otras sesiones"


def test_refresh_garbage(api: Api) -> None:
    assert_error(api.post("/auth/refresh", json={"refresh_token": "x" * 50}), 401)
    assert_error(api.post("/auth/refresh", json={}), 422, "VALIDATION_ERROR")


# --------------------------------- Logout ----------------------------------


def test_logout_revokes_refresh(api: Api, make_user) -> None:
    acc: Account = make_user("Logout")
    out = api.post("/auth/logout", json={"refresh_token": acc.refresh_token})
    assert out.status_code == 204, out.text
    assert_error(api.post("/auth/refresh", json={"refresh_token": acc.refresh_token}), 401)


def test_logout_idempotent_with_invalid_token(api: Api) -> None:
    resp = api.post("/auth/logout", json={"refresh_token": "no-valido"})
    assert resp.status_code in (204, 401), resp.text
    assert_no_leak(resp)


# --------------------------- Cambio de contraseña ----------------------------


def test_password_change_revokes_all_refresh(api: Api, make_user) -> None:
    acc: Account = make_user("Cambio pass")
    second = login(api, acc.email, acc.password)
    new_pw = "OtraClave-2026-qa"
    bad = api.post("/users/me/password", token=acc.access_token,
                   json={"current_password": "incorrecta-1", "new_password": new_pw})
    assert bad.status_code in (400, 401, 403, 422), bad.text
    ok = api.post("/users/me/password", token=acc.access_token,
                  json={"current_password": acc.password, "new_password": new_pw})
    assert ok.status_code == 204, ok.text
    for rt in (acc.refresh_token, second.refresh_token):
        assert_error(api.post("/auth/refresh", json={"refresh_token": rt}), 401)
    assert_error(api.post("/auth/login", json={"email": acc.email, "password": acc.password}), 401)
    login(api, acc.email, new_pw)


def test_password_change_enforces_policy(api: Api, make_user) -> None:
    acc: Account = make_user("Política")
    resp = api.post("/users/me/password", token=acc.access_token,
                    json={"current_password": acc.password, "new_password": "corta"})
    assert_error(resp, 422, "VALIDATION_ERROR")


# --------------------------- Recuperación de contraseña ----------------------


def test_forgot_password_uniform_response(api: Api, user_a: Account, require_route) -> None:
    """Contrato 1.1 §1: 202 idéntico exista o no la cuenta (sin enumeración de usuarios)."""
    require_route("POST", "/auth/password-reset/request")
    known = api.post("/auth/password-reset/request", json={"email": user_a.email})
    unknown = api.post("/auth/password-reset/request", json={"email": unique_email()})
    assert known.status_code == unknown.status_code == 202
    assert known.text == unknown.text
