"""
Startup rule loader for rate limit configuration.

Queries system_limits from the database and updates the RateLimitConfig
singleton during application startup. The tier_limits table was removed
with the billing domain (07).
"""

from app.services.rate_limit.config import RateLimitConfig
from app.services.rate_limit.data_structures import SystemLimitRule
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models.database.system_limit import SystemLimit


async def _fetch_system_rules(
    db: AsyncSession,
) -> list[SystemLimitRule]:
    """Query system_limits table ordered by priority ASC."""
    stmt = select(SystemLimit).order_by(SystemLimit.priority.asc())
    result = await db.execute(stmt)
    rows = result.scalars().all()

    system_rules: list[SystemLimitRule] = []
    for row in rows:
        system_rules.append(
            SystemLimitRule(
                method=row.method,
                api_pattern=row.api_pattern,
                priority=row.priority,
                limit=row.rpm,
                period=getattr(row, "period", "minute"),
            )
        )

    return system_rules


async def load_rules(db: AsyncSession) -> None:
    """
    Load rate limit rules from DB and update in-memory config.

    Called once at application startup.
    """
    try:
        system_rules = await _fetch_system_rules(db)

        config = RateLimitConfig.get_instance()
        config.update_rules(system_rules)
    except Exception as exc:
        logger.error(
            "Failed to load rate limit rules",
            error=str(exc),
        )
        raise
