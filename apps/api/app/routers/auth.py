import uuid

from fastapi import APIRouter, BackgroundTasks, Request, Response, status
from fastapi.responses import JSONResponse

from app.core.deps import DB, CurrentUser
from app.schemas.auth import (
    EmailRequest,
    LoginRequest,
    MessageResponse,
    PasswordResetConfirm,
    RefreshRequest,
    RegisterRequest,
    SessionOut,
    TokenConfirm,
    TokenPair,
)
from app.schemas.user import UserOut
from app.services import auth as auth_service
from app.services.auth import TokenBundle

router = APIRouter(prefix="/auth", tags=["auth"])

_ERR = {401: {"description": "INVALID_CREDENTIALS · TOKEN_INVALID · TOKEN_EXPIRED"},
        403: {"description": "USER_INACTIVE · EMAIL_NOT_VERIFIED"}, 429: {"description": "RATE_LIMITED"}}
_RESET_MSG = "Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña."
_VERIFY_MSG = "Si la cuenta existe y no está verificada, enviaremos un nuevo correo de verificación."
_REGISTER_PENDING = "Cuenta creada. Revisa tu correo para verificarla antes de iniciar sesión."


def _ua(request: Request) -> str | None:
    return request.headers.get("user-agent")


def _pair(b: TokenBundle) -> TokenPair:
    return TokenPair(access_token=b.access_token, refresh_token=b.refresh_token, expires_in=b.expires_in,
                     user=UserOut.model_validate(b.user))


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=TokenPair,
             summary="Registrar usuario (202 sin tokens si la verificación de correo es obligatoria)",
             responses={202: {"model": MessageResponse}, 409: {"description": "EMAIL_ALREADY_REGISTERED"}, **_ERR})
def register(data: RegisterRequest, request: Request, db: DB, background: BackgroundTasks) -> object:
    bundle = auth_service.register(db, data.email, data.password, data.full_name, background, _ua(request))
    if bundle is None:
        return JSONResponse({"message": _REGISTER_PENDING}, status_code=status.HTTP_202_ACCEPTED,
                            background=background)
    return _pair(bundle)


@router.post("/login", response_model=TokenPair, summary="Iniciar sesión", responses=_ERR)
def login(data: LoginRequest, request: Request, db: DB) -> TokenPair:
    return _pair(auth_service.login(db, data.email, data.password, _ua(request)))


@router.post("/refresh", response_model=TokenPair, responses=_ERR,
             summary="Renovar tokens (rota el refresh; reutilizar uno revocado revoca toda la familia)")
def refresh(data: RefreshRequest, request: Request, db: DB) -> TokenPair:
    return _pair(auth_service.refresh(db, data.refresh_token, _ua(request)))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Cerrar sesión (revoca el refresh)",
             responses={401: {"description": "TOKEN_INVALID"}})
def logout(data: RefreshRequest, db: DB) -> Response:
    auth_service.logout(db, data.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT,
             summary="Cerrar todas las sesiones (revoca refresh e invalida los access emitidos)")
def logout_all(user: CurrentUser, db: DB) -> Response:
    auth_service.logout_all(db, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/sessions", response_model=list[SessionOut], summary="Sesiones activas")
def sessions(user: CurrentUser, request: Request, db: DB) -> list[SessionOut]:
    current = getattr(request.state, "session_id", None)
    return [
        SessionOut(id=rt.family_id, created_at=rt.session_created_at or rt.created_at,
                   last_used_at=rt.last_used_at or rt.created_at, expires_at=rt.expires_at,
                   user_agent=rt.user_agent, current=rt.family_id == current)
        for rt in auth_service.list_sessions(db, user)
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT,
               responses={404: {"description": "SESSION_NOT_FOUND"}}, summary="Revocar una sesión propia")
def revoke_session(session_id: uuid.UUID, user: CurrentUser, db: DB) -> Response:
    auth_service.revoke_session(db, user, session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED, response_model=MessageResponse,
             summary="Solicitar restablecimiento (respuesta uniforme)")
def password_reset_request(data: EmailRequest, db: DB, background: BackgroundTasks) -> MessageResponse:
    auth_service.request_password_reset(db, data.email, background)
    return MessageResponse(message=_RESET_MSG)


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT,
             responses={400: {"description": "RESET_TOKEN_INVALID"}}, summary="Restablecer contraseña")
def password_reset_confirm(data: PasswordResetConfirm, db: DB, background: BackgroundTasks) -> Response:
    auth_service.confirm_password_reset(db, data.token, data.new_password, background)
    return Response(status_code=status.HTTP_204_NO_CONTENT, background=background)


@router.post("/email-verification/request", status_code=status.HTTP_202_ACCEPTED, response_model=MessageResponse,
             summary="Reenviar verificación de correo (respuesta uniforme)")
def email_verification_request(data: EmailRequest, db: DB, background: BackgroundTasks) -> MessageResponse:
    auth_service.request_email_verification(db, data.email, background)
    return MessageResponse(message=_VERIFY_MSG)


@router.post("/email-verification/confirm", status_code=status.HTTP_204_NO_CONTENT,
             responses={400: {"description": "VERIFICATION_TOKEN_INVALID"}}, summary="Verificar correo")
def email_verification_confirm(data: TokenConfirm, db: DB) -> Response:
    auth_service.confirm_email_verification(db, data.token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


