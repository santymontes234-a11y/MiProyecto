"""Configuración leída exclusivamente de variables de entorno (nunca del repo)."""

from functools import lru_cache

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", case_sensitive=False)

    api_env: str = "development"  # development | test | production
    api_prefix: str = "/api/v1"
    enable_docs: bool = True
    log_level: str = "INFO"

    # --- Base de datos ---
    postgres_db: str = "ecomove"
    postgres_user: str = "ecomove"
    postgres_password: SecretStr = SecretStr("")
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    database_url_override: SecretStr | None = None  # DATABASE_URL_OVERRIDE (tests / CI)

    # --- JWT ---
    jwt_secret_key: SecretStr
    jwt_algorithm: str = "HS256"
    jwt_access_token_expires_minutes: int = 15
    jwt_refresh_token_expires_days: int = 30

    # --- HTTP ---
    cors_origins: str = ""
    max_body_bytes: int = 1_048_576  # SECURITY.md §3: cuerpo <= 1 MB

    # --- Rate limiting y fuerza bruta (SECURITY.md §3) ---
    rate_limit_enabled: bool = True
    rate_limit_auth_per_minute: int = 10
    rate_limit_default_per_minute: int = 120
    login_max_failures: int = 5
    login_lockout_minutes: int = 15

    # --- Viajes ---
    max_trip_duration_hours: int = 24
    trip_future_tolerance_minutes: int = 5

    # --- Área de servicio (bbox del estado de Querétaro, con margen) ---
    service_area_min_lng: float = -100.65
    service_area_min_lat: float = 20.0
    service_area_max_lng: float = -99.0
    service_area_max_lat: float = 21.7
    min_trip_distance_m: float = 50.0

    # --- route_token (§12) ---
    route_token_secret: SecretStr | None = None
    route_token_ttl_hours: int = 24

    # --- Cuenta: verificación y reset ---
    require_email_verification: bool = False
    password_reset_ttl_minutes: int = 30
    email_verification_ttl_hours: int = 48

    # --- Correo ---
    email_backend: str = "smtp"  # smtp | memory (solo tests) | disabled
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_starttls: bool = False
    smtp_ssl: bool = False
    email_from: str = "EcoMove Querétaro <no-reply@ecomove.local>"
    web_url: str = "http://localhost:3000"
    mobile_scheme: str = "ecomove"

    # --- Gamificación y notificaciones ---
    citizen_reports_per_day: int = 10
    notifications_retention_days: int = 90
    max_report_rows: int = 100_000

    # --- Geocodificación (contrato 1.2 §12.1) ---
    nominatim_url: str = "https://nominatim.openstreetmap.org"
    geocoding_enabled: bool = True
    geocoding_user_agent: str = "EcoMoveQueretaro/1.2 (proyecto academico)"
    geocoding_timeout_s: float = 6.0
    geocoding_cache_hours: int = 24
    geocoding_per_minute: int = 30

    # --- Bootstrap ---
    bootstrap_super_admin_email: str | None = None
    bootstrap_super_admin_password: SecretStr | None = None

    @model_validator(mode="after")
    def _check_secrets(self) -> "Settings":
        secret = self.jwt_secret_key.get_secret_value()
        if len(secret) < 32:
            raise ValueError("JWT_SECRET_KEY debe tener al menos 32 caracteres")
        if self.is_production:
            if "change-me" in secret:
                raise ValueError("JWT_SECRET_KEY de ejemplo no permitido en producción")
            if "*" in self.cors_origin_list:
                raise ValueError("CORS_ORIGINS no puede contener '*' en producción")
            if self.email_backend == "memory":
                raise ValueError("EMAIL_BACKEND=memory no está permitido en producción")
            if self.route_token_secret is None:
                raise ValueError("ROUTE_TOKEN_SECRET es obligatorio en producción")
        if self.route_token_secret is not None and len(self.route_token_secret.get_secret_value()) < 32:
            raise ValueError("ROUTE_TOKEN_SECRET debe tener al menos 32 caracteres")
        return self

    @property
    def is_production(self) -> bool:
        return self.api_env == "production"

    @property
    def database_url(self) -> str:
        if self.database_url_override:
            return self.database_url_override.get_secret_value()
        pwd = self.postgres_password.get_secret_value()
        return (
            f"postgresql+psycopg://{self.postgres_user}:{pwd}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def service_area(self) -> tuple[float, float, float, float]:
        return (self.service_area_min_lng, self.service_area_min_lat,
                self.service_area_max_lng, self.service_area_max_lat)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
