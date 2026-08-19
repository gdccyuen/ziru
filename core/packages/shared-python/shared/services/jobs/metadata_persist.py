"""Worker-side job_metadata persistence (DB row + Redis cache)."""

from __future__ import annotations

from typing import Any

from loguru import logger
from sqlalchemy import select

from shared.core.database_sync import get_sync_db_context
from shared.models.database.job import Job
from shared.services.redis.redis_sync_service import (
    SyncJobMetadataService,
    SyncRedisServiceFactory,
)


def merge_job_metadata(job_id: str, updates: dict[str, Any]) -> None:
    """Merge ``updates`` into job.job_metadata (DB row) and the Redis cache.

    Best-effort: failures are logged and do not raise, so provenance
    metadata can never take down ingestion.
    """
    try:
        with get_sync_db_context() as db:
            job = db.execute(
                select(Job).where(Job.job_id == job_id)
            ).scalar_one_or_none()
            if job is not None:
                metadata = dict(job.job_metadata or {})
                metadata.update(updates)
                job.job_metadata = metadata
    except Exception as exc:
        logger.warning(
            f"Failed to persist job_metadata row for {job_id}: {exc}"
        )
    try:
        SyncJobMetadataService(
            SyncRedisServiceFactory.get_service()
        ).update_metadata(job_id, updates)
    except Exception as exc:
        logger.warning(
            f"Failed to persist job_metadata cache for {job_id}: {exc}"
        )
