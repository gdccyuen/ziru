"""Contract tests: GET /v2/documents/{id}/sections."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from typing import cast

import pytest
from httpx import AsyncClient

from tests.support.contract_database import ContractDatabase
from tests.support.v2_knowledge import (
    bootstrap_admin,
    create_user_with_key,
    ensure_user_exists,
    seed_attribute_dictionary,
    seed_document_with_attributes,
)

_SECTION_TREE_DOCUMENT_ID = "doc_sections_a"
_JOB_ID = "job_sections_tree"
_JOB_RESULT_ID = "jr_sections_tree"


def _cookie_headers(cookie_value: str) -> dict[str, str]:
    return {"Cookie": f"ziru_session={cookie_value}"}


def _bearer(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}"}


async def _seed_section_tree() -> None:
    await ensure_user_exists("local-dev-user")
    await ContractDatabase.insert_job(
        job_id=_JOB_ID,
        user_id="local-dev-user",
        status="done",
        source_type="file",
        job_metadata={"document_id": _SECTION_TREE_DOCUMENT_ID},
    )
    await ContractDatabase.insert_document(
        document_id=_SECTION_TREE_DOCUMENT_ID,
        source_file_name="finance.pdf",
    )
    await ContractDatabase.insert_job_result(
        job_result_id=_JOB_RESULT_ID,
        job_id=_JOB_ID,
        document_id=_SECTION_TREE_DOCUMENT_ID,
        delivery_mode="inline",
    )
    await ContractDatabase.execute(
        """
        UPDATE documents
        SET current_job_result_id = :job_result_id
        WHERE document_id = :document_id
        """,
        {
            "job_result_id": _JOB_RESULT_ID,
            "document_id": _SECTION_TREE_DOCUMENT_ID,
        },
    )

    sections = [
        ("sec_8", None, "8", "8", 0, 0),
        ("sec_8_1", "sec_8", "8/8.1", "8.1", 1, 1),
        ("sec_8_2", "sec_8", "8/8.2", "8.2", 1, 2),
        ("sec_8_3", "sec_8", "8/8.3", "8.3", 1, 3),
        ("sec_8_2_1", "sec_8_2", "8/8.2/8.2.1", "8.2.1", 2, 0),
        ("sec_8_2_2", "sec_8_2", "8/8.2/8.2.2", "8.2.2", 2, 1),
    ]
    for section_id, parent_id, path, title, level, sort_order in sections:
        await ContractDatabase.insert_document_section(
            section_id=section_id,
            document_id=_SECTION_TREE_DOCUMENT_ID,
            job_result_id=_JOB_RESULT_ID,
            section_path=path,
            section_title=title,
            section_level=level,
            parent_section_id=parent_id,
            sort_order=sort_order,
        )

    await ContractDatabase.insert_document_chunk(
        chunk_id="chunk_8_1",
        document_id=_SECTION_TREE_DOCUMENT_ID,
        job_result_id=_JOB_RESULT_ID,
        section_id="sec_8_1",
        chunk_type="text",
        content="8.1 snippet body",
        section_path="8/8.1",
    )
    long_content = "x" * 1200
    await ContractDatabase.insert_document_chunk(
        chunk_id="chunk_8_2_1",
        document_id=_SECTION_TREE_DOCUMENT_ID,
        job_result_id=_JOB_RESULT_ID,
        section_id="sec_8_2_1",
        chunk_type="text",
        content=long_content,
        section_path="8/8.2/8.2.1",
    )


@pytest.mark.asyncio
async def test_admin_gets_document_section_tree(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        await _seed_section_tree()
        response = await client.get(
            f"/api/v2/documents/{_SECTION_TREE_DOCUMENT_ID}/sections",
            headers=_cookie_headers(admin_cookie),
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["document_id"] == _SECTION_TREE_DOCUMENT_ID
    assert body["source_file_name"] == "finance.pdf"
    assert body["job_result_id"] == _JOB_RESULT_ID

    sections = cast(list[dict[str, object]], body["sections"])
    by_path = {cast(str, section["section_path"]): section for section in sections}
    assert set(by_path) == {"8", "8/8.1", "8/8.2", "8/8.3", "8/8.2/8.2.1", "8/8.2/8.2.2"}

    assert by_path["8"]["parent"] is None
    assert by_path["8"]["leaf"] is False
    assert by_path["8/8.2"]["parent"] == "sec_8"
    assert by_path["8/8.2"]["leaf"] is False
    assert by_path["8/8.1"]["parent"] == "sec_8"
    assert by_path["8/8.1"]["leaf"] is True
    assert by_path["8/8.2/8.2.1"]["parent"] == "sec_8_2"
    assert by_path["8/8.2/8.2.1"]["leaf"] is True

    assert by_path["8/8.1"]["chunk_count"] == 1
    assert by_path["8/8.1"]["has_content"] is True
    assert by_path["8/8.1"]["content_snippet"] == "8.1 snippet body"

    assert by_path["8/8.2/8.2.1"]["chunk_count"] == 1
    assert by_path["8/8.2/8.2.1"]["has_content"] is True
    snippet = cast(str, by_path["8/8.2/8.2.1"]["content_snippet"])
    assert len(snippet) == 501
    assert snippet.startswith("x" * 500)
    assert snippet.endswith("…")


@pytest.mark.asyncio
async def test_non_admin_gets_403_for_invisible_document_sections(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        await seed_attribute_dictionary({"division": ["finance", "sales"]})
        await seed_document_with_attributes(
            document_id="doc_sections_invisible",
            attributes={"division": ["finance"]},
            source_file_name="hidden.pdf",
        )
        _, sales_key = await create_user_with_key(
            client,
            admin_cookie,
            email="sections-sales@contract.ziru.local",
            grade="user",
            profile=[{"key": "division", "values": ["sales"]}],
        )
        response = await client.get(
            "/api/v2/documents/doc_sections_invisible/sections",
            headers=_bearer(sales_key),
        )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_missing_document_sections_returns_404(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        response = await client.get(
            "/api/v2/documents/doc_does_not_exist/sections",
            headers=_cookie_headers(admin_cookie),
        )

    assert response.status_code == 404
