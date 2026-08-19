from __future__ import annotations

import os
from typing import Any

from loguru import logger

from app.services.workload.url_upload_context import load_url_upload_context
from app.services.workload.url_upload_transfer import (
    assert_temp_file_within_size_limit,
    cleanup_temp_file,
    download_source_url_to_temp,
    resolve_supported_url_extension,
    upload_temp_file_to_source_storage,
    verify_source_upload,
)
from shared.services.jobs.lifecycle.service import get_sync_job_lifecycle_service
from shared.services.jobs.metadata_persist import merge_job_metadata
from shared.services.redis.redis_sync_service import (
    SyncJobMetadataService,
    SyncRedisServiceFactory,
)
from shared.services.storage.original_file_retention import (
    sha256_file,
    store_original_file,
)


def upload_url_file(
    job_id: str,
    source_url: str,
    user_id: str | None,
    job_type: str | None = None,
) -> dict[str, Any]:
    del user_id, job_type

    lifecycle_service = get_sync_job_lifecycle_service()
    redis_service = SyncRedisServiceFactory.get_service()
    upload_context = load_url_upload_context(job_id, redis_service)

    lifecycle_service.update_progress(
        job_id,
        progress=3,
        message="Validating URL file type...",
        redis_service=redis_service,
    )
    file_extension = resolve_supported_url_extension(source_url)

    lifecycle_service.update_progress(
        job_id,
        progress=10,
        message="Downloading file from URL...",
        redis_service=redis_service,
    )
    temp_file_path = download_source_url_to_temp(source_url)

    try:
        lifecycle_service.update_progress(
            job_id,
            progress=30,
            message="Validating file size...",
            redis_service=redis_service,
        )
        assert_temp_file_within_size_limit(
            temp_file_path=temp_file_path,
            file_extension=file_extension,
        )

        lifecycle_service.update_progress(
            job_id,
            progress=50,
            message="Uploading file to S3...",
            redis_service=redis_service,
        )
        upload_temp_file_to_source_storage(
            temp_file_path=temp_file_path,
            s3_key=upload_context.s3_key,
        )
        _retain_url_original(
            job_id=job_id,
            temp_file_path=temp_file_path,
            source_url=source_url,
        )

    finally:
        cleanup_temp_file(temp_file_path)

    lifecycle_service.update_progress(
        job_id,
        progress=80,
        message="Verifying upload result...",
        redis_service=redis_service,
    )
    file_info = verify_source_upload(upload_context.s3_key)

    lifecycle_service.update_progress(
        job_id,
        progress=100,
        message="URL file upload complete, waiting for processing...",
        redis_service=redis_service,
    )
    logger.info(
        "URL file upload complete, waiting for S3 webhook: "
        f"{job_id} -> {upload_context.s3_key}"
    )

    return {
        "status": "success",
        "job_id": job_id,
        "s3_key": upload_context.s3_key,
        "file_size": file_info.get("size"),
    }


def _retain_url_original(
    *,
    job_id: str,
    temp_file_path: str,
    source_url: str,
) -> None:
    """Record upload provenance for URL-sourced jobs (upload time).

    Computes the sha256 of the downloaded bytes and archives the original
    under objects/{document_id}/original/{filename} when the job metadata
    carries a document_id. Best-effort: failures are logged, never fatal.
    """
    try:
        metadata = SyncJobMetadataService(
            SyncRedisServiceFactory.get_service()
        ).get_metadata(job_id)
    except Exception as exc:
        logger.warning(
            f"Failed to read job metadata for provenance (ignored): "
            f"job_id={job_id}, error={exc}"
        )
        metadata = None
    if not isinstance(metadata, dict):
        metadata = {}

    updates: dict[str, object] = {}
    try:
        updates["file_hash"] = sha256_file(temp_file_path)
    except Exception as exc:
        logger.warning(
            f"Failed to hash URL source (ignored): job_id={job_id}, error={exc}"
        )

    document_id = metadata.get("document_id")
    if document_id:
        filename = os.path.basename(source_url.split("?", 1)[0]).strip() or "download"
        try:
            updates["original_file_key"] = store_original_file(
                local_file_path=temp_file_path,
                document_id=document_id,
                filename=filename,
            )
        except Exception as exc:
            logger.warning(
                f"Failed to retain URL original (ignored): job_id={job_id}, "
                f"document_id={document_id}, error={exc}"
            )

    if not updates:
        return
    try:
        merge_job_metadata(job_id, updates)
    except Exception as exc:
        logger.warning(
            f"Failed to persist URL provenance (ignored): job_id={job_id}, "
            f"error={exc}"
        )
    logger.info(
        f"URL upload provenance recorded: job_id={job_id}, "
        f"updates={sorted(updates.keys())}"
    )
