"""Contract tests: GET /v2/documents browsing (P3)."""

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

def _cookie_headers(cookie_value: str) -> dict[str, str]:
    return {"Cookie": f"ziru_session={cookie_value}"}


def _bearer(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}"}


async def _seed_browse_corpus() -> None:
    await seed_attribute_dictionary({"division": ["finance", "sales"], "region": ["apac", "emea"]})
    await seed_document_with_attributes(
        document_id="doc_browse_a",
        attributes={
            "division": ["finance"],
            "region": ["apac"],
            "createBy": ["librarian-1"],
            "createTime": ["2026-01-01T00:00:00"],
        },
    )
    await seed_document_with_attributes(
        document_id="doc_browse_b",
        attributes={
            "division": ["sales"],
            "region": ["apac"],
            "createBy": ["librarian-2"],
            "createTime": ["2026-01-02T00:00:00"],
        },
    )
    await seed_document_with_attributes(
        document_id="doc_browse_c",
        attributes={
            "division": ["finance"],
            "region": ["emea"],
            "createBy": ["librarian-3"],
            "createTime": ["2026-01-03T00:00:00"],
        },
    )


def _document_ids(body: dict[str, object]) -> set[str]:
    documents = cast(list[dict[str, object]], body["documents"])
    return {cast(str, doc["document_id"]) for doc in documents}


@pytest.mark.asyncio
async def test_browse_filters_and_or_semantics(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        await _seed_browse_corpus()
        headers = _cookie_headers(admin_cookie)

        and_response = await client.get(
            "/api/v2/documents",
            headers=headers,
            params=[
                ("filter", "division=finance"),
                ("filter", "region=apac"),
            ],
        )
        or_response = await client.get(
            "/api/v2/documents",
            headers=headers,
            params=[
                ("filter", "division=finance"),
                ("filter", "division=sales"),
            ],
        )

    assert and_response.status_code == 200
    assert _document_ids(and_response.json()) == {"doc_browse_a"}

    assert or_response.status_code == 200
    assert _document_ids(or_response.json()) == {
        "doc_browse_a",
        "doc_browse_b",
        "doc_browse_c",
    }


@pytest.mark.asyncio
async def test_browse_pagination(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        await _seed_browse_corpus()
        headers = _cookie_headers(admin_cookie)

        first = await client.get("/api/v2/documents", headers=headers, params={"page": 1, "page_size": 2})
        second = await client.get("/api/v2/documents", headers=headers, params={"page": 2, "page_size": 2})

    assert first.status_code == 200
    first_body = first.json()
    assert len(first_body["documents"]) == 2
    assert first_body["pagination"]["total"] == 3
    assert first_body["pagination"]["total_pages"] == 2

    assert second.status_code == 200
    second_body = second.json()
    assert len(second_body["documents"]) == 1
    assert second_body["pagination"]["page"] == 2


@pytest.mark.asyncio
async def test_profile_scope_on_list(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        await _seed_browse_corpus()
        _, finance_key = await create_user_with_key(
            client,
            admin_cookie,
            email="finance-browser@contract.ziru.local",
            grade="user",
            profile=[{"key": "division", "values": ["finance"]}],
        )
        admin_list = await client.get(
            "/api/v2/documents",
            headers=_cookie_headers(admin_cookie),
        )
        finance_list = await client.get(
            "/api/v2/documents",
            headers=_bearer(finance_key),
        )

    assert admin_list.status_code == 200
    assert _document_ids(admin_list.json()) == {
        "doc_browse_a",
        "doc_browse_b",
        "doc_browse_c",
    }

    assert finance_list.status_code == 200
    assert _document_ids(finance_list.json()) == {"doc_browse_a", "doc_browse_c"}


@pytest.mark.asyncio
async def test_empty_profile_returns_empty_list(
    developer_api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with developer_api_client_factory() as client:
        await _seed_browse_corpus()
        response = await client.get("/api/v2/documents")

    assert response.status_code == 200
    body = response.json()
    assert body["documents"] == []
    assert body["pagination"]["total"] == 0


@pytest.mark.asyncio
async def test_creator_email_admin_and_librarian_see_other_creators(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        await seed_attribute_dictionary({"division": ["library"]})
        librarian_id, librarian_key = await create_user_with_key(
            client,
            admin_cookie,
            email="creator-librarian@contract.ziru.local",
            grade="librarian",
            profile=[{"key": "division", "values": ["library"]}],
        )
        other_id, _ = await create_user_with_key(
            client,
            admin_cookie,
            email="creator-other@contract.ziru.local",
            grade="librarian",
            profile=[{"key": "division", "values": ["library"]}],
        )
        await seed_document_with_attributes(
            document_id="doc_creator_lib",
            attributes={
                "division": ["library"],
                "createBy": [librarian_id],
                "createTime": ["2026-01-01T00:00:00"],
            },
        )
        await seed_document_with_attributes(
            document_id="doc_creator_other",
            attributes={
                "division": ["library"],
                "createBy": [other_id],
                "createTime": ["2026-01-02T00:00:00"],
            },
        )

        admin_response = await client.get(
            "/api/v2/documents",
            headers=_cookie_headers(admin_cookie),
        )
        librarian_response = await client.get(
            "/api/v2/documents",
            headers=_bearer(librarian_key),
        )

    assert admin_response.status_code == 200
    assert _document_ids(admin_response.json()) == {
        "doc_creator_lib",
        "doc_creator_other",
    }
    admin_documents = cast(list[dict[str, object]], admin_response.json()["documents"])
    admin_by_id = {
        cast(str, document["document_id"]): document
        for document in admin_documents
    }
    assert admin_by_id["doc_creator_lib"]["creator_email"] == (
        "creator-librarian@contract.ziru.local"
    )
    assert admin_by_id["doc_creator_other"]["creator_email"] == (
        "creator-other@contract.ziru.local"
    )

    assert librarian_response.status_code == 200
    librarian_documents = cast(
        list[dict[str, object]],
        librarian_response.json()["documents"],
    )
    assert _document_ids(librarian_response.json()) == {
        "doc_creator_lib",
        "doc_creator_other",
    }
    librarian_by_id = {
        cast(str, document["document_id"]): document
        for document in librarian_documents
    }
    assert librarian_by_id["doc_creator_lib"]["creator_email"] == (
        "creator-librarian@contract.ziru.local"
    )
    assert librarian_by_id["doc_creator_other"]["creator_email"] == (
        "creator-other@contract.ziru.local"
    )


@pytest.mark.asyncio
async def test_attributes_included_in_payloads(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        await _seed_browse_corpus()
        response = await client.get(
            "/api/v2/documents",
            headers=_cookie_headers(admin_cookie),
            params={"filter": "division=finance", "filter": "region=emea"},
        )

    assert response.status_code == 200
    documents = cast(list[dict[str, object]], response.json()["documents"])
    assert len(documents) == 1
    attributes = cast(dict[str, object], documents[0]["attributes"])
    assert attributes["division"] == ["finance"]
    assert attributes["region"] == ["emea"]
    assert attributes["createBy"] == ["librarian-3"]
    assert attributes["createTime"] == ["2026-01-03T00:00:00"]
