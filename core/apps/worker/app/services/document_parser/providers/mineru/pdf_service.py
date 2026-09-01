import os
from pathlib import Path
from typing import Optional

import requests

from app.services.common.file_loading import is_remote
from app.services.document_parser.providers.mineru.client import mineru_logger

from shared.core.config import settings
from shared.core.constants import APIConstants
from shared.core.exceptions.domain_exceptions import (
    MinerUServiceException,
    StorageServiceException,
    UnavailableException,
)


def get_existing_mineru_source_s3_key(s3_key: Optional[str]) -> Optional[str]:
    """Return an existing S3 source key, or None if it is unavailable.

    Retained for rendered PPTX cache reuse. Local MinerU ingestion no longer
    uses S3 URL mode, so this only checks whether the source object already
    exists in storage.
    """
    if s3_key is None:
        return None

    from shared.services.storage.job_file_storage import JobFileStorage

    try:
        existing_file = JobFileStorage().verify_upload_exists(s3_key)
    except Exception:
        return None

    return s3_key if existing_file.get("exists") else None


def _flatten_extracted_zip(output_dir: str) -> None:
    """Flatten a local MinerU ZIP layout into the shape downstream code expects.

    Local MinerU extracts to ``{stem}/auto/{stem}.md`` plus
    ``{stem}/auto/images/*`` (and, on some builds, ``{stem}/auto/tables/*.html``).
    Downstream code expects ``full.md`` and an
    ``images/`` directory at the output dir root. This lifts the contents
    of the single ``{stem}/auto/`` directory to the output root (preserving
    the ``images/`` subdir), removes the ``{stem}/`` wrapper, drops files
    outside the keep set, and renames the single markdown file to
    ``full.md``. Hard-fails on zero or multiple ``.md`` files so we never
    silently pick the wrong one.
    """
    import shutil
    from pathlib import Path

    destination = Path(output_dir).resolve()
    keep_exts = (".md", ".jpg", ".jpeg", ".png", ".gif", ".json", ".html")
    exclude_patterns = ("content_list", "middle.json", "model.json")

    auto_dirs = [p for p in destination.glob("*/auto") if p.is_dir()]
    if not auto_dirs:
        raise MinerUServiceException(
            internal_message=(
                "Local MinerU ZIP did not contain a {stem}/auto/ directory; "
                "layout has changed or the response was not a parse result."
            ),
        )
    if len(auto_dirs) > 1:
        relative_paths = ", ".join(str(p.relative_to(destination)) for p in auto_dirs)
        raise MinerUServiceException(
            internal_message=(
                f"Local MinerU ZIP contained {len(auto_dirs)} */auto directories; "
                f"expected exactly one: {relative_paths}"
            ),
        )

    auto_dir = auto_dirs[0]
    for source_path in auto_dir.rglob("*"):
        if source_path.is_dir():
            continue
        relative = source_path.relative_to(auto_dir)
        if any(pattern in source_path.name for pattern in exclude_patterns):
            continue
        if source_path.suffix.lower() not in keep_exts:
            continue
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            continue
        shutil.move(str(source_path), str(target))

    shutil.rmtree(auto_dir.parent, ignore_errors=True)

    markdown_files = sorted(destination.glob("*.md"))
    if len(markdown_files) == 0:
        raise MinerUServiceException(
            internal_message=(
                "Local MinerU ZIP contained no markdown file under {stem}/auto/."
            ),
        )
    if len(markdown_files) > 1:
        relative_paths = ", ".join(str(p.relative_to(destination)) for p in markdown_files)
        raise MinerUServiceException(
            internal_message=(
                f"Local MinerU ZIP contained {len(markdown_files)} markdown files; "
                f"expected exactly one: {relative_paths}"
            ),
        )

    markdown_files[0].rename(destination / "full.md")


def _get_local_mineru_session() -> requests.Session:
    """Build a session for local MinerU's synchronous /file_parse endpoint.

    Local MinerU is single-concurrency by default
    (``max_concurrent_requests=1``). A ``ReadTimeout`` from queue wait must
    not cascade into urllib3 retries that push the request to the back of
    the same queue, so ``read`` retries are disabled. 429s surface as
    ``UnavailableException`` for upstream retry handling and do not go
    through the cloud quota manager (local mode has no API key).
    """
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry

    session = requests.Session()
    retry_strategy = Retry(
        total=3,
        backoff_factor=2,
        status_forcelist=[502, 503, 504],
        allowed_methods=["GET", "POST"],
        raise_on_status=False,
        read=0,
    )
    adapter = HTTPAdapter(
        max_retries=retry_strategy,
        pool_connections=1,
        pool_maxsize=1,
    )
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


_local_mineru_session: Optional[requests.Session] = None


def _get_local_mineru_session_cached() -> requests.Session:
    global _local_mineru_session
    if _local_mineru_session is None:
        _local_mineru_session = _get_local_mineru_session()
    return _local_mineru_session


