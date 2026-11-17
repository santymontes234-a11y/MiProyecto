from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.core.deps import DB, Permissions, require_permission
from app.models import User, UserPreference
from app.schemas.citizen_report import CitizenReportOut
from app.schemas.gamification import NotificationOut, UserAchievementOut
from app.schemas.stats import StatsSummary
from app.schemas.trip import TripOut
from app.schemas.user import (
    AccountDelete,
    PasswordChange,
    Preferences,
    PreferencesOut,
    UserOut,
    UserUpdate,
)
from app.services import gamification
from app.services import users as users_service

router = APIRouter(prefix="/users", tags=["users"])

ProfileUser = Annotated[User, Depends(require_permission(Permissions.PROFILE_OWN))]


@router.get("/me", response_model=UserOut, summary="Perfil propio")
def me(user: ProfileUser) -> User:
    return user


@router.patch("/me", response_model=UserOut, summary="Actualizar perfil propio")
def update_me(data: UserUpdate, user: ProfileUser, db: DB) -> User:
    return users_service.update_profile(db, user, data.full_name, data.ranking_opt_in)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT,
               responses={403: {"description": "Último SUPER_ADMIN activo"},
                          422: {"description": "Contraseña incorrecta"}},
               summary="Borrar la cuenta propia (borrado físico)")
def delete_me(data: AccountDelete, user: ProfileUser, db: DB) -> Response:
    users_service.delete_account(db, user, data.password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT,
             summary="Cambiar contraseña (revoca todos los refresh y access)")
def change_password(data: PasswordChange, user: ProfileUser, db: DB) -> Response:
    users_service.change_password(db, user, data.current_password, data.new_password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/preferences", response_model=PreferencesOut, summary="Preferencias propias")
def get_preferences(user: ProfileUser, db: DB) -> UserPreference:
    return users_service.get_preferences(db, user)


@router.put("/me/preferences", response_model=PreferencesOut, summary="Reemplazar preferencias propias")
def put_preferences(data: Preferences, user: ProfileUser, db: DB) -> UserPreference:
    return users_service.put_preferences(db, user, data)


@router.get("/me/achievements", response_model=list[UserAchievementOut],
            summary="Logros activos con el progreso propio")
def my_achievements(user: ProfileUser, db: DB) -> list[dict[str, Any]]:
    return gamification.user_achievements(db, user.id)


@router.get("/me/export", summary="Exportar todos mis datos (LFPDPPP)",
            responses={200: {"description": "UserExport (Content-Disposition: attachment)"}})
def export_me(user: ProfileUser, db: DB) -> JSONResponse:
    data = users_service.export(db, user)
    body = {
        "exported_at": data["exported_at"].isoformat().replace("+00:00", "Z"),
        "user": UserOut.model_validate(data["user"]).model_dump(mode="json"),
        "preferences": PreferencesOut.model_validate(data["preferences"]).model_dump(mode="json"),
        "trips": [TripOut.model_validate(t).model_dump(mode="json") for t in data["trips"]],
        "achievements": [UserAchievementOut.model_validate(a).model_dump(mode="json") for a in data["achievements"]],
        "stats": StatsSummary.model_validate(data["stats"]).model_dump(mode="json", by_alias=True),
        "notifications": [NotificationOut.model_validate(n).model_dump(mode="json") for n in data["notifications"]],
        "citizen_reports": [CitizenReportOut.model_validate(c).model_dump(mode="json")
                            for c in data["citizen_reports"]],
    }
    return JSONResponse(
        jsonable_encoder(body),
        headers={"Content-Disposition": 'attachment; filename="ecomove-mis-datos.json"',
                 "Cache-Control": "no-store"},
    )
