"""
Canonical retrieval publication service.

This module owns the retrieval-specific publication work that happens during
job finalization. The job lifecycle service should orchestrate transaction
boundaries and call this service, not define retrieval state construction.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from loguru import logger
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from shared.models.database.document import Document
from shared.models.database.document_attribute import DocumentAttribute
from shared.models.database.job import Job
from shared.models.database.job_result import JobResult
from shared.services.profile import BUILTIN_ATTRIBUTE_KEYS
from shared.models.schemas.job_metadata import JobMetadataHelper
from shared.services.retrieval.graph.service import DocumentGraphService
from shared.services.retrieval.publication_content import (
    replace_document_revision_content,
)
from shared.services.retrieval.publication_models import (
    DocumentPublicationScope,
    ExistingDocumentScope,
    PublishedDocumentState,
)


def utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class RetrievalPublicationService:
    # ── Public API ──────────────────────────────────────────────────────

    def get_existing_document_scope(
        self,
        db: Session,
        *,
        job_id: str,
    ) -> ExistingDocumentScope | None:
        job = db.execute(select(Job).where(Job.job_id == job_id)).scalar_one_or_none()
        if not job:
            return None

        metadata = job.job_metadata or {}
        document_id = metadata.get("document_id")
        if not document_id:
            return None

        document = db.execute(
            select(Document).where(Document.document_id == document_id)
        ).scalar_one_or_none()
        if not document:
            return None

        return ExistingDocumentScope(document_id=document.document_id)

    def publish_document_state(
        self,
        db: Session,
        *,
        job_id: str,
        job_result_id: str,
        chunks: list[dict[str, Any]],
        section_summaries: dict[str, str] | None = None,
        attributes: dict[str, list[str]] | None = None,
    ) -> PublishedDocumentState | None:
        job = db.execute(select(Job).where(Job.job_id == job_id)).scalar_one_or_none()
        if not job:
            logger.warning(f"Job not found for document publication: {job_id}")
            return None

        return self._publish_document_state_for_job(
            db,
            job=job,
            job_result_id=job_result_id,
            chunks=chunks,
            section_summaries=section_summaries,
            attributes=attributes,
        )

    def _publish_document_state_for_job(
        self,
        db: Session,
        *,
        job: Job,
        job_result_id: str,
        chunks: list[dict[str, Any]],
        section_summaries: dict[str, str] | None = None,
        attributes: dict[str, list[str]] | None = None,
    ) -> PublishedDocumentState | None:

        job_metadata = job.job_metadata or {}
        if attributes is None:
            raw_attributes = job_metadata.get("attributes")
            attributes = (
                raw_attributes if isinstance(raw_attributes, dict) else None
            )
        document_id = job_metadata.get("document_id")
        parse_track = str(job_metadata.get("parse_track") or "chunk")
        source_file_name = job_metadata.get("source_file_name") or job_metadata.get(
            "file_name"
        )
        document_metadata = JobMetadataHelper.get_document_metadata(job_metadata)

        deduped_chunks = chunks

        # If ALL chunks are duplicates → skip document creation entirely
        if not deduped_chunks:
            logger.warning(
                f"⏭️  All chunks are duplicates of existing documents. "
                f"Skipping document creation for job_id={job.job_id}."
            )
            return PublishedDocumentState(
                document_id=None,
                skipped_all_duplicate=True,
            )

        document = self._upsert_document_revision(
            db,
            job=job,
            job_result_id=job_result_id,
            document_id=str(document_id) if document_id else None,
            parse_track=parse_track,
            source_file_name=str(source_file_name) if source_file_name else None,
            document_metadata=document_metadata,
        )
        if document is None:
            return None

        self._bind_job_result_document(
            db,
            job_result_id=job_result_id,
            document_id=document.document_id,
        )
        file_hash = str(job_metadata.get("file_hash") or "").strip() or None
        original_file_key = (
            str(job_metadata.get("original_file_key") or "").strip() or None
        )
        self._replace_document_attributes(
            db,
            document_id=document.document_id,
            attributes=attributes,
            user_id=str(job.user_id) if job.user_id else "",
            file_hash=file_hash,
            original_file_key=original_file_key,
        )
        scope = DocumentPublicationScope(
            document_id=document.document_id,
            job_result_id=job_result_id,
            source_file_name=str(source_file_name) if source_file_name else None,
        )
        replace_document_revision_content(
            db,
            scope=scope,
            chunks=deduped_chunks,
            section_summaries=section_summaries,
        )

        db.flush()
        return PublishedDocumentState(document_id=document.document_id)

    def _upsert_document_revision(
        self,
        db: Session,
        *,
        job: Job,
        job_result_id: str,
        document_id: str | None,
        parse_track: str,
        source_file_name: str | None,
        document_metadata: dict[str, Any],
    ) -> Document | None:
        document = None
        if document_id:
            document = db.execute(
                select(Document)
                .where(Document.document_id == document_id)
                .with_for_update()
            ).scalar_one_or_none()

        if document is None:
            document = Document(
                document_id=document_id or f"doc_{uuid4().hex[:12]}",
                status="active",
                current_job_result_id=job_result_id,
                source_file_name=source_file_name,
                document_metadata=document_metadata,
                parse_track=parse_track,
            )
            db.add(document)
        else:
            if self._is_stale_document_completion(
                db,
                document=document,
                job=job,
            ):
                logger.warning(
                    "Skipping stale document publication: "
                    f"job_id={job.job_id}, document_id={document.document_id}"
                )
                return None
            document.status = "active"
            document.archived_at = None
            document.current_job_result_id = job_result_id
            document.source_file_name = source_file_name or document.source_file_name
            if document_metadata:
                document.document_metadata = document_metadata
            document.parse_track = parse_track or document.parse_track
            document.updated_at = utc_now_naive()

        db.flush()
        return document

    def _replace_document_attributes(
        self,
        db: Session,
        *,
        document_id: str,
        attributes: dict[str, list[str]] | None,
        user_id: str,
        file_hash: str | None = None,
        original_file_key: str | None = None,
    ) -> None:
        """Replace document_attributes rows and ensure built-ins exist.

        Built-in keys supplied by callers are skipped; createBy/createTime,
        fileHash and originalFile are always (re)created by the system
        (Q16/Q17, upload provenance).
        """
        db.execute(
            delete(DocumentAttribute).where(
                DocumentAttribute.document_id == document_id
            )
        )
        rows: list[DocumentAttribute] = []
        seen: set[tuple[str, str]] = set()
        for key, values in (attributes or {}).items():
            if key in BUILTIN_ATTRIBUTE_KEYS or not isinstance(values, list):
                continue
            for value in values:
                pair = (str(key), str(value))
                if pair in seen:
                    continue
                seen.add(pair)
                rows.append(
                    DocumentAttribute(
                        document_id=document_id,
                        attr_key=pair[0],
                        attr_value=pair[1],
                    )
                )
        rows.append(
            DocumentAttribute(
                document_id=document_id,
                attr_key="createBy",
                attr_value=user_id,
            )
        )
        rows.append(
            DocumentAttribute(
                document_id=document_id,
                attr_key="createTime",
                attr_value=utc_now_naive().isoformat(),
            )
        )
        if file_hash:
            rows.append(
                DocumentAttribute(
                    document_id=document_id,
                    attr_key="fileHash",
                    attr_value=file_hash,
                )
            )
        if original_file_key:
            rows.append(
                DocumentAttribute(
                    document_id=document_id,
                    attr_key="originalFile",
                    attr_value=original_file_key,
                )
            )
        db.add_all(rows)

    def _bind_job_result_document(
        self,
        db: Session,
        *,
        job_result_id: str,
        document_id: str,
    ) -> None:
        result = db.execute(select(JobResult).where(JobResult.id == job_result_id))
        job_result = result.scalar_one_or_none()
        if job_result:
            job_result.document_id = document_id

    def publish_document_graph(
        self,
        db: Session,
        *,
        job_id: str,
        job_result_id: str,
        top_summary: str | None = None,
    ) -> None:
        job = db.execute(select(Job).where(Job.job_id == job_id)).scalar_one_or_none()
        if not job:
            raise RuntimeError(f"Job not found for graph publication: {job_id}")

        self._publish_document_graph_for_job(
            db,
            job=job,
            job_result_id=job_result_id,
            top_summary=top_summary,
        )

    def _publish_document_graph_for_job(
        self,
        db: Session,
        *,
        job: Job,
        job_result_id: str,
        top_summary: str | None = None,
    ) -> None:

        metadata = job.job_metadata or {}
        document_id = metadata.get("document_id")
        if not document_id:
            document = db.execute(
                select(Document).where(Document.current_job_result_id == job_result_id)
            ).scalar_one_or_none()
            document_id = document.document_id if document else None
        if not document_id:
            raise RuntimeError(
                f"Document not found for graph publication: job_id={job.job_id}"
            )

        DocumentGraphService().publish_document_graph(
            db,
            document_id=document_id,
            job_result_id=job_result_id,
            top_summary=top_summary,
        )

    def remove_document_graph(
        self,
        db: Session,
        *,
        document_id: str,
    ) -> None:
        DocumentGraphService().remove_document_graph(
            db,
            document_id=document_id,
        )

    def _is_stale_document_completion(
        self,
        db: Session,
        *,
        document: Document,
        job: Job,
    ) -> bool:
        current_job_result_id = getattr(document, "current_job_result_id", None)
        if not current_job_result_id:
            return False

        current_job_result = db.execute(
            select(JobResult).where(JobResult.id == current_job_result_id)
        ).scalar_one_or_none()
        current_job_id = getattr(current_job_result, "job_id", None)
        if current_job_result is None or not current_job_id:
            return False

        current_job = db.execute(
            select(Job).where(Job.job_id == current_job_id)
        ).scalar_one_or_none()
        if current_job is None:
            return False

        current_created_at = getattr(current_job, "created_at", None)
        candidate_created_at = getattr(job, "created_at", None)
        if current_created_at is None or candidate_created_at is None:
            return False

        return current_created_at > candidate_created_at
