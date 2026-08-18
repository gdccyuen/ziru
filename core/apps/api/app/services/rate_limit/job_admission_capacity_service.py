from __future__ import annotations

from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.rate_limit.config import CONCURRENCY_RETRY_AFTER_SECONDS
from shared.core.config import settings
from shared.core.exceptions.domain_exceptions import RateLimitException
from shared.core.state_machine.states import JobStatus
from shared.models.database.job import Job

_ACTIVE_JOB_STATES: tuple[str, ...] = (
    JobStatus.WAITING_FILE.value,
    JobStatus.PENDING.value,
    JobStatus.RUNNING.value,
    JobStatus.CONVERTING.value,
)


class JobAdmissionCapacityService:
    """Simple global concurrent-job cap (Q4, ticket 07).

    Replaces the retired billing/tier admission machinery. The cap is
    MAX_CONCURRENT_JOBS (default 4; 0 or -1 = unlimited) and is GLOBAL
    by default — a per-user variant is a one-line WHERE change later.
    """

    async def enforce_job_capacity(self, *, db: AsyncSession) -> None:
        max_concurrent_jobs = settings.MAX_CONCURRENT_JOBS
        if max_concurrent_jobs in (0, -1):
            return

        active_jobs = await self._count_non_terminal_jobs(db=db)
        if active_jobs < max_concurrent_jobs:
            return

        retry_after_seconds = CONCURRENCY_RETRY_AFTER_SECONDS
        exc = RateLimitException(
            retry_after=retry_after_seconds,
            limit=max_concurrent_jobs,
            period="concurrent",
            user_message=(
                f"Too many concurrent jobs ({active_jobs}/{max_concurrent_jobs} "
                f"active). Please retry after {retry_after_seconds} seconds."
            ),
            internal_message=(
                "Concurrency limit exceeded: "
                f"active_jobs={active_jobs}, limit={max_concurrent_jobs}"
            ),
        )
        exc.details.update(
            {
                "active_jobs": active_jobs,
                "available_slots": 0,
            }
        )
        logger.warning(
            "Job capacity exceeded: active_jobs={}, limit={}",
            active_jobs,
            max_concurrent_jobs,
        )
        raise exc

    async def _count_non_terminal_jobs(self, *, db: AsyncSession) -> int:
        result = await db.execute(
            select(func.count(Job.job_id)).where(Job.status.in_(_ACTIVE_JOB_STATES))
        )
        return int(result.scalar_one() or 0)
