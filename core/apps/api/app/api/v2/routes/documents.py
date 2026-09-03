"""Documents API v2 routes (P3)."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
from typing import Any

from app.api.dependencies.current_user import (
    require_admin,
    require_librarian_or_admin,
    with_current_user,
)
from app.services.attributes.attribute_service import (
    load_attribute_dictionary,
    validate_attributes,
    validation_error_422,
)
from app.services.document_ingestion import DocumentIngestionService
from app.services.documents.lifecycle_service import DocumentService
from app.services.rate_limit.data_structures import CurrentUser
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.config import settings
from shared.core.config.storage import get_cached_storage_adapter
from shared.core.database import get_db
from shared.core.exceptions.domain_exceptions import (
    NotFoundException,
    PermissionDeniedException,
)
from shared.models.database.job import Job
from shared.models.database.user import GRADE_ADMINISTRATOR
from shared.models.schemas.job import JobCreateBase, JobResponse
from shared.services.profile import (
    constraints_from_mapping,
    normalize_profile,
    profile_matches,
)
from shared.services.redis import JobMetadataService, RedisServiceFactory
from shared.services.storage.file_upload_service import FileUploadService
from shared.services.storage.job_file_storage import JobFileStorage
from shared.services.storage.original_file_retention import store_original_fileobj
from starlette.datastructures import UploadFile

router = APIRouter(tags=["Documents"])

_document_service = DocumentService()
_document_ingestion_service = DocumentIngestionService()
_file_upload_service = FileUploadService()


class DocumentAttributesRequest(BaseModel):
    attributes: dict[str, list[str]] = Field(
        ...,
        description="Full replace map of non-built-in attributes",
    )


def _parse_filter_params(filter_params: list[str]) -> dict[str, list[str]]:
    """Parse repeated ?filter=key=value into {key: [values]}.

    Same key repeated → OR within key; different keys → AND.
    """
    filters: dict[str, list[str]] = {}
    for raw in filter_params:
        if "=" not in raw:
            raise validation_error_422(
                "filter must be formatted as key=value",
                "filter",
            )
        key, value = raw.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key or not value:
            raise validation_error_422(
                "filter must be formatted as key=value",
                "filter",
            )
        filters.setdefault(key, []).append(value)
    return filters


def _empty_documents_response(*, page: int, page_size: int) -> dict[str, Any]:
    return {
        "documents": [],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": 0,
            "total_pages": 0,
        },
    }


def _optional_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


async def _attach_attributes_to_job(
    db: AsyncSession,
    *,
    job_id: str,
    attributes: dict[str, list[str]],
    extra: dict[str, Any] | None = None,
) -> None:
    """Persist upload attributes (and provenance) into job_metadata.

    Writes the DB row and the Redis cache so the worker/publication can
    read them without a round-trip.
    """
    if not attributes and not extra:
        return
    job = await db.get(Job, job_id)
    if job is None:
        return
    metadata = dict(job.job_metadata or {})
    updates: dict[str, Any] = {}
    if attributes:
        metadata["attributes"] = attributes
        updates["attributes"] = attributes
    if extra:
        metadata.update(extra)
        updates.update(extra)
    job.job_metadata = metadata
    await db.commit()
    try:
        redis_service = RedisServiceFactory.get_service()
        metadata_service = JobMetadataService(redis_service)
        await metadata_service.update_metadata(job_id, updates)
    except Exception as exc:
        logger.warning(
            f"Failed to cache job metadata in Redis (ignored): job_id={job_id}, "
            f"error={exc}"
        )


async def _create_document_from_json(
    request: Request,
    *,
    current_user: CurrentUser,
    db: AsyncSession,
    dictionary: dict[str, list[str] | None],
) -> JobResponse:
    raw = await request.json()
    if not isinstance(raw, dict):
        raise validation_error_422("JSON body must be an object", "body")
    url = str(raw.get("url") or "").strip()
    if not url:
        raise validation_error_422("url must be non-empty", "url")
    raw_attributes = raw.get("attributes") or {}
    if not isinstance(raw_attributes, dict):
        raise validation_error_422("attributes must be an object", "attributes")
    cleaned = validate_attributes(
        raw_attributes,
        dictionary=dictionary,
        allow_unknown=False,
    )
    payload = JobCreateBase(
        source_type="url",
        source_url=url,
        document_id=_optional_string(raw.get("document_id")),
    )
    job_response = await _document_ingestion_service.create_v1_job(
        db,
        payload=payload,
        current_user=current_user,
    )
    await _attach_attributes_to_job(
        db,
        job_id=job_response.job_id,
        attributes=cleaned,
    )
    return job_response


async def _create_document_from_multipart(
    request: Request,
    *,
    current_user: CurrentUser,
    db: AsyncSession,
    dictionary: dict[str, list[str] | None],
) -> JobResponse:
    form = await request.form()
    upload_file = form.get("file")
    if not isinstance(upload_file, UploadFile) or not upload_file.filename:
        raise validation_error_422("file is required", "file")
    filename = str(upload_file.filename)

    attributes: dict[str, list[str]] = {}
    raw_attributes = form.get("attributes")
    if raw_attributes is not None and str(raw_attributes).strip():
        try:
            parsed = json.loads(str(raw_attributes))
        except json.JSONDecodeError:
            raise validation_error_422(
                "attributes must be a valid JSON object",
                "attributes",
            )
        if not isinstance(parsed, dict):
            raise validation_error_422(
                "attributes must be a valid JSON object",
                "attributes",
            )
        attributes = parsed
    cleaned = validate_attributes(
        attributes,
        dictionary=dictionary,
        allow_unknown=False,
    )

    payload = JobCreateBase(
        source_type="file",
        file_name=filename,
        document_id=_optional_string(form.get("document_id")),
    )
    job_response = await _document_ingestion_service.create_v1_job(
        db,
        payload=payload,
        current_user=current_user,
    )
    job_id = job_response.job_id

    file_extension = os.path.splitext(filename)[1].lower()
    upload_info = await _file_upload_service.generate_upload_url(
        job_id,
        file_extension,
    )
    s3_key = str(upload_info["s3_key"])
    storage_adapter = get_cached_storage_adapter()

    # sha256 of the exact uploaded bytes (upload-time provenance).
    digest = hashlib.sha256()
    while chunk := await upload_file.read(1024 * 1024):
        digest.update(chunk)
    file_hash = digest.hexdigest()
    await upload_file.seek(0)

    await asyncio.to_thread(
        storage_adapter.upload_fileobj,
        upload_file.file,
        s3_key,
        settings.S3_BUCKET_NAME,
        upload_file.content_type,
    )
    await _document_ingestion_service.confirm_upload(
        db,
        job_id=job_id,
        request_payload=None,
        user_id=current_user.user_id,
    )

    # Retain the original bytes for the /file/original endpoint.
    original_key: str | None = None
    job = await db.get(Job, job_id)
    document_id = (
        (job.job_metadata or {}).get("document_id") if job is not None else None
    )
    if document_id:
        try:
            original_key = await asyncio.to_thread(
                lambda: store_original_fileobj(
                    file_obj=upload_file.file,
                    document_id=document_id,
                    filename=filename,
                    content_type=upload_file.content_type,
                )
            )
        except Exception as exc:
            logger.warning(
                f"Failed to retain original file (ignored): job_id={job_id}, "
                f"document_id={document_id}, error={exc}"
            )

    extra: dict[str, Any] = {"file_hash": file_hash}
    if original_key:
        extra["original_file_key"] = original_key
    await _attach_attributes_to_job(
        db,
        job_id=job_id,
        attributes=cleaned,
        extra=extra,
    )
    return job_response


@router.get(
    "",
    summary="List documents with attribute filters and profile scope (v2)",
)
async def list_documents_v2(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=200, description="Items per page"),
    filter_param: list[str] = Query(
        default_factory=list,
        alias="filter",
        description=(
            "Repeated attribute filter key=value; same key ORs, "
            "different keys AND"
        ),
    ),
    current_user: CurrentUser = Depends(with_current_user),
    db: AsyncSession = Depends(get_db),
):
    browse_filters = _parse_filter_params(filter_param)
    constraints = constraints_from_mapping(browse_filters)

    is_admin = current_user.grade == GRADE_ADMINISTRATOR
    if not is_admin:
        profile = normalize_profile(current_user.profile or [])
        if not profile:
            return _empty_documents_response(page=page, page_size=page_size)
        constraints = list(profile) + constraints

    return await _document_service.list_documents_v2(
        db,
        page=page,
        page_size=page_size,
        constraints=constraints,
        include_creator_email=is_admin,
    )


@router.post("", response_model=JobResponse, summary="Upload a document with attributes")
async def create_document_with_attributes(
    request: Request,
    current_user: CurrentUser = Depends(require_librarian_or_admin),
    db: AsyncSession = Depends(get_db),
):
    content_type = request.headers.get("content-type", "").lower()
    dictionary = await load_attribute_dictionary(db)
    if content_type.startswith("multipart/form-data"):
        return await _create_document_from_multipart(
            request,
            current_user=current_user,
            db=db,
            dictionary=dictionary,
        )
    if content_type.startswith("application/json"):
        return await _create_document_from_json(
            request,
            current_user=current_user,
            db=db,
            dictionary=dictionary,
        )
    raise validation_error_422(
        "Content-Type must be multipart/form-data or application/json",
        "body",
    )


@router.patch(
    "/{document_id}/attributes",
    summary="Replace non-built-in document attributes",
)
async def patch_document_attributes(
    document_id: str,
    payload: DocumentAttributesRequest,
    current_user: CurrentUser = Depends(require_librarian_or_admin),
    db: AsyncSession = Depends(get_db),
):
    await _document_service.get_document_or_raise(db, document_id=document_id)
    dictionary = await load_attribute_dictionary(db)
    allow_unknown = current_user.grade == GRADE_ADMINISTRATOR
    cleaned = validate_attributes(
        payload.attributes,
        dictionary=dictionary,
        allow_unknown=allow_unknown,
    )
    attributes = await _document_service.replace_document_attributes(
        db,
        document_id=document_id,
        attributes=cleaned,
    )
    await db.commit()
    return {"attributes": attributes}


@router.get(
    "/{document_id}/file/original",
    summary="Stream the original uploaded file",
)
async def get_document_original_file(
    document_id: str,
    current_user: CurrentUser = Depends(with_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stream the archived original upload for a document.

    Administrators may fetch any document; other grades must have profile
    visibility of the document (fail-closed, same rule as listing).
    """
    await _document_service.get_document_or_raise(
        db,
        document_id=document_id,
    )
    attributes = await _document_service.get_document_attributes(
        db,
        document_id=document_id,
    )

    if current_user.grade != GRADE_ADMINISTRATOR:
        profile = normalize_profile(current_user.profile or [])
        if not profile_matches(profile, attributes):
            raise PermissionDeniedException(
                user_message="Document is not visible to your profile",
                internal_message=(
                    f"Original-file access denied for non-visible document: "
                    f"document_id={document_id}, user_id={current_user.user_id}"
                ),
            )

    original_keys = attributes.get("originalFile") or []
    if not original_keys:
        raise NotFoundException(
            resource="Original file",
            resource_id=document_id,
            internal_message=f"No original file attribute for document {document_id}",
        )
    storage_key = original_keys[0]

    job_file_storage = JobFileStorage()
    try:
        raw_bytes = await asyncio.to_thread(
            job_file_storage.storage_adapter.download_fileobj,
            storage_key,
            job_file_storage.results_bucket,
        )
    except Exception as exc:
        logger.warning(
            f"Failed to download original file: document_id={document_id}, "
            f"storage_key={storage_key}, error={exc}"
        )
        raise NotFoundException(
            resource="Original file",
            resource_id=document_id,
            internal_message=(
                f"Original file object missing from storage: {storage_key}"
            ),
        ) from exc

    filename = os.path.basename(storage_key.replace("\\", "/")).strip() or "original"
    media_type = JobFileStorage.get_content_type(os.path.splitext(filename)[1].lower())
    return StreamingResponse(
        iter([raw_bytes]),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/{document_id}/sections",
    summary="Return one document's section tree with chunk leaves",
)
async def get_document_sections(
    document_id: str,
    current_user: CurrentUser = Depends(with_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _document_service.get_document_or_raise(
        db,
        document_id=document_id,
    )
    attributes = await _document_service.get_document_attributes(
        db,
        document_id=document_id,
    )

    if current_user.grade != GRADE_ADMINISTRATOR:
        profile = normalize_profile(current_user.profile or [])
        if not profile_matches(profile, attributes):
            raise PermissionDeniedException(
                user_message="Document is not visible to your profile",
                internal_message=(
                    f"Document sections access denied for non-visible document: "
                    f"document_id={document_id}, user_id={current_user.user_id}"
                ),
            )

    response = await _document_service.get_document_sections(
        db,
        document_id=document_id,
    )
    if response is None:
        raise NotFoundException(
            resource="Document sections",
            resource_id=document_id,
            internal_message="Document sections not found",
        )
    return response


@router.get(
    "/{document_id}/chunks/{chunk_id}",
    summary="Return one document chunk's full detail",
)
async def get_document_chunk_detail(
    document_id: str,
    chunk_id: str,
    current_user: CurrentUser = Depends(with_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _document_service.get_document_or_raise(
        db,
        document_id=document_id,
    )
    attributes = await _document_service.get_document_attributes(
        db,
        document_id=document_id,
    )

    if current_user.grade != GRADE_ADMINISTRATOR:
        profile = normalize_profile(current_user.profile or [])
        if not profile_matches(profile, attributes):
            raise PermissionDeniedException(
                user_message="Document is not visible to your profile",
                internal_message=(
                    f"Document chunk access denied for non-visible document: "
                    f"document_id={document_id}, user_id={current_user.user_id}"
                ),
            )

    response = await _document_service.get_document_chunk_detail(
        db,
        document_id=document_id,
        chunk_id=chunk_id,
    )
    if response is None:
        raise NotFoundException(
            resource="Document chunk",
            resource_id=chunk_id,
            internal_message="Document chunk not found",
        )
    return response


@router.delete("/{document_id}", summary="Archive a document (admin only)")
async def delete_document(
    document_id: str,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    document = await _document_service.archive_document(
        db,
        document_id=document_id,
    )
    if document is None:
        raise NotFoundException(
            resource="Document",
            resource_id=document_id,
            internal_message="Document not found",
        )
    return document


@router.get("/{document_id}/files/page-citation-source")
async def get_document_page_citation_source(
    document_id: str,
    current_user: CurrentUser = Depends(with_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    response = await _document_service.get_document_page_citation_source(
        db,

        document_id=document_id,
    )
    if response is None:
        raise NotFoundException(
            resource="Document page citation source",
            resource_id=document_id,
            internal_message="Document page citation source not found",
        )
    return response


@router.get("/{document_id}/files/mineru-raw")
async def get_document_mineru_raw(
    document_id: str,
    current_user: CurrentUser = Depends(with_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    response = await _document_service.get_document_mineru_raw(
        db,

        document_id=document_id,
    )
    if response is None:
        raise NotFoundException(
            resource="Document MinerU raw output",
            resource_id=document_id,
            internal_message="Document MinerU raw output not found",
        )
    return response


__all__ = ["router"]
