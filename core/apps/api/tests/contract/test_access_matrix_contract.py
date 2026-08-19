"""Contract tests: P3 document visibility matrix by grade/profile."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from typing import cast

import pytest
from httpx import AsyncClient

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


def _document_ids(body: dict[str, object]) -> set[str]:
    documents = cast(list[dict[str, object]], body["documents"])
    return {cast(str, doc["document_id"]) for doc in documents}


async def _seed_matrix_corpus() -> None:
    """finance doc, sales doc, and a built-in-only doc (no profile attrs)."""
    await seed_attribute_dictionary({"division": ["finance", "sales"]})
    await seed_document_with_attributes(
        document_id="doc_matrix_finance",
        attributes={
            "division": ["finance", "sales"],  # multi-value any-match
            "createBy": ["librarian-a"],
            "createTime": ["2026-01-01T00:00:00"],
        },
    )
    await seed_document_with_attributes(
        document_id="doc_matrix_sales",
        attributes={
            "division": ["sales"],
            "createBy": ["librarian-b"],
            "createTime": ["2026-01-02T00:00:00"],
        },
    )
    await seed_document_with_attributes(
        document_id="doc_matrix_builtin_only",
        attributes={
            "createBy": ["librarian-c"],
            "createTime": ["2026-01-03T00:00:00"],
        },
    )


@pytest.mark.asyncio
async def test_admin_bypass_sees_all_documents(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        await _seed_matrix_corpus()
        response = await client.get(
            "/api/v2/documents",
            headers=_cookie_headers(admin_cookie),
        )

    assert response.status_code == 200
    assert _document_ids(response.json()) == {
        "doc_matrix_finance",
        "doc_matrix_sales",
        "doc_matrix_builtin_only",
    }


@pytest.mark.asyncio
async def test_empty_profile_librarian_and_user_see_nothing(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        _, empty_librarian_key = await create_user_with_key(
            client,
            admin_cookie,
            email="empty-librarian@contract.ziru.local",
            grade="librarian",
        )
        _, empty_user_key = await create_user_with_key(
            client,
            admin_cookie,
            email="empty-user@contract.ziru.local",
            grade="user",
        )
        await _seed_matrix_corpus()
        librarian_response = await client.get(
            "/api/v2/documents",
            headers=_bearer(empty_librarian_key),
        )
        user_response = await client.get(
            "/api/v2/documents",
            headers=_bearer(empty_user_key),
        )

    assert librarian_response.status_code == 200
    assert _document_ids(librarian_response.json()) == set()
    assert user_response.status_code == 200
    assert _document_ids(user_response.json()) == set()


@pytest.mark.asyncio
async def test_missing_attribute_key_is_fail_closed_invisible(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        _, librarian_key = await create_user_with_key(
            client,
            admin_cookie,
            email="finance-librarian@contract.ziru.local",
            grade="librarian",
            profile=[{"key": "division", "values": ["finance"]}],
        )
        await _seed_matrix_corpus()
        response = await client.get(
            "/api/v2/documents",
            headers=_bearer(librarian_key),
        )

    assert response.status_code == 200
    ids = _document_ids(response.json())
    # finance matches (multi-value any-match); sales-only and built-in-only do not.
    assert ids == {"doc_matrix_finance"}


@pytest.mark.asyncio
async def test_user_with_profile_sees_matching_subset(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        _, sales_user_key = await create_user_with_key(
            client,
            admin_cookie,
            email="sales-user@contract.ziru.local",
            grade="user",
            profile=[{"key": "division", "values": ["sales"]}],
        )
        await _seed_matrix_corpus()
        response = await client.get(
            "/api/v2/documents",
            headers=_bearer(sales_user_key),
        )

    assert response.status_code == 200
    ids = _document_ids(response.json())
    # sales profile matches the finance doc (multi-value) and the sales doc.
    assert ids == {"doc_matrix_finance", "doc_matrix_sales"}
