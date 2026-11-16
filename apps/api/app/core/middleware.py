"""Middleware ASGI: request id, límite de tamaño, rate limiting global y cabeceras de seguridad."""

import logging
import re
import time
import uuid

import jwt
from starlette.datastructures import MutableHeaders
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import get_settings
from app.core.errors import error_body
from app.core.rate_limit import client_ip, limiter

logger = logging.getLogger("ecomove.http")

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")
_DOCS_SUFFIXES = ("/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect")

API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
DOCS_CSP = (
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https://fastapi.tiangolo.com; frame-ancestors 'none'; base-uri 'none'"
)


def _rate_key(request: Request, prefix: str) -> tuple[str, int]:
    """/auth/* → 10/min por IP; resto → 120/min por usuario (si hay token válido) o por IP."""
    s = get_settings()
    path = request.url.path
    if path.startswith(f"{prefix}/auth/"):
        return f"auth:{client_ip(request)}", s.rate_limit_auth_per_minute
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        try:
            sub = jwt.decode(
                auth[7:].strip(), s.jwt_secret_key.get_secret_value(), algorithms=[s.jwt_algorithm]
            ).get("sub")
            if sub:
                return f"user:{sub}", s.rate_limit_default_per_minute
        except jwt.PyJWTError:
            pass
    return f"ip:{client_ip(request)}", s.rate_limit_default_per_minute


class SecurityMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        s = get_settings()
        request = Request(scope)
        incoming = request.headers.get("x-request-id", "")
        request_id = incoming if _REQUEST_ID_RE.match(incoming) else uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        path = request.url.path
        is_docs = path.endswith(_DOCS_SUFFIXES)
        start = time.perf_counter()
        status_holder = {"code": 500}

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["code"] = message["status"]
                h = MutableHeaders(scope=message)
                h["X-Request-ID"] = request_id
                h["X-Content-Type-Options"] = "nosniff"
                h["X-Frame-Options"] = "DENY"
                h["Referrer-Policy"] = "no-referrer"
                h["Permissions-Policy"] = "geolocation=(), camera=(), microphone=(), payment=()"
                h["Cross-Origin-Opener-Policy"] = "same-origin"
                h["Content-Security-Policy"] = DOCS_CSP if is_docs else API_CSP
                if not is_docs:
                    h["Cache-Control"] = "no-store"
                if s.is_production:
                    h["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
                if "server" in h:
                    del h["server"]
            await send(message)

        async def reject(status: int, code: str, msg: str, headers: dict[str, str] | None = None) -> None:
            resp = JSONResponse(status_code=status, content=error_body(code, msg), headers=headers)
            await resp(scope, receive, send_wrapper)

        # 1) Límite de tamaño del cuerpo (Content-Length declarado).
        try:
            declared = int(request.headers.get("content-length", "0"))
        except ValueError:
            declared = 0
        if declared > s.max_body_bytes:
            await reject(413, "PAYLOAD_TOO_LARGE", "El cuerpo de la petición es demasiado grande")
            return

        # 2) Rate limiting global (excepto /health).
        if s.rate_limit_enabled and not path.endswith("/health") and scope.get("method") != "OPTIONS":
            key, limit = _rate_key(request, s.api_prefix)
            allowed, retry = limiter.hit(key, limit, 60)
            if not allowed:
                await reject(429, "RATE_LIMITED", "Demasiadas solicitudes. Intenta más tarde.",
                             {"Retry-After": str(retry)})
                return

        # 3) Límite de tamaño real para cuerpos sin Content-Length (chunked).
        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > s.max_body_bytes:
                    raise _BodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send_wrapper)
        except _BodyTooLarge:
            await reject(413, "PAYLOAD_TOO_LARGE", "El cuerpo de la petición es demasiado grande")
        finally:
            logger.info(
                "request",
                extra={
                    "request_id": request_id,
                    "method": scope.get("method"),
                    "path": path,  # sin querystring
                    "status": status_holder["code"],
                    "duration_ms": round((time.perf_counter() - start) * 1000, 1),
                },
            )


class _BodyTooLarge(Exception):
    pass