_MINERU_RAW_SIDECAR_FILE_NAME = "_mineru_raw_s3_key.txt"


def _archive_mineru_raw_zip(
    zip_path: str,
    *,
    job_id: str,
    suffix: str,
) -> str:
    """Upload a raw MinerU ZIP to the results bucket and return its S3 key.

    The key is ``results/{job_id}/mineru_raw{suffix}.zip`` so sharded parses
    get unique keys (``mineru_raw_shard0.zip``, ...) while the single-parse
    case keeps the documented ``results/{job_id}/mineru_raw.zip``.
    """
    from shared.services.storage.result_storage import JobResultStorage

    storage = JobResultStorage()
    relative_path = f"mineru_raw{suffix}.zip"
    storage.upload_raw_file(
        job_id=job_id,
        relative_path=relative_path,
        local_file_path=zip_path,
    )
    return storage.build_raw_key(job_id=job_id, relative_path=relative_path)


def parse_via_local(
    pdf_url: str,
    filename: str,
    output_dir: str,
    job_id: Optional[str] = None,
    mineru_raw_suffix: str = "",
) -> None:
    """Parse a PDF via a local MinerU instance's synchronous /file_parse.

    MinerU is always local (on-premise). It exposes a single synchronous
    ``/file_parse`` endpoint that accepts the PDF as multipart form data and
    returns a ZIP with a nested layout (``{stem}/auto/{stem}.md``).

    Requests the raw ZIP (``response_format_zip=true`` plus the original
    input file via ``return_original_file=true``) and archives it to S3
    (``results/{job_id}/mineru_raw{suffix}.zip``) before extracting, so the
    complete raw MinerU output is permanently retained for audit and
    re-processing. The S3 key is written to a sidecar file
    (``{output_dir}/_mineru_raw_s3_key.txt``) for the job-result caller to
    pick up. Older MinerU builds that ignore ``response_format_zip`` and
    return inline JSON are handled via a fallback path that skips archival.
    """
    base_url = settings.MINERU_URL.rstrip("/")
    endpoint = f"{base_url}/file_parse"
    local_logger = mineru_logger(
        "local_file_parse",
        operation="local_file_parse",
        filename=filename,
        endpoint=endpoint,
        lang_list=settings.MINERU_LOCAL_LANG_LIST,
        backend=settings.MINERU_LOCAL_BACKEND,
        raw_zip_archival=bool(job_id),
    )

    form_fields = {
        "lang_list": settings.MINERU_LOCAL_LANG_LIST,
        "backend": settings.MINERU_LOCAL_BACKEND,
        "return_images": "true",
        "response_format_zip": "true",
        "return_original_file": "true",
    }

    if is_remote(pdf_url):
        import tempfile

        local_logger.info("Downloading remote source file before local MinerU parse")
        try:
            download_response = requests.get(
                pdf_url,
                stream=True,
                timeout=APIConstants.S3_FILE_DOWNLOAD_TIMEOUT,
            )
            download_response.raise_for_status()
            with tempfile.NamedTemporaryFile(
                delete=False, suffix=os.path.splitext(filename)[1]
            ) as temp_file:
                for chunk in download_response.iter_content(chunk_size=8192):
                    temp_file.write(chunk)
                temp_path = temp_file.name
        except requests.RequestException as exc:
            local_logger.bind(error_message=str(exc)).error(
                "Failed to stage remote source file for local MinerU"
            )
            raise StorageServiceException(
                internal_message=f"Failed to download remote file: {exc}"
            )
        local_file_path = temp_path
        cleanup_temp = True
    else:
        local_logger.bind(local_path=pdf_url).info(
            "Uploading local file to local MinerU"
        )
        local_file_path = pdf_url
        cleanup_temp = False

    try:
        with open(local_file_path, "rb") as file_obj:
            upload_name = f"{job_id}_{filename}" if job_id else filename
            files = {"files": (upload_name, file_obj, "application/pdf")}
            local_logger.info("Posting PDF to local MinerU /file_parse")
            try:
                response = _get_local_mineru_session_cached().post(
                    endpoint,
                    data=form_fields,
                    files=files,
                    timeout=settings.MINERU_LOCAL_TIMEOUT,
                )
            except requests.RequestException as exc:
                local_logger.bind(error_type=type(exc).__name__).error(
                    "Local MinerU /file_parse request failed"
                )
                raise MinerUServiceException(
                    internal_message=f"Local MinerU /file_parse failed: {exc}",
                    original_exception=exc,
                ) from exc
    finally:
        if cleanup_temp:
            os.unlink(local_file_path)

    if response.status_code == 429:
        retry_after = 60
        local_logger.bind(
            status_code=response.status_code,
            retry_after=retry_after,
        ).warning("Local MinerU /file_parse rate-limited")
        raise UnavailableException(
            internal_message="Local MinerU rate limited during /file_parse",
            retry_after=retry_after,
            limit=1,
            period="minute",
            user_message="Document processing is busy right now. Please retry shortly.",
        )
    if response.status_code != 200:
        local_logger.bind(status_code=response.status_code).error(
            "Local MinerU /file_parse failed"
        )
        raise MinerUServiceException(
            internal_message=(
                f"Local MinerU /file_parse returned {response.status_code}: "
                f"{response.text[:500]}"
            ),
            status_code=response.status_code,
        )

    local_logger.info("Local MinerU /file_parse completed")

    import base64
    import json
    from pathlib import Path

    content_type = response.headers.get("Content-Type", "")
    is_json_response = (
        "application/json" in content_type
        or response.content.lstrip().startswith(b"{")
    )

    if is_json_response:
        # Fallback for MinerU builds that ignore response_format_zip:
        # handle the inline JSON response and skip raw-ZIP archival.
        local_logger.warning(
            "Local MinerU returned an inline JSON response despite "
            "response_format_zip=true; skipping raw-ZIP archival"
        )
        result_payload = json.loads(response.content)
        results = result_payload.get("results") or {}
        if not results:
            raise MinerUServiceException(
                internal_message=(
                    "Local MinerU /file_parse response missing results; "
                    f"keys: {list(result_payload.keys())}"
                ),
            )

        file_names = result_payload.get("file_names") or list(results.keys())
        if len(results) > 1:
            raise MinerUServiceException(
                internal_message=(
                    f"Local MinerU returned {len(results)} result files; "
                    f"expected exactly one: {file_names}"
                ),
            )

        result_key = next(iter(results))
        result = results[result_key]
        md_content = result.get("md_content") or ""
        images = result.get("images") or {}

        destination = Path(output_dir)
        destination.mkdir(parents=True, exist_ok=True)

        (destination / "full.md").write_text(md_content, encoding="utf-8")

        if images:
            images_dir = destination / "images"
            images_dir.mkdir(parents=True, exist_ok=True)
            for image_name, image_data in images.items():
                if not isinstance(image_data, str) or not image_data:
                    continue
                image_path = images_dir / image_name
                try:
                    if image_data.startswith("http"):
                        img_response = _get_local_mineru_session_cached().get(
                            image_data,
                            timeout=settings.MINERU_LOCAL_TIMEOUT,
                        )
                        img_response.raise_for_status()
                        image_path.write_bytes(img_response.content)
                    else:
                        image_path.write_bytes(base64.b64decode(image_data))
                except Exception as exc:
                    local_logger.bind(
                        image_name=image_name,
                        error_type=type(exc).__name__,
                    ).warning("Failed to save local MinerU image, skipping")

        local_logger.bind(
            md_chars=len(md_content),
            image_count=len(images),
        ).info("Local MinerU parse completed (inline JSON fallback)")
        return

    # ZIP response: archive the raw ZIP to S3 before extracting.
    import tempfile
    import zipfile

    raw_zip_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
            tmp.write(response.content)
            raw_zip_path = tmp.name

        if job_id:
            s3_key = _archive_mineru_raw_zip(
                raw_zip_path,
                job_id=job_id,
                suffix=mineru_raw_suffix,
            )
            Path(output_dir, _MINERU_RAW_SIDECAR_FILE_NAME).write_text(
                s3_key, encoding="utf-8"
            )
            local_logger.bind(raw_zip_s3_key=s3_key).info(
                "Archived local MinerU raw ZIP to S3"
            )

        with zipfile.ZipFile(raw_zip_path) as extracted_zip:
            extracted_zip.extractall(output_dir)
    except zipfile.BadZipFile as exc:
        local_logger.bind(error_type=type(exc).__name__).error(
            "Local MinerU response was not a valid ZIP"
        )
        raise MinerUServiceException(
            internal_message=f"Local MinerU returned a non-ZIP body: {exc}",
            original_exception=exc,
        ) from exc
    finally:
        if raw_zip_path is not None:
            os.unlink(raw_zip_path)

    _flatten_extracted_zip(output_dir)
    local_logger.info("Local MinerU parse completed and ZIP flattened")


def parse_via_full(
    pdf_url: str,
    filename: str,
    output_dir: str,
    s3_key: Optional[str] = None,
    job_id: Optional[str] = None,
    mineru_raw_suffix: str = "",
) -> None:
    """Parse a PDF through the local MinerU /file_parse endpoint.

    MinerU is always local (on-premise), so this is a thin wrapper around
    parse_via_local. The s3_key parameter is retained for call-site
    compatibility but is no longer used.
    """
    parse_via_local(
        pdf_url=pdf_url,
        filename=filename,
        output_dir=output_dir,
        job_id=job_id,
        mineru_raw_suffix=mineru_raw_suffix,
    )
