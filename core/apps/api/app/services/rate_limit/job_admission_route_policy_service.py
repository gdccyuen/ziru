from __future__ import annotations

from app.services.rate_limit.config import RateLimitConfig
from app.services.rate_limit.data_structures import RouteAdmissionContext
from app.services.rate_limit.limiter import RateLimiter
from app.services.rate_limit.system_limit import find_system_rule

from shared.core.exceptions.domain_exceptions import (
    RateLimitException,
    UnavailableException,
)

_RETRY_AFTER_SECONDS: int = 15


class JobAdmissionRoutePolicyService:
    async def enforce_user_system_limit(
        self,
        *,
        route_context: RouteAdmissionContext,
        config: RateLimitConfig,
        user_id: str,
    ) -> None:
        rule = find_system_rule(
            route_context.method,
            route_context.path,
            config.system_rules,
        )
        limiter = RateLimiter(config)
        await limiter.check_system_limit(
            identifier=user_id,
            limit=rule.limit,
            matched_pattern=rule.api_pattern,
            period=rule.period,
        )

    async def enforce_route_system_limit(
        self,
        *,
        route_context: RouteAdmissionContext,
    ) -> None:
        config = RateLimitConfig.get_instance()
        if not config.is_enabled:
            return

        route_identifier = route_context.limit_identifier
        rule = find_system_rule(
            route_context.method,
            route_context.path,
            config.system_rules,
        )
        limiter = RateLimiter(config)

        try:
            await limiter.check_system_limit(
                identifier=route_identifier,
                limit=rule.limit,
                matched_pattern=rule.api_pattern,
                period=rule.period,
                use_global_key=True,
            )
        except RateLimitException:
            raise
        except Exception as exc:
            raise UnavailableException(
                internal_message=(f"Redis error in route system limit: {exc}"),
                retry_after=_RETRY_AFTER_SECONDS,
                limit=rule.limit,
                period=rule.period,
            )
