"""
Document data access for retrieval document lifecycle flows.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Sequence, cast

from sqlalchemy import func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models.database.document import Document, DocumentChunk, DocumentSection
from shared.models.database.document_attribute import DocumentAttribute
from shared.models.database.job import Job
from shared.models.database.job_result import JobResult
from shared.models.database.user import User
from shared.services.profile import (
    ProfileConstraint,
    build_profile_scope_clause,
)

DocumentChunkRow = tuple[DocumentChunk, DocumentSection | None, JobResult]
DocumentJobRevisionRow = tuple[Document, JobResult, Job]


class DocumentRepository:
    async def list_documents(
        self,
        db: AsyncSession,
        *,
        limit: int,
        offset: int,
    ) -> Sequence[Document]:
        result = await db.execute(
            select(Document)
            .where(Document.status != "archived")
            .order_by(Document.updated_at.desc(), Document.document_id.asc())
            .limit(limit)
            .offset(offset)
        )
        return result.scalars().all()

    async def count_documents(
        self,
        db: AsyncSession,
    ) -> int:
        result = await db.execute(
            select(func.count(Document.document_id))
            .where(Document.status != "archived")
        )
        return int(result.scalar_one())

    async def list_documents_matching(
        self,
        db: AsyncSession,
        *,
        constraints: list[ProfileConstraint],
        limit: int,
        offset: int,
    ) -> Sequence[Document]:
        statement = select(Document).where(Document.status != "archived")
        scope_clause = build_profile_scope_clause(
            constraints,
            document_id_column=Document.document_id,
            attribute_table=DocumentAttribute,
        )
        if scope_clause is not None:
            statement = statement.where(scope_clause)
        result = await db.execute(
            statement.order_by(
                Document.updated_at.desc(), Document.document_id.asc()
            )
            .limit(limit)
            .offset(offset)
        )
        return result.scalars().all()

    async def count_documents_matching(
        self,
        db: AsyncSession,
        *,
        constraints: list[ProfileConstraint],
    ) -> int:
        statement = (
            select(func.count(Document.document_id))
            .where(Document.status != "archived")
        )
        scope_clause = build_profile_scope_clause(
            constraints,
            document_id_column=Document.document_id,
            attribute_table=DocumentAttribute,
        )
        if scope_clause is not None:
            statement = statement.where(scope_clause)
        result = await db.execute(statement)
        return int(result.scalar_one())

    async def get_document_attributes_map(
        self,
        db: AsyncSession,
        *,
        document_ids: Sequence[str],
    ) -> dict[str, dict[str, list[str]]]:
        """Aggregate document_attributes rows into {doc_id: {key: [values]}}."""
        attributes_map: dict[str, dict[str, list[str]]] = {}
        if not document_ids:
            return attributes_map
        result = await db.execute(
            select(
                DocumentAttribute.document_id,
                DocumentAttribute.attr_key,
                DocumentAttribute.attr_value,
            )
            .where(DocumentAttribute.document_id.in_(list(document_ids)))
            .order_by(DocumentAttribute.created_at.asc(), DocumentAttribute.id.asc())
        )
        for document_id, attr_key, attr_value in result.all():
            attributes_map.setdefault(document_id, {}).setdefault(attr_key, []).append(
                attr_value
            )
        return attributes_map

    async def get_user_emails_by_ids(
        self,
        db: AsyncSession,
        *,
        user_ids: Sequence[str],
    ) -> dict[str, str]:
        """Resolve user ids to emails with one query (creator_email lookup)."""
        if not user_ids:
            return {}
        result = await db.execute(
            select(User.id, User.email).where(User.id.in_(list(set(user_ids))))
        )
        return {user_id: email for user_id, email in result.all()}

    async def get_document(
        self,
        db: AsyncSession,
        *,
        document_id: str,
    ) -> Document | None:
        result = await db.execute(
            select(Document)
            .where(Document.document_id == document_id)
        )
        return result.scalar_one_or_none()

    async def list_document_sections(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        job_result_id: str,
    ) -> Sequence[DocumentSection]:
        result = await db.execute(
            select(DocumentSection)
            .where(DocumentSection.document_id == document_id)
            .where(DocumentSection.job_result_id == job_result_id)
            .order_by(
                DocumentSection.sort_order.asc(),
                DocumentSection.section_level.asc(),
                DocumentSection.section_path.asc(),
                DocumentSection.section_id.asc(),
            )
        )
        return result.scalars().all()

    async def list_current_sections_by_document(
        self,
        db: AsyncSession,
        *,
        documents: Sequence[Document],
    ) -> dict[str, Sequence[DocumentSection]]:
        """Batch-load the current revision's sections for many documents.

        One query for the whole page (no N+1), keyed by ``document_id``.
        """
        pairs = [
            (document.document_id, document.current_job_result_id)
            for document in documents
            if document.current_job_result_id
        ]
        if not pairs:
            return {}
        result = await db.execute(
            select(DocumentSection)
            .where(
                tuple_(
                    DocumentSection.document_id,
                    DocumentSection.job_result_id,
                ).in_(pairs)
            )
            .order_by(
                DocumentSection.document_id.asc(),
                DocumentSection.sort_order.asc(),
                DocumentSection.section_level.asc(),
                DocumentSection.section_path.asc(),
                DocumentSection.section_id.asc(),
            )
        )
        grouped: dict[str, list[DocumentSection]] = {}
        for section in result.scalars().all():
            grouped.setdefault(section.document_id, []).append(section)
        return grouped

    async def count_document_chunks_by_section(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        job_result_id: str,
    ) -> dict[str, int]:
        result = await db.execute(
            select(DocumentChunk.section_id, func.count(DocumentChunk.id))
            .where(DocumentChunk.document_id == document_id)
            .where(DocumentChunk.job_result_id == job_result_id)
            .where(DocumentChunk.section_id.is_not(None))
            .group_by(DocumentChunk.section_id)
        )
        return {section_id: int(count) for section_id, count in result.all()}

    async def list_first_document_chunks_per_section(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        job_result_id: str,
    ) -> Sequence[DocumentChunk]:
        result = await db.execute(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document_id)
            .where(DocumentChunk.job_result_id == job_result_id)
            .where(DocumentChunk.section_id.is_not(None))
            .where(func.lower(DocumentChunk.chunk_type) == "text")
            .distinct(DocumentChunk.section_id)
            .order_by(
                DocumentChunk.section_id.asc(),
                DocumentChunk.sort_order.asc(),
                DocumentChunk.id.asc(),
            )
        )
        return result.scalars().all()

    async def list_document_chunks_by_section(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        job_result_id: str,
        section_ids: Sequence[str],
        limit_per_section: int,
    ) -> dict[str, list[DocumentChunk]]:
        """Return up to `limit_per_section` text chunks per section.

        The response is bounded per section even though the underlying query
        reads all text chunks for the requested revision; group slicing keeps
        the section payload small for very large documents.
        """
        chunks_by_section: dict[str, list[DocumentChunk]] = {}
        if not section_ids:
            return chunks_by_section
        result = await db.execute(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document_id)
            .where(DocumentChunk.job_result_id == job_result_id)
            .where(DocumentChunk.section_id.in_(list(section_ids)))
            .where(func.lower(DocumentChunk.chunk_type) == "text")
            .order_by(
                DocumentChunk.section_id.asc(),
                DocumentChunk.sort_order.asc(),
                DocumentChunk.id.asc(),
            )
        )
        for chunk in result.scalars().all():
            if chunk.section_id is None:
                continue
            bucket = chunks_by_section.setdefault(chunk.section_id, [])
            if len(bucket) < limit_per_section:
                bucket.append(chunk)
        return chunks_by_section

    async def get_current_document_job_revision(
        self,
        db: AsyncSession,
        *,
        document_id: str,
    ) -> DocumentJobRevisionRow | None:
        stmt = (
            select(Document, JobResult, Job)
            .join(JobResult, JobResult.id == Document.current_job_result_id)
            .join(Job, Job.job_id == JobResult.job_id)
            .where(Document.document_id == document_id)
            .where(JobResult.document_id == Document.document_id)
            .where(Document.status != "archived")
            .limit(1)
        )

        result = await db.execute(stmt)
        row = result.first()
        return cast(DocumentJobRevisionRow | None, row)

    async def archive_document(
        self,
        db: AsyncSession,
        *,
        document: Document,
    ) -> Document:
        document.status = "archived"
        document.archived_at = datetime.now(timezone.utc).replace(tzinfo=None)
        return document

    async def count_current_document_chunks(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        job_result_id: str,
        chunk_type: str | None = None,
    ) -> int:
        stmt = (
            select(func.count(DocumentChunk.id))
            .where(DocumentChunk.document_id == document_id)
            .where(DocumentChunk.job_result_id == job_result_id)
        )
        if chunk_type is not None:
            stmt = stmt.where(func.lower(DocumentChunk.chunk_type) == chunk_type)

        result = await db.execute(stmt)
        return int(result.scalar_one())

    async def list_current_document_chunks(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        job_result_id: str,
        limit: int,
        offset: int,
        chunk_type: str | None = None,
    ) -> Sequence[DocumentChunkRow]:
        stmt = (
            select(DocumentChunk, DocumentSection, JobResult)
            .outerjoin(
                DocumentSection,
                DocumentSection.section_id == DocumentChunk.section_id,
            )
            .join(JobResult, JobResult.id == DocumentChunk.job_result_id)
            .where(DocumentChunk.document_id == document_id)
            .where(DocumentChunk.job_result_id == job_result_id)
            .order_by(
                DocumentChunk.sort_order.asc(),
                DocumentChunk.created_at.asc(),
                DocumentChunk.id.asc(),
            )
            .limit(limit)
            .offset(offset)
        )
        if chunk_type is not None:
            stmt = stmt.where(func.lower(DocumentChunk.chunk_type) == chunk_type)

        result = await db.execute(stmt)
        return cast(Sequence[DocumentChunkRow], result.all())

    async def get_current_document_chunk(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        job_result_id: str,
        document_chunk_id: str,
    ) -> DocumentChunkRow | None:
        stmt = (
            select(DocumentChunk, DocumentSection, JobResult)
            .outerjoin(
                DocumentSection,
                DocumentSection.section_id == DocumentChunk.section_id,
            )
            .join(JobResult, JobResult.id == DocumentChunk.job_result_id)
            .where(DocumentChunk.document_id == document_id)
            .where(DocumentChunk.job_result_id == job_result_id)
            .where(DocumentChunk.id == document_chunk_id)
            .limit(1)
        )

        result = await db.execute(stmt)
        row = result.first()
        return cast(DocumentChunkRow | None, row)

    async def get_current_document_chunk_by_chunk_id(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        job_result_id: str,
        chunk_id: str,
    ) -> DocumentChunkRow | None:
        stmt = (
            select(DocumentChunk, DocumentSection, JobResult)
            .outerjoin(
                DocumentSection,
                DocumentSection.section_id == DocumentChunk.section_id,
            )
            .join(JobResult, JobResult.id == DocumentChunk.job_result_id)
            .where(DocumentChunk.document_id == document_id)
            .where(DocumentChunk.job_result_id == job_result_id)
            .where(DocumentChunk.chunk_id == chunk_id)
            .limit(1)
        )

        result = await db.execute(stmt)
        row = result.first()
        return cast(DocumentChunkRow | None, row)
