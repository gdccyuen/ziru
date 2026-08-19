"""Contract tests: POST/PATCH/DELETE document attribute workflows (P3)."""

from __future__ import annotations

import json
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
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


def _bearer(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}"}


def _cookie_headers(cookie_value: str) -> dict[str, str]:
    return {"Cookie": f"ziru_session={cookie_value}"}


@pytest.mark.asyncio
async def test_librarian_upload_with_attributes_persists_rows_at_publication(
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
        librarian_id, librarian_key = await create_user_with_key(
            client,
            admin_cookie,
            email="librarian-upload@contract.ziru.local",
            grade="librarian",
        )
        await seed_attribute_dictionary(
            {"division": ["finance", "sales"], "region": ["apac"]}
        )
        # Patch after the app module load so the live class is replaced.
        monkeypatch.setattr(
            "app.services.document_ingestion.worker_dispatcher."
            "DocumentIngestionWorkerDispatcher.start_uploaded_file_parse",
            _fake_start_parse,
        )
        response = await client.post(
            "/api/v2/documents",
            headers=_bearer(librarian_key),
            files={
                "file": (
                    "contract-upload.pdf",
                    b"%PDF-1.4 fake contract content",
                    "application/pdf",
                )
            },
            data={
                "attributes": json.dumps(
                    {
                        "division": ["finance", "sales"],
                        "region": ["apac"],
                    }
                )
            },
        )

    assert response.status_code == 200, response.text
    job_id = cast(str, response.json()["job_id"])
    job_row = await ContractDatabase.fetch_job(job_id)
    assert job_row is not None
    job_metadata = cast(dict[str, object], job_row["job_metadata"])
    assert job_metadata["attributes"] == {
        "division": ["finance", "sales"],
        "region": ["apac"],
    }
    document_id = cast(str, job_metadata["document_id"])

    job_result_id = str(uuid4())
    # The document does not exist yet; publish_document_state creates it and
    # binds job_result.document_id.
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
                    "content": "librarian upload visible content",
                    "type": "text",
                    "path": "contract-upload.pdf/Intro",
                }
            ],
        )

    rows = await ContractDatabase.fetch_all(
        """
        SELECT attr_key, attr_value
        FROM document_attributes
        WHERE document_id = :document_id
        ORDER BY attr_key, attr_value
        """,
        {"document_id": document_id},
    )
    grouped: dict[str, list[str]] = {}
    for row in rows:
        grouped.setdefault(row["attr_key"], []).append(row["attr_value"])
    assert grouped["division"] == ["finance", "sales"]
    assert grouped["region"] == ["apac"]
    assert grouped["createBy"] == [librarian_id]
    assert len(grouped["createTime"]) == 1
    assert "T" in grouped["createTime"][0]  # UTC ISO datetime


@pytest.mark.asyncio
async def test_user_grade_upload_forbidden(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        _, user_key = await create_user_with_key(
            client,
            admin_cookie,
            email="user-upload@contract.ziru.local",
            grade="user",
        )
        await seed_attribute_dictionary({"division": ["finance"]})
        response = await client.post(
            "/api/v2/documents",
            headers=_bearer(user_key),
            json={"url": "https://example.com/contracts/x.pdf", "attributes": {"division": ["finance"]}},
        )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PERMISSION_DENIED"


@pytest.mark.asyncio
async def test_upload_rejects_unknown_attribute_key(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        _, librarian_key = await create_user_with_key(
            client,
            admin_cookie,
            email="librarian-unknown@contract.ziru.local",
            grade="librarian",
        )
        await seed_attribute_dictionary({"division": ["finance"]})
        response = await client.post(
            "/api/v2/documents",
            headers=_bearer(librarian_key),
            json={
                "url": "https://example.com/contracts/x.pdf",
                "attributes": {"not_a_key": ["x"]},
            },
        )

    assert response.status_code == 422
    assert "unknown attribute key" in response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_upload_rejects_builtin_attribute_key(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        _, librarian_key = await create_user_with_key(
            client,
            admin_cookie,
            email="librarian-builtin@contract.ziru.local",
            grade="librarian",
        )
        await seed_attribute_dictionary({"division": ["finance"]})
        response = await client.post(
            "/api/v2/documents",
            headers=_bearer(librarian_key),
            json={
                "url": "https://example.com/contracts/x.pdf",
                "attributes": {"createBy": ["someone"]},
            },
        )

    assert response.status_code == 422
    assert "reserved" in response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_patch_attributes_replaces_for_librarian_and_keeps_builtins(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        _, librarian_key = await create_user_with_key(
            client,
            admin_cookie,
            email="librarian-patch@contract.ziru.local",
            grade="librarian",
        )
        await seed_attribute_dictionary(
            {"division": ["finance", "sales"], "region": ["apac", "emea"]}
        )
        await seed_document_with_attributes(
            document_id="doc_patch_me",
            attributes={
                "division": ["finance"],
                "region": ["apac"],
                "createBy": ["librarian-original"],
                "createTime": ["2026-01-01T00:00:00"],
            },
        )
        response = await client.patch(
            "/api/v2/documents/doc_patch_me/attributes",
            headers=_bearer(librarian_key),
            json={"attributes": {"division": ["sales"], "region": ["emea"]}},
        )

    assert response.status_code == 200, response.text
    attributes = cast(dict[str, object], response.json()["attributes"])
    assert attributes["division"] == ["sales"]
    assert attributes["region"] == ["emea"]
    assert attributes["createBy"] == ["librarian-original"]
    assert attributes["createTime"] == ["2026-01-01T00:00:00"]


@pytest.mark.asyncio
async def test_patch_attributes_user_forbidden(
    developer_api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with developer_api_client_factory() as client:
        await seed_attribute_dictionary({"division": ["finance"]})
        await seed_document_with_attributes(
            document_id="doc_patch_user",
            attributes={"division": ["finance"]},
        )
        response = await client.patch(
            "/api/v2/documents/doc_patch_user/attributes",
            json={"attributes": {"division": ["finance"]}},
        )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PERMISSION_DENIED"


@pytest.mark.asyncio
async def test_patch_rejects_builtin_keys(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        _, librarian_key = await create_user_with_key(
            client,
            admin_cookie,
            email="librarian-immutable@contract.ziru.local",
            grade="librarian",
        )
        await seed_attribute_dictionary({"division": ["finance"]})
        await seed_document_with_attributes(
            document_id="doc_immutable",
            attributes={
                "division": ["finance"],
                "createBy": ["librarian-a"],
                "createTime": ["2026-01-01T00:00:00"],
            },
        )
        response = await client.patch(
            "/api/v2/documents/doc_immutable/attributes",
            headers=_bearer(librarian_key),
            json={"attributes": {"createTime": ["2027-01-01T00:00:00"]}},
        )

    assert response.status_code == 422
    assert "reserved" in response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_delete_document_admin_only(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        _, librarian_key = await create_user_with_key(
            client,
            admin_cookie,
            email="librarian-delete@contract.ziru.local",
            grade="librarian",
        )
        await seed_document_with_attributes(
            document_id="doc_delete_me",
            attributes={"division": ["finance"]},
        )
        forbidden = await client.delete(
            "/api/v2/documents/doc_delete_me",
            headers=_bearer(librarian_key),
        )
        admin_delete = await client.delete(
            "/api/v2/documents/doc_delete_me",
            headers=_cookie_headers(admin_cookie),
        )

    assert forbidden.status_code == 403
    assert admin_delete.status_code == 200
    document = await ContractDatabase.fetch_document("doc_delete_me")
    assert document is not None
    assert document["status"] == "archived"
    assert document["archived_at"] is not None
