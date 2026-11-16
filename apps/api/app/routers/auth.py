from fastapi import APIRouter, Response, status

from app.core.deps import DB
from app.schemas.auth import LoginRequest, RefreshRequest, RegisterRequest, TokenPair
from app.schemas.user import UserOut
from app.services import auth as auth_service
from app.services.auth import TokenBundle

router = APIRouter(prefix="/auth", tags=["auth"])

_ERR = {401: {"description": "INVALID_CREDENTIALS · TOKEN_INVALID · TOKEN_EXPIRED"},
        403: {"description": "USER_INACTIVE"}, 429: {"description": "RATE_LIMITED"}}


def _pair(b: TokenBundle) -> TokenPair:
    return TokenPair(access_token=b.access_token, refresh_token=b.refresh_token, expires_in=b.expires_in,
                     user=UserOut.model_validate(b.user))


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=TokenPair,
             summary="Registrar usuario", responses={409: {"description": "EMAIL_ALREADY_REGISTERED"}, **_ERR})
def register(data: RegisterRequest, db: DB) -> TokenPair:
    return _pair(auth_service.register(db, data.email, data.password, data.full_name))


@router.post("/login", response_model=TokenPair, summary="Iniciar sesión", responses=_ERR)
def login(data: LoginRequest, db: DB) -> TokenPair:
    return _pair(auth_service.login(db, data.email, data.password))


@router.post("/refresh", response_model=TokenPair, responses=_ERR,
             summary="Renovar tokens (rota el refresh; reutilizar uno revocado revoca toda la familia)")
def refresh(data: RefreshRequest, db: DB) -> TokenPair:
    return _pair(auth_service.refresh(db, data.refresh_token))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Cerrar sesión (revoca el refresh)",
             responses={401: {"description": "TOKEN_INVALID"}})
def logout(data: RefreshRequest, db: DB) -> Response:
    auth_service.logout(db, data.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
