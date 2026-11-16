import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import JSONResponse

from app.core.deps import DB, Permissions, require_permission
from app.models import TransportMode, User
from app.schemas.common import Page, UtcDatetime
from app.schemas.trip import TripCreate, TripEstimate, TripEstimateRequest, TripOut, TripSummary
from app.services import co2, trips as trip_service

router = APIRouter(prefix="/trips", tags=["trips"])

TripUser = Annotated[User, Depends(require_permission(Permissions.TRIPS_OWN))]
_404 = {404: {"description": "TRIP_NOT_FOUND (también si el viaje es de otro usuario)"}}


@router.post("/estimate", response_model=TripEstimate, summary="Estimar distancia y CO₂ sin guardar")
def estimate(data: TripEstimateRequest, _: TripUser, db: DB) -> dict[str, Any]:
    distance = trip_service.measure_route(db, data.route) if data.route is not None else float(data.distance_m or 0)
    r = co2.estimate(db, data.mode, distance)
    return {"mode": r.mode, "distance_m": r.distance_m, "co2_emitted_g": r.co2_emitted_g,
            "co2_saved_g": r.co2_saved_g, "emission_factor_g_per_km": r.emission_factor_g_per_km}


@router.post("", status_code=status.HTTP_201_CREATED, response_model=TripOut,
             summary="Registrar viaje (idempotente por client_trip_id)",
             responses={200: {"model": TripOut, "description": "El client_trip_id ya existía"}})
def create_trip(data: TripCreate, user: TripUser, db: DB) -> Any:
    trip, created = trip_service.create(
        db, user.id, client_trip_id=data.client_trip_id, mode=data.mode,
        started_at=data.started_at, ended_at=data.ended_at, route=data.route,
    )
    if created:
        return trip
    return JSONResponse(TripOut.model_validate(trip).model_dump(mode="json"), status_code=200)


@router.get("", response_model=Page[TripSummary], summary="Historial de viajes propios")
def list_trips(
    user: TripUser,
    db: DB,
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    mode: TransportMode | None = None,
    from_: Annotated[UtcDatetime | None, Query(alias="from")] = None,
    to: UtcDatetime | None = None,
) -> dict[str, Any]:
    items, total = trip_service.list_owned(db, user.id, page=page, page_size=page_size, mode=mode,
                                           date_from=from_, date_to=to)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{trip_id}", response_model=TripOut, responses=_404, summary="Detalle de un viaje propio")
def get_trip(trip_id: uuid.UUID, user: TripUser, db: DB) -> dict[str, Any]:
    return trip_service.get_owned(db, user.id, trip_id)


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_404,
               summary="Eliminar un viaje propio")
def delete_trip(trip_id: uuid.UUID, user: TripUser, db: DB) -> Response:
    trip_service.delete_owned(db, user.id, trip_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
