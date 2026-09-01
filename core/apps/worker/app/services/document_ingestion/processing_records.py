from __future__ import annotations

from datetime import datetime

from app.services.document_ingestion.page_estimator import WorkloadEstimate
from app.services.document_ingestion.processing_context import ParseJobContext
from sqlalchemy import select

from shared.core.database_sync import get_sync_db_context
from shared.models.database.job import Job


def estimate_duration_seconds(page_count: int) -> int:
    """Estimate total parse duration from the known page count.

    PM-approved heuristic: 90 + pages*2 + max(0, round(pages*0.5))*8
    plus 600 seconds for documents over 150 pages.
    """
    pages = max(0, int(page_count))
    page_batch_seconds = max(0, round(pages * 0.5)) * 8
    oversized_penalty = 600 if pages > 150 else 0
    return 90 + pages * 2 + page_batch_seconds + oversized_penalty


def record_workload_estimate(
    *,
    job_id: str,
    workload_estimate: WorkloadEstimate,
) -> None:
    """Persist the workload estimate (page count) for a job.

    Used on both the normal and skipped (oversized-PDF) paths; page count
    feeds the oversized-PDF policy.
    """
    page_count = workload_estimate.page_count
    with get_sync_db_context() as db:
        job_result = db.execute(
            select(Job).where(Job.job_id == job_id).with_for_update()
        )
        job = job_result.scalar_one_or_none()
        if job:
            job.page_count = page_count


def record_processing_start(
    *,
    job_id: str,
    job_context: ParseJobContext,
    processing_started_at: datetime,
    workload_estimate: WorkloadEstimate,
    extra_metadata: dict[str, object] | None = None,
) -> None:
    """Record processing-start metadata (timing + workload estimation)."""
    metadata_updates: dict[str, object] = {
        "page_count": workload_estimate.page_count,
        "processing_started_at": processing_started_at.isoformat(),
        "workload_estimate_method": workload_estimate.method,
        "estimated_duration_s": estimate_duration_seconds(
            workload_estimate.page_count
        ),
    }
    if workload_estimate.fallback_reason is not None:
        metadata_updates["workload_estimate_fallback_reason"] = (
            workload_estimate.fallback_reason
        )
    if extra_metadata is not None:
        metadata_updates.update(extra_metadata)
    with get_sync_db_context() as db:
        job_result = db.execute(
            select(Job).where(Job.job_id == job_id).with_for_update()
        )
        job = job_result.scalar_one_or_none()
        if job:
            job.job_metadata = {
                **dict(job.job_metadata or {}),
                **metadata_updates,
            }
    job_context.metadata_service.update_metadata(job_id, metadata_updates)
    job_context.job_metadata.update(metadata_updates)
