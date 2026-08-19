"""Application configuration — assembles all config components."""

from typing import Callable, cast

from pydantic import Field
from pydantic_settings import SettingsConfigDict

from .ai import AIConfig
from .base import BaseConfig
from .celery import CeleryConfig
from .database import DatabaseConfig
from .job import JobConfig
from .mineru import MineruConfig
from .qstash import QStashConfig
from .redis import RedisConfig, RedisConfigManager, RedisPoolManager
from .storage import StorageConfig


class AppConfig(
    BaseConfig,
    DatabaseConfig,
    RedisConfig,
    CeleryConfig,
    QStashConfig,
    StorageConfig,
    AIConfig,
    MineruConfig,
    JobConfig,
):
    """Application configuration — all config components merged."""

    # Moved here from the retired billing config (07): storage/URL settings
    # that are NOT billing-only.
    S3_RESULTS_BUCKET: str = Field(default="", description="S3 results bucket")
    FRONTEND_URL: str = Field(
        default="http://localhost:3000",
        description="Frontend URL for callback redirects",
    )

    # Account bootstrap (P2).
    ADMIN_BOOTSTRAP_EMAIL: str = Field(
        default="admin@ziru.local",
        description="Email of the bootstrap administrator created when users is empty",
    )
    ADMIN_BOOTSTRAP_PASSWORD: str = Field(
        default="P@ss202607",
        description="Password of the bootstrap administrator (change on first login)",
    )
    SESSION_TTL_DAYS: int = Field(
        default=30, ge=1, description="Session cookie/session-row lifetime in days"
    )
    SESSION_COOKIE_SECURE: bool = Field(
        default=False,
        description="Mark the ziru_session cookie Secure (requires HTTPS)",
    )

    # Login brute-force throttling (P2 security hardening).
    LOGIN_THROTTLE_ENABLED: bool = Field(
        default=True,
        description="Enable per-account and per-client-IP failed-login throttling",
    )
    LOGIN_FAILURE_LIMIT_PER_ACCOUNT: int = Field(
        default=5, ge=1, description="Failed logins per account before throttling"
    )
    LOGIN_FAILURE_LIMIT_PER_IP: int = Field(
        default=20, ge=1, description="Failed logins per client IP before throttling"
    )
    LOGIN_FAILURE_WINDOW_SECONDS: int = Field(
        default=900, ge=1, description="Failed-login counting window in seconds"
    )

    # SSO OIDC (P2, ticket 03; Q26/Q28 — admin pre-link only).
    SSO_OIDC_ISSUER: str = Field(
        default="", description="OIDC issuer URL; empty disables the OIDC flow"
    )
    SSO_OIDC_CLIENT_ID: str = Field(default="", description="OIDC client id")
    SSO_OIDC_CLIENT_SECRET: str = Field(
        default="", description="OIDC client secret"
    )
    SSO_OIDC_SCOPE: str = Field(
        default="openid email profile", description="OIDC requested scopes"
    )
    SSO_OIDC_REDIRECT_URI: str = Field(
        default="http://localhost:5005/api/v1/auth/sso/oidc/callback",
        description="OIDC redirect URI (must match the IdP registration)",
    )
    SSO_SUCCESS_REDIRECT: str = Field(
        default="http://localhost:3000",
        description="Frontend URL a successful SSO login redirects to",
    )

    def validate_all(self) -> bool:
        """Validate the combined application configuration."""
        validations = [
            self.validate_file_paths(),
            self.validate_database_config(),
            self.validate_redis_config(),
        ]

        return all(validations)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


# Create the shared application config instance.
app_config = cast(Callable[[], AppConfig], AppConfig)()

# Backward-compatible alias.
settings = app_config

# Create the Redis connection-pool manager.
redis_pool_manager = RedisPoolManager(app_config)

# Create the Redis config manager.
redis_config_manager = RedisConfigManager(app_config)
