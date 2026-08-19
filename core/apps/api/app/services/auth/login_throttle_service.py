"""Login brute-force throttling (per account and per client IP).

Counts failed login attempts in Redis with a fixed window that is refreshed
on every failure (INCR + EXPIRE). Successful logins reset the per-account
counter; the per-IP counter is only cleared by the window expiring.

The throttle intentionally runs inside the login handler before credential
verification: throttled requests return 429 (RateLimitException with period
"login") while unthrottled failures keep the uniform 401 response, so the
throttle never leaks whether an account exists.
"""

from __future__ import annotations

from typing import Optional

from loguru import logger

from shared.core.config import settings
from shared.core.exceptions.domain_exceptions import RateLimitException
from shared.services.redis import RedisServiceFactory
from shared.services.redis.redis_service import RedisService

_ACCOUNT_KEY_TEMPLATE: str = "login:failures:account:{email}"
_IP_KEY_TEMPLATE: str = "login:failures:ip:{ip}"


class LoginThrottleService:
    """Redis-backed failed-login counter for the session login endpoint."""

    def __init__(self, redis_service: Optional[RedisService] = None) -> None:
        self._redis_service: Optional[RedisService] = redis_service

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def check(self, email: str, client_ip: str) -> None:
        """Raise RateLimitException when either counter is at its limit."""
        if not self._enabled:
            return

        try:
            account_count, account_ttl = await self._counter(
                _ACCOUNT_KEY_TEMPLATE.format(email=email)
            )
            ip_count, ip_ttl = await self._counter(
                _IP_KEY_TEMPLATE.format(ip=client_ip)
            )
        except Exception:
            logger.warning(
                "Login throttle check failed; failing open",
                exc_info=True,
            )
            return

        account_limit = settings.LOGIN_FAILURE_LIMIT_PER_ACCOUNT
        ip_limit = settings.LOGIN_FAILURE_LIMIT_PER_IP

        if account_count >= account_limit:
            raise RateLimitException(
                retry_after=max(1, account_ttl),
                limit=account_limit,
                period="login",
                internal_message=(
                    f"Too many failed login attempts for account {email!r}"
                ),
            )
        if ip_count >= ip_limit:
            raise RateLimitException(
                retry_after=max(1, ip_ttl),
                limit=ip_limit,
                period="login",
                internal_message=(
                    f"Too many failed login attempts from client IP {client_ip!r}"
                ),
            )

    async def record_failure(self, email: str, client_ip: str) -> None:
        """Increment both counters after a failed login attempt."""
        if not self._enabled:
            return

        try:
            window = settings.LOGIN_FAILURE_WINDOW_SECONDS
            await self._increment(_ACCOUNT_KEY_TEMPLATE.format(email=email), window)
            await self._increment(_IP_KEY_TEMPLATE.format(ip=client_ip), window)
        except Exception:
            logger.warning(
                "Login throttle failure recording failed; skipping",
                exc_info=True,
            )

    async def record_success(self, email: str) -> None:
        """Reset the per-account counter after a successful login."""
        if not self._enabled:
            return

        try:
            await self._redis().delete(_ACCOUNT_KEY_TEMPLATE.format(email=email))
        except Exception:
            logger.warning(
                "Login throttle success reset failed; skipping",
                exc_info=True,
            )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @property
    def _enabled(self) -> bool:
        return bool(settings.LOGIN_THROTTLE_ENABLED)

    def _redis(self) -> RedisService:
        if self._redis_service is None:
            self._redis_service = RedisServiceFactory.get_service()
        return self._redis_service

    async def _counter(self, key: str) -> tuple[int, int]:
        """Return (current count, remaining TTL in seconds) for a key."""
        redis = self._redis()
        client = await redis._get_client()  # noqa: SLF001 - shared pattern
        full_key = redis._build_key(key)  # noqa: SLF001 - shared pattern

        raw_count = await client.get(full_key)
        ttl = await client.ttl(full_key)

        count = int(raw_count) if raw_count is not None else 0
        if ttl is None or ttl < 1:
            ttl = settings.LOGIN_FAILURE_WINDOW_SECONDS
        return count, int(ttl)

    async def _increment(self, key: str, window: int) -> None:
        """INCR the counter and refresh its EXPIRE window atomically."""
        redis = self._redis()
        client = await redis._get_client()  # noqa: SLF001 - shared pattern
        full_key = redis._build_key(key)  # noqa: SLF001 - shared pattern

        async with client.pipeline() as pipe:
            await pipe.incr(full_key)
            await pipe.expire(full_key, window)
            await pipe.execute()
