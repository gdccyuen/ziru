"""Original-file retention helpers (upload provenance).

The original uploaded bytes are archived once, at ingestion time, under
``objects/{document_id}/original/{filename}`` in the results bucket. The
storage key is recorded in ``job_metadata["original_file_key"]`` and
published as the immutable ``originalFile`` built-in attribute. The
sha256 of the uploaded bytes is recorded in
``job_metadata["file_hash"]`` and published as ``fileHash``.
"""

from __future__ import annotations

import hashlib
import os
from typing import BinaryIO

from shared.services.storage.job_file_storage import JobFileStorage

_ORIGINAL_FILE_PREFIX = "objects"


def sha256_file(local_file_path: str) -> str:
    """Compute the sha256 hex digest of a local file (chunked)."""
    digest = hashlib.sha256()
    with open(local_file_path, "rb") as file_handle:
        for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_original_file_key(*, document_id: str, filename: str) -> str:
    """Build the archived-original storage key for a document."""
    safe_name = os.path.basename(str(filename).replace("\\", "/")).strip()
    if not safe_name or safe_name in {".", ".."}:
        safe_name = "original"
    return f"{_ORIGINAL_FILE_PREFIX}/{document_id}/original/{safe_name}"


def store_original_file(
    *,
    local_file_path: str,
    document_id: str,
    filename: str,
) -> str:
    """Archive a local file as the document original; returns the storage key."""
    storage = JobFileStorage()
    storage_key = build_original_file_key(document_id=document_id, filename=filename)
    storage.upload_local_file(
        local_file_path,
        storage_key,
        bucket=storage.results_bucket,
    )
    return storage_key


def store_original_fileobj(
    *,
    file_obj: BinaryIO,
    document_id: str,
    filename: str,
    content_type: str | None = None,
) -> str:
    """Archive an uploaded file object as the document original.

    The file object is rewound before upload; callers should not rely on its
    position afterwards.
    """
    storage = JobFileStorage()
    storage_key = build_original_file_key(document_id=document_id, filename=filename)
    file_obj.seek(0)
    storage.upload_fileobj(
        file_obj,
        storage_key,
        bucket=storage.results_bucket,
        content_type=content_type,
    )
    return storage_key
