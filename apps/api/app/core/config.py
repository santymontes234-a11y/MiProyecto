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
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
