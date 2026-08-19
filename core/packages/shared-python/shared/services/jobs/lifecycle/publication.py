from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from loguru import logger
from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.models.database.job import Job
from shared.models.schemas.job_metadata import JobMetadataHelper
from shared.services.redis.redis_sync_service import SyncRedisServiceFactory
from shared.services.retrieval.publication_service import RetrievalPublicationService
from shared.services.retrieval.publication_models import PublishedDocumentState


@dataclass(frozen=True)
class RetrievalCacheInvalidation:
    job_id: str


@dataclass(frozen=True)
class JobPublicationOutcome:
    published_document_state: PublishedDocumentState | None
    cache_invalidation: RetrievalCacheInvalidation | None


class SyncJobPublicationFinalizer:
    """Publish terminal parse results and invalidate retrieval cache after commit."""

    def __init__(
        self,
        *,
        retrieval_publication: RetrievalPublicationService | None = None,
    ) -> None:
        self._retrieval_publication = (
            retrieval_publication or RetrievalPublicationService()
        )

    def publish_result(
        self,
        db: Session,
        *,
        job_id: str,
        job_result_id: str,
        chunks: list[dict[str, Any]],
        section_summaries: dict[str, str] | None,
        document_top_summary: str | None = None,
    ) -> JobPublicationOutcome:
        self._retrieval_publication.get_existing_document_scope(
            db,
            job_id=job_id,
        )
        job = db.execute(select(Job).where(Job.job_id == job_id)).scalar_one_or_none()
        attributes = None
        if job is not None and isinstance(job.job_metadata, dict):
            raw_attributes = job.job_metadata.get("attributes")
            attributes = raw_attributes if isinstance(raw_attributes, dict) else None
        published_document_state = self._retrieval_publication.publish_document_state(
            db,
            job_id=job_id,
            job_result_id=job_result_id,
            chunks=chunks,
            section_summaries=section_summaries,
            attributes=attributes,
        )
        if _should_publish_document_graph(published_document_state):
            assert published_document_state is not None
            self._retrieval_publication.publish_document_graph(
                db,
                job_id=job_id,
                job_result_id=job_result_id,
                top_summary=document_top_summary,
            )

        cache_invalidation = self._build_cache_invalidation(
            db,
            job_id=job_id,
        )
        return JobPublicationOutcome(
            published_document_state=published_document_state,
            cache_invalidation=cache_invalidation,
        )

    def invalidate_cache_after_commit(
        self,
        cache_invalidation: RetrievalCacheInvalidation | None,
    ) -> None:
        if not cache_invalidation:
            return

        try:
            redis_service = SyncRedisServiceFactory.get_service()
            redis_service.incr("retrieval:version")
        except Exception as exc:
            logger.warning(
                "Failed to invalidate retrieval cache after publication "
                f"(ignored): job_id={cache_invalidation.job_id}, error={exc}"
            )

    def _build_cache_invalidation(
        self,
        db: Session,
        *,
        job_id: str,
    ) -> RetrievalCacheInvalidation | None:
        job = db.execute(select(Job).where(Job.job_id == job_id)).scalar_one_or_none()
        if not job:
            return None

        return RetrievalCacheInvalidation(job_id=job_id)


def _should_publish_document_graph(
    published_document_state: PublishedDocumentState | None,
) -> bool:
    return (
        published_document_state is not None
        and not published_document_state.skipped_all_duplicate
    )
