"""Contract tests: document file hash + original-file retention (v2)."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from io import BytesIO
from typing import cast
from uuid import uuid4

import pytest
from httpx import AsyncClient

from tests.support.contract_database import ContractDatabase
from tests.support.v2_knowledge import (
    bootstrap_admin,
    create_user_with_key,
    seed_attribute_dictionary,
    seed_document_with_attributes,
)

UPLOADED_BYTES = b"hello original bytes\nwith a second line\n"
UPLOAD_FILE_NAME = "contract-original.txt"
UPLOADED_SHA256 = hashlib.sha256(UPLOADED_BYTES).hexdigest()


def _bearer(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}"}


def _cookie_headers(cookie_value: str) -> dict[str, str]:
    return {"Cookie": f"ziru_session={cookie_value}"}


async def _upload_txt(
    client: AsyncClient,
    api_key: str,
    *,
    attributes: dict[str, list[str]] | None = None,
) -> str:
    response = await client.post(
        "/api/v2/documents",
        headers=_bearer(api_key),
        files={"file": (UPLOAD_FILE_NAME, UPLOADED_BYTES, "text/plain")},
        data={"attributes": json.dumps(attributes or {"division": ["finance"]})},
    )
    assert response.status_code == 200, response.text
    return cast(str, response.json()["job_id"])


async def _publish_job(job_id: str, document_id: str, job_result_id: str) -> None:
    await ContractDatabase.insert_job_result(
        job_result_id=job_result_id,
        job_id=job_id,
        document_id=None,
        delivery_mode="inline",
    )
    from shared.core.database_sync import get_sync_db_context
    from shared.services.retrieval.publication_service import (
        RetrievalPublicationService,
    )

    with get_sync_db_context() as db:
        RetrievalPublicationService().publish_document_state(
            db,
            job_id=job_id,
            job_result_id=job_result_id,
            chunks=[
                {
                    "content": "document file provenance contract",
                    "type": "text",
                    "path": f"{document_id}/Intro",
                }
            ],
        )


@pytest.mark.asyncio
async def test_upload_records_file_hash_and_original_file(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_start_parse(self, *, job_id: str, user_id: str) -> str:
        del self, job_id, user_id
        return "contract_task_id"

    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        _, librarian_key = await create_user_with_key(
            client,
            admin_cookie,
            email="librarian-filehash@contract.ziru.local",
            grade="librarian",
        )
        await seed_attribute_dictionary({"division": ["finance", "sales"]})
        monkeypatch.setattr(
            "app.services.document_ingestion.worker_dispatcher."
            "DocumentIngestionWorkerDispatcher.start_uploaded_file_parse",
            _fake_start_parse,
        )
        job_id = await _upload_txt(client, librarian_key)

        job_row = await ContractDatabase.fetch_job(job_id)
        assert job_row is not None
        job_metadata = cast(dict[str, object], job_row["job_metadata"])
        assert job_metadata["file_hash"] == UPLOADED_SHA256
        document_id = cast(str, job_metadata["document_id"])
        expected_key = f"objects/{document_id}/original/{UPLOAD_FILE_NAME}"
        assert job_metadata["original_file_key"] == expected_key

        from shared.core.config import settings
        from shared.core.config.storage import get_cached_storage_adapter

        adapter = get_cached_storage_adapter()
        stored_bytes = adapter.download_fileobj(
            expected_key,
            bucket=settings.S3_RESULTS_BUCKET,
        )
        assert stored_bytes == UPLOADED_BYTES


@pytest.mark.asyncio
async def test_original_file_round_trip_via_endpoint(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_start_parse(self, *, job_id: str, user_id: str) -> str:
        del self, job_id, user_id
        return "contract_task_id"

    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        _, librarian_key = await create_user_with_key(
            client,
            admin_cookie,
            email="librarian-roundtrip@contract.ziru.local",
            grade="librarian",
        )
        await seed_attribute_dictionary({"division": ["finance"]})
        monkeypatch.setattr(
            "app.services.document_ingestion.worker_dispatcher."
            "DocumentIngestionWorkerDispatcher.start_uploaded_file_parse",
            _fake_start_parse,
        )
        job_id = await _upload_txt(client, librarian_key)

        job_row = await ContractDatabase.fetch_job(job_id)
        assert job_row is not None
        job_metadata = cast(dict[str, object], job_row["job_metadata"])
        document_id = cast(str, job_metadata["document_id"])
        await _publish_job(
            job_id=job_id,
            document_id=document_id,
            job_result_id=str(uuid4()),
        )

        listing = await client.get(
            "/api/v2/documents",
            headers=_cookie_headers(admin_cookie),
        )
        assert listing.status_code == 200, listing.text
        documents = cast(list[dict[str, object]], listing.json()["documents"])
        document = next(
            (doc for doc in documents if doc["document_id"] == document_id),
            None,
        )
        assert document is not None
        attributes = cast(dict[str, object], document["attributes"])
        assert attributes["fileHash"] == [UPLOADED_SHA256]
        original_key = str(cast(list[object], attributes["originalFile"])[0])
        assert original_key == f"objects/{document_id}/original/{UPLOAD_FILE_NAME}"

        original = await client.get(
            f"/api/v2/documents/{document_id}/file/original",
            headers=_cookie_headers(admin_cookie),
        )
        assert original.status_code == 200, original.text
        assert original.content == UPLOADED_BYTES
        assert "attachment" in original.headers.get("content-disposition", "")
        assert UPLOAD_FILE_NAME in original.headers.get("content-disposition", "")


@pytest.mark.asyncio
async def test_patch_keeps_file_builtins_and_rejects_file_hash(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        _, librarian_key = await create_user_with_key(
            client,
            admin_cookie,
            email="librarian-provenance@contract.ziru.local",
            grade="librarian",
        )
        await seed_attribute_dictionary(
            {"division": ["finance", "sales"], "region": ["apac", "emea"]}
        )
        original_key = "objects/doc_provenance/original/report.pdf"
        await seed_document_with_attributes(
            document_id="doc_provenance",
            attributes={
                "division": ["finance"],
                "region": ["apac"],
                "fileHash": ["abc123"],
                "originalFile": [original_key],
            },
        )
        replaced = await client.patch(
            "/api/v2/documents/doc_provenance/attributes",
            headers=_bearer(librarian_key),
            json={"attributes": {"division": ["sales"], "region": ["emea"]}},
        )
        assert replaced.status_code == 200, replaced.text
        attributes = cast(dict[str, object], replaced.json()["attributes"])
        assert attributes["division"] == ["sales"]
        assert attributes["fileHash"] == ["abc123"]
        assert attributes["originalFile"] == [original_key]

        rejected = await client.patch(
            "/api/v2/documents/doc_provenance/attributes",
            headers=_bearer(librarian_key),
            json={"attributes": {"fileHash": ["deadbeef"]}},
        )
    assert rejected.status_code == 422
    assert "reserved" in rejected.json()["error"]["message"]


@pytest.mark.asyncio
async def test_original_file_visibility_gate(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        _, finance_key = await create_user_with_key(
            client,
            admin_cookie,
            email="finance-viewer@contract.ziru.local",
            grade="user",
            profile=[{"key": "division", "values": ["finance"]}],
        )
        await seed_attribute_dictionary({"division": ["finance", "sales"]})

        from shared.core.config import settings
        from shared.core.config.storage import get_cached_storage_adapter

        adapter = get_cached_storage_adapter()
        visible_key = "objects/doc_visible_original/original/visible.txt"
        hidden_key = "objects/doc_hidden_original/original/hidden.txt"
        adapter.upload_fileobj(
            BytesIO(b"visible original"),
            visible_key,
            bucket=settings.S3_RESULTS_BUCKET,
            content_type="text/plain",
        )
        adapter.upload_fileobj(
            BytesIO(b"hidden original"),
            hidden_key,
            bucket=settings.S3_RESULTS_BUCKET,
            content_type="text/plain",
        )
        await seed_document_with_attributes(
            document_id="doc_visible_original",
            attributes={
                "division": ["finance"],
                "originalFile": [visible_key],
            },
        )
        await seed_document_with_attributes(
            document_id="doc_hidden_original",
            attributes={
                "division": ["sales"],
                "originalFile": [hidden_key],
            },
        )

        visible = await client.get(
            "/api/v2/documents/doc_visible_original/file/original",
            headers=_bearer(finance_key),
        )
        hidden = await client.get(
            "/api/v2/documents/doc_hidden_original/file/original",
            headers=_bearer(finance_key),
        )
        admin_visible = await client.get(
            "/api/v2/documents/doc_hidden_original/file/original",
            headers=_cookie_headers(admin_cookie),
        )

    assert visible.status_code == 200, visible.text
    assert visible.content == b"visible original"
    assert hidden.status_code == 403, hidden.text
    assert hidden.json()["error"]["code"] == "PERMISSION_DENIED"
    assert admin_visible.status_code == 200, admin_visible.text
    assert admin_visible.content == b"hidden original"
