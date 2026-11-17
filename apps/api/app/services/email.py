"""Correo transaccional (SECURITY.md §1: SMTP por variables de entorno; Mailpit en desarrollo).

Los enlaces con tokens nunca se registran en logs. El envío se hace en segundo plano (BackgroundTasks)
para que las respuestas 202 tarden lo mismo exista o no la cuenta.
"""

import logging
import smtplib
import ssl
import threading
from dataclasses import dataclass
from email.message import EmailMessage

from app.core.config import get_settings

logger = logging.getLogger("ecomove.email")


@dataclass
class OutgoingEmail:
    to: str
    subject: str
    body: str


# Buzón en memoria, solo con EMAIL_BACKEND=memory (tests). Prohibido en producción (config).
outbox: list[OutgoingEmail] = []
_lock = threading.Lock()


def send(to: str, subject: str, body: str) -> None:
    s = get_settings()
    if s.email_backend == "disabled":
        return
    if s.email_backend == "memory":
        with _lock:
            outbox.append(OutgoingEmail(to, subject, body))
        return
    msg = EmailMessage()
    msg["From"] = s.email_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        context = ssl.create_default_context()
        server: smtplib.SMTP
        if s.smtp_ssl:
            server = smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, timeout=10, context=context)
        else:
            server = smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=10)
        with server:
            if s.smtp_starttls:
                server.starttls(context=context)
            if s.smtp_username and s.smtp_password:
                server.login(s.smtp_username, s.smtp_password.get_secret_value())
            server.send_message(msg)
    except (OSError, smtplib.SMTPException) as exc:
        # No se propaga (no debe cambiar la respuesta) ni se registra el contenido del correo.
        logger.error("No se pudo enviar el correo", extra={"subject": subject, "error": type(exc).__name__})


def _links(path_web: str, path_app: str, token: str) -> tuple[str, str]:
    s = get_settings()
    return (f"{s.web_url.rstrip('/')}/{path_web}?token={token}", f"{s.mobile_scheme}://{path_app}?token={token}")


def send_password_reset(to: str, name: str, token: str) -> None:
    s = get_settings()
    web, app = _links("restablecer-contrasena", "reset-password", token)
    send(to, "Restablece tu contraseña de EcoMove Querétaro",
         f"Hola {name}:\n\nPara restablecer tu contraseña abre uno de estos enlaces "
         f"(válidos {s.password_reset_ttl_minutes} minutos, un solo uso):\n\n"
         f"Web: {web}\nApp: {app}\n\nSi no lo pediste, ignora este mensaje; tu contraseña no cambia.")


def send_email_verification(to: str, name: str, token: str) -> None:
    s = get_settings()
    web, app = _links("verificar-correo", "verify-email", token)
    send(to, "Verifica tu correo en EcoMove Querétaro",
         f"Hola {name}:\n\nConfirma tu correo con uno de estos enlaces "
         f"(válidos {s.email_verification_ttl_hours} horas):\n\nWeb: {web}\nApp: {app}\n\n"
         "Si no creaste una cuenta, ignora este mensaje.")


def send_password_changed(to: str, name: str) -> None:
    send(to, "Tu contraseña de EcoMove Querétaro cambió",
         f"Hola {name}:\n\nLa contraseña de tu cuenta cambió y se cerraron todas tus sesiones. "
         "Si no fuiste tú, restablécela de inmediato.")
