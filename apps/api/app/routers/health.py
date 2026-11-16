from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.deps import DB

router = APIRouter(tags=["health"])


@router.get("/health", summary="Salud del servicio",
            responses={503: {"description": "Base de datos no disponible"}})
def health(db: DB) -> JSONResponse:
    try:
        db.execute(text("SELECT 1"))
        return JSONResponse({"status": "ok", "database": "ok"})
    except Exception:  # noqa: BLE001 - nunca se filtra el error al cliente
        return JSONResponse({"status": "degraded", "database": "error"}, status_code=503)
