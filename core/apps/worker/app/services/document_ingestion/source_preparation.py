from __future__ import annotations

import os
from dataclasses import dataclass

from app.services.document_ingestion.file_size_policy import (
    build_file_size_limit_message,
)
from app.services.document_ingestion.processing_context import ParseJobContext
from app.services.document_parser.support.internal_parse_name import (
    prepare_internal_parse_input,
)
from loguru import logger

from shared.core.config import settings
from shared.core.exceptions.domain_exceptions import (
    NotFoundException,
    ValidationException,
)
from shared.models.schemas.job_metadata import JobMetadataHelper
from shared.services.jobs.metadata_persist import merge_job_metadata
from shared.services.storage.job_file_storage import JobFileStorage
from shared.services.storage.original_file_retention import (
    sha256_file,
    store_original_file,
)


@dataclass(frozen=True)
class PreparedSourceFile:
    source_file_name: str
    internal_parse_name: str
    local_file_path: str
    file_extension: str


def prepare_source_file(
    *,
    job_id: str,
    job_context: ParseJobContext,
    input_dir: str,
) -> PreparedSourceFile:
    """Verify, download, and normalize the uploaded source file."""
    source_file_name = JobMetadataHelper.get_source_file_name(
        job_context.job_metadata,
    ) or os.path.basename(job_context.s3_key)
    file_extension = (
        os.path.splitext(job_context.s3_key)[1].lower() if job_context.s3_key else ""
    )

    storage = JobFileStorage()
    _assert_source_file_within_size_limit(storage, job_context.s3_key)
    local_file_path = storage.download_upload_to_temp(
        job_context.s3_key,
        suffix=file_extension,
        temp_dir=input_dir,
    )
    logger.info(f"File downloaded: job_id={job_id}, local_path={local_file_path}")

    _retain_original_source_file(
        job_id=job_id,
        job_context=job_context,
        local_file_path=local_file_path,
        source_file_name=source_file_name,
    )

    prepared_parse_input = prepare_internal_parse_input(
        local_file_path,
        source_file_name,
        fallback_ext=file_extension,
        prefer_fallback_ext=True,
    )
    logger.info(
        f"File prepared for parsing: job_id={job_id}, "
        f"internal_filename={prepared_parse_input.internal_filename}, "
        f"local_path={prepared_parse_input.file_path}"
    )

    return PreparedSourceFile(
        source_file_name=source_file_name,
        internal_parse_name=prepared_parse_input.internal_filename,
        local_file_path=prepared_parse_input.file_path,
        file_extension=file_extension,
    )


def _retain_original_source_file(
    *,
    job_id: str,
    job_context: ParseJobContext,
    local_file_path: str,
    source_file_name: str,
) -> None:
    """Record upload provenance (fileHash + originalFile) for publication.

    The sha256 digest is computed from the exact uploaded bytes and the
    original file is archived under objects/{document_id}/original/{filename}
    when the job carries a document_id. Both are persisted into job_metadata
    (DB row + Redis) so the publication step can write the immutable
    built-in attributes.
    """
    document_id = JobMetadataHelper.get_document_id(job_context.job_metadata)
    updates: dict[str, object] = {}
    if not str(job_context.job_metadata.get("file_hash") or "").strip():
        try:
            updates["file_hash"] = sha256_file(local_file_path)
        except Exception as exc:
            logger.warning(
                f"Failed to hash source file (ignored): job_id={job_id}, error={exc}"
            )

    if document_id and not str(
        job_context.job_metadata.get("original_file_key") or ""
    ).strip():
        try:
            updates["original_file_key"] = store_original_file(
                local_file_path=local_file_path,
                document_id=document_id,
                filename=source_file_name,
            )
        except Exception as exc:
            logger.warning(
                f"Failed to retain original file (ignored): job_id={job_id}, "
                f"document_id={document_id}, error={exc}"
            )

    if not updates:
        return
    job_context.job_metadata.update(updates)
    try:
        merge_job_metadata(job_id, updates)
    except Exception as exc:
        logger.warning(
            f"Failed to persist upload provenance (ignored): job_id={job_id}, "
            f"error={exc}"
        )
    logger.info(
        f"Upload provenance recorded: job_id={job_id}, "
        f"updates={sorted(updates.keys())}"
    )


def _assert_source_file_within_size_limit(
    storage: JobFileStorage,
    s3_key: str,
) -> None:
    file_info = storage.verify_upload_exists(s3_key)
    if not file_info.get("exists"):
        raise NotFoundException(
            resource="S3File",
            resource_id=s3_key,
            internal_message=f"S3 file not found: {s3_key}",
        )

    logger.info(f"S3 file verified: {s3_key}")

    raw_file_size = file_info.get("size", 0)
    file_size = raw_file_size if isinstance(raw_file_size, int) else 0
    file_extension = os.path.splitext(s3_key)[1].lower()
    if file_size > settings.MAX_FILE_SIZE:
        limit_mb = settings.MAX_FILE_SIZE // (1024 * 1024)
        raise ValidationException(
            user_message=build_file_size_limit_message(
                limit_mb=limit_mb,
                file_extension=file_extension,
            ),
            violations=[
                {
                    "field": "file_size",
                    "description": (
                        f"Size {file_size} bytes exceeds limit of "
                        f"{settings.MAX_FILE_SIZE} bytes"
                    ),
                }
            ],
        )
