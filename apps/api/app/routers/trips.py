import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import JSONResponse

from app.core.deps import DB, Permissions, require_permission
from app.models import TransportMode, User
from app.schemas.common import Page, UtcDatetime
from app.schemas.trip import (
    RecurringTripCreate,
    RecurringTripResult,
    TripCreate,
    TripEstimate,
    TripEstimateBatch,
    TripEstimateBatchRequest,
    TripEstimateRequest,
    TripOut,
    TripSummary,
    TripUpdate,
)
from app.services import trips as trip_service

router = APIRouter(prefix="/trips", tags=["trips"])

TripUser = Annotated[User, Depends(require_permission(Permissions.TRIPS_OWN))]
_404 = {404: {"description": "TRIP_NOT_FOUND (también si el viaje es de otro usuario)"}}
_422 = {422: {"description": "VALIDATION_ERROR, TRIP_OUTSIDE_SERVICE_AREA, TRIP_TOO_SHORT, "
                             "TRIP_IMPLAUSIBLE_SPEED, MODE_INACTIVE, ROUTE_TOKEN_INVALID"},
        409: {"description": "TRIP_DUPLICATE"}}


@router.post("/estimate", response_model=TripEstimate, summary="Estimar distancia, CO₂ y puntos sin guardar")
def estimate(data: TripEstimateRequest, user: TripUser, db: DB) -> dict[str, Any]:
    return trip_service.estimate(db, user.id, data.mode, data.route, data.distance_m, data.vehicle_type,
                                 data.occupants)


@router.post("/estimate/batch", response_model=TripEstimateBatch,
             summary="Estimar varios medios a la vez (mismo orden que `modes`)")
def estimate_batch(data: TripEstimateBatchRequest, user: TripUser, db: DB) -> dict[str, Any]:
    return trip_service.estimate_batch(db, user.id, data.modes, data.route, data.distance_m, data.vehicle_type,
                                       data.occupants)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=TripOut, responses=_422,
             summary="Registrar viaje (idempotente por client_trip_id)")
def create_trip(data: TripCreate, user: TripUser, db: DB) -> Any:
    trip, created = trip_service.create(db, user.id, data)
    if created:
        return trip
    return JSONResponse(TripOut.model_validate(trip).model_dump(mode="json"), status_code=200)


@router.post("/recurring", status_code=status.HTTP_201_CREATED, response_model=RecurringTripResult,
             responses=_422, summary="Generar viajes recurrentes en fechas pasadas")
def create_recurring(data: RecurringTripCreate, user: TripUser, db: DB) -> dict[str, Any]:
    return trip_service.create_recurring(db, user.id, data)


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


@router.patch("/{trip_id}", response_model=TripOut, responses={**_404, **_422},
              summary="Editar un viaje propio (recalcula distancia, duración, CO₂ y puntos)")
def update_trip(trip_id: uuid.UUID, data: TripUpdate, user: TripUser, db: DB) -> dict[str, Any]:
    return trip_service.update(db, user.id, trip_id, data)


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_404,
               summary="Eliminar un viaje propio")
def delete_trip(trip_id: uuid.UUID, user: TripUser, db: DB) -> Response:
    trip_service.delete_owned(db, user.id, trip_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
