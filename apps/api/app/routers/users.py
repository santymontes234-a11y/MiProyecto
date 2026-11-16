from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.core.deps import DB, Permissions, require_permission
from app.models import User
from app.schemas.user import PasswordChange, UserOut, UserUpdate
from app.services import users as users_service

router = APIRouter(prefix="/users", tags=["users"])

ProfileUser = Annotated[User, Depends(require_permission(Permissions.PROFILE_OWN))]


@router.get("/me", response_model=UserOut, summary="Perfil propio")
def me(user: ProfileUser) -> User:
    return user


@router.patch("/me", response_model=UserOut, summary="Actualizar perfil propio")
def update_me(data: UserUpdate, user: ProfileUser, db: DB) -> User:
    return users_service.update_profile(db, user, data.full_name)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT,
             summary="Cambiar contraseña (revoca todos los refresh)")
def change_password(data: PasswordChange, user: ProfileUser, db: DB) -> Response:
    users_service.change_password(db, user, data.current_password, data.new_password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
