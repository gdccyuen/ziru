from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ExistingDocumentScope:
    document_id: str


@dataclass(frozen=True)
class PublishedDocumentState:
    document_id: str | None
    skipped_all_duplicate: bool = False


@dataclass(frozen=True)
class DocumentPublicationScope:
    document_id: str
    job_result_id: str
    source_file_name: str | None
