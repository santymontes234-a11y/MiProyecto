"""Formato de error único del contrato: {"error": {"code", "message", "details"}}.

Nunca se devuelven trazas ni valores de entrada al cliente; el detalle va solo a los logs.
"""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, OperationalError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("ecomove.errors")


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Any = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        self.headers = headers


_ENTITY_ES = {"trip": "Viaje", "user": "Usuario", "poi": "Punto de interés"}


def not_found(entity: str) -> AppError:
    name = _ENTITY_ES.get(entity, entity.capitalize())
    return AppError(404, f"{entity.upper()}_NOT_FOUND", f"{name} no encontrado")


def forbidden(message: str = "No tienes permiso para esta acción") -> AppError:
    return AppError(403, "FORBIDDEN", message)


def unauthorized(code: str = "UNAUTHORIZED", message: str = "No autenticado") -> AppError:
    return AppError(401, code, message, headers={"WWW-Authenticate": "Bearer"})


def rate_limited(retry_after: int) -> AppError:
    return AppError(
        429, "RATE_LIMITED", "Demasiadas solicitudes. Intenta más tarde.",
        headers={"Retry-After": str(max(retry_after, 1))},
    )


def error_body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details}}


_HTTP_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    429: "RATE_LIMITED",
}
_HTTP_MESSAGES = {404: "Recurso no encontrado", 405: "Método no permitido"}


def _clean_validation(errors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    # Se omiten `input` y `ctx`: podrían contener contraseñas o tokens.
    return [
        {"loc": [str(p) for p in e.get("loc", [])], "msg": e.get("msg"), "type": e.get("type")}
        for e in errors
    ]


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message, jsonable_encoder(exc.details)),
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=error_body(
                "VALIDATION_ERROR", "Datos inválidos", _clean_validation(list(exc.errors()))
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_CODES.get(exc.status_code, "ERROR")
        message = _HTTP_MESSAGES.get(exc.status_code) or (
            exc.detail if isinstance(exc.detail, str) else "Error"
        )
        return JSONResponse(
            status_code=exc.status_code, content=error_body(code, message), headers=exc.headers
        )

    @app.exception_handler(IntegrityError)
    async def _integrity(_: Request, exc: IntegrityError) -> JSONResponse:
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
        logger.warning("Violación de integridad", extra={"constraint": constraint})
        return JSONResponse(
            status_code=409,
            content=error_body("CONFLICT", "La operación entra en conflicto con datos existentes"),
        )

    @app.exception_handler(OperationalError)
    async def _db_down(_: Request, exc: OperationalError) -> JSONResponse:
        logger.error("Base de datos no disponible", exc_info=exc)
        return JSONResponse(
            status_code=503,
            content=error_body("SERVICE_UNAVAILABLE", "Servicio no disponible temporalmente"),
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.error("Error no controlado", exc_info=exc)
        return JSONResponse(status_code=500, content=error_body("INTERNAL_ERROR", "Error interno"))
