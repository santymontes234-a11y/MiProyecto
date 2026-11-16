"""Punto de entrada ASGI: `uvicorn app.main:app`."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import SecurityMiddleware
from app.db.session import SessionLocal
from app.routers import admin, auth, health, map, stats, trips, users
from app.services.users import bootstrap_super_admin

logger = logging.getLogger("ecomove")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    try:
        with SessionLocal() as db:
            bootstrap_super_admin(db)
    except Exception:  # la API arranca aunque el bootstrap falle; /health reporta el estado de la BD
        logger.exception("No se pudo ejecutar el bootstrap del SUPER_ADMIN")
    yield


def create_app() -> FastAPI:
    s = get_settings()
    configure_logging(s.log_level)
    docs = s.enable_docs
    app = FastAPI(
        title="EcoMove Querétaro API",
        version="1.0.0",
        description="API de EcoMove Querétaro. Contrato: docs/API_CONTRACT.md (v1.0.0).",
        openapi_url=f"{s.api_prefix}/openapi.json" if docs else None,
        docs_url=f"{s.api_prefix}/docs" if docs else None,
        redoc_url=f"{s.api_prefix}/redoc" if docs else None,
        lifespan=lifespan,
    )
    register_error_handlers(app)

    # El orden importa: el último añadido es el más externo. CORS debe envolver todo
    # para que también las respuestas 429/413 lleven sus cabeceras.
    app.add_middleware(SecurityMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origin_list,  # lista blanca; nunca "*"
        allow_credentials=False,  # la API usa Bearer, no cookies (ADR-003)
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID", "Retry-After"],
        max_age=600,
    )

    for r in (health, auth, users, trips, map, stats, admin):
        app.include_router(r.router, prefix=s.api_prefix)
    return app


app = create_app()
