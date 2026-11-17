"""Firma del `route_token` de `/routes` (contrato §12, SECURITY.md §1). Fuente única: la usan
`/routes` (módulo geo) para emitir y `/trips` para verificar.

Formato: base64url(payload JSON) "." base64url(HMAC-SHA256). El payload lleva `mode`, `exp` y el
SHA-256 de la geometría normalizada (coordenadas redondeadas a 6 decimales, ~11 cm), de modo que el
token no crece con la ruta y cualquier cambio de geometría o de medio lo invalida.
"""

import base64
import hashlib
import hmac
import json
import time
from collections.abc import Iterable, Sequence

from app.core.config import get_settings

_DECIMALS = 6


def _secret() -> bytes:
    s = get_settings()
    if s.route_token_secret is not None:
        return s.route_token_secret.get_secret_value().encode()
    # Desarrollo/tests: clave derivada del JWT (en producción ROUTE_TOKEN_SECRET es obligatoria).
    return hashlib.sha256(b"route-token:" + s.jwt_secret_key.get_secret_value().encode()).digest()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def geometry_digest(coordinates: Iterable[Sequence[float]]) -> str:
    normalized = [[round(float(c[0]), _DECIMALS), round(float(c[1]), _DECIMALS)] for c in coordinates]
    raw = json.dumps(normalized, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


def sign(coordinates: Iterable[Sequence[float]], mode: str, ttl_s: int | None = None) -> str:
    ttl = ttl_s if ttl_s is not None else get_settings().route_token_ttl_hours * 3600
    payload = {"v": 1, "mode": str(mode), "g": geometry_digest(coordinates), "exp": int(time.time()) + ttl}
    body = _b64(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    mac = hmac.new(_secret(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{_b64(mac)}"


def verify(token: str, coordinates: Iterable[Sequence[float]], mode: str) -> bool:
    try:
        body, mac = token.split(".", 1)
        expected = hmac.new(_secret(), body.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _unb64(mac)):
            return False
        payload = json.loads(_unb64(body))
        return (
            payload.get("v") == 1
            and payload.get("mode") == str(mode)
            and int(payload.get("exp", 0)) > int(time.time())
            and hmac.compare_digest(str(payload.get("g", "")), geometry_digest(coordinates))
        )
    except (ValueError, TypeError, json.JSONDecodeError):
        return False
