"""Logging JSON con redacción de datos sensibles (SECURITY.md §5: sin contraseñas, tokens ni coordenadas)."""

import json
import logging
import re
import sys
from datetime import UTC, datetime
from typing import Any

_SENSITIVE_KEY = re.compile(
    r"(pass(word)?|secret|token|authorization|cookie|api[_-]?key|credential|route|coordinates|location|geom)",
    re.I,
)
_JWT_RE = re.compile(r"eyJ[\w-]+\.[\w-]+\.[\w-]+")
_BEARER_RE = re.compile(r"(?i)bearer\s+[\w.~+/-]+=*")
_STD_ATTRS = set(vars(logging.makeLogRecord({}))) | {"message", "asctime", "taskName"}


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: "[REDACTED]" if _SENSITIVE_KEY.search(str(k)) else redact(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [redact(v) for v in value]
    if isinstance(value, str):
        return _BEARER_RE.sub("Bearer [REDACTED]", _JWT_RE.sub("[REDACTED_JWT]", value))
    return value


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": redact(record.getMessage()),
        }
        extras = {k: v for k, v in vars(record).items() if k not in _STD_ATTRS and not k.startswith("_")}
        data.update(redact(extras))
        if record.exc_info:
            data["exc"] = redact(self.formatException(record.exc_info))
        return json.dumps(data, default=str, ensure_ascii=False)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    # Nuestro middleware ya registra cada petición sin querystring.
    logging.getLogger("uvicorn.access").disabled = True
