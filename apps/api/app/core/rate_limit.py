"""Rate limiting por ventana deslizante (SECURITY.md §3).

Backend en memoria por proceso: válido para una réplica. Con varias réplicas, sustituir
`limiter` por una implementación compartida (p. ej. Redis) con la misma interfaz. El bloqueo
de cuentas por contraseñas fallidas se guarda en la base de datos y por tanto es global.
"""

import threading
import time
from collections import deque

from starlette.requests import Request

from app.core.config import get_settings
from app.core.errors import rate_limited


class SlidingWindowLimiter:
    def __init__(self, max_keys: int = 100_000) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._max_keys = max_keys

    def hit(self, key: str, limit: int, window_s: int) -> tuple[bool, int]:
        """Registra un intento. Devuelve (permitido, segundos hasta reintentar)."""
        now = time.monotonic()
        with self._lock:
            if len(self._hits) >= self._max_keys:
                self._evict(now, window_s)
            q = self._hits.setdefault(key, deque())
            while q and q[0] <= now - window_s:
                q.popleft()
            if len(q) >= limit:
                return False, int(q[0] + window_s - now) + 1
            q.append(now)
            return True, 0

    def _evict(self, now: float, window_s: int) -> None:
        stale = [k for k, q in self._hits.items() if not q or q[-1] <= now - window_s]
        for k in stale:
            del self._hits[k]
        if len(self._hits) >= self._max_keys:  # todas activas: se descarta la mitad más antigua
            for k in sorted(self._hits, key=lambda k: self._hits[k][-1])[: self._max_keys // 2]:
                del self._hits[k]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    # Detrás de un proxy, uvicorn --proxy-headers --forwarded-allow-ips=<proxy> resuelve la IP
    # real. No se lee X-Forwarded-For directamente: un cliente podría falsificarlo.
    return request.client.host if request.client else "unknown"


def enforce(key: str, limit: int, window_s: int = 60) -> None:
    if not get_settings().rate_limit_enabled:
        return
    allowed, retry = limiter.hit(key, limit, window_s)
    if not allowed:
        raise rate_limited(retry)
