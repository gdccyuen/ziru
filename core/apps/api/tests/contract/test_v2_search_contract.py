"""Contract tests: POST /v2/search knowledge search (P3)."""

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
    seed_attribute_dictionary,
    seed_retrieval_document_with_attributes,
)

def _bearer(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}"}


async def _seed_search_corpus() -> dict[str, str]:
    """Two documents: finance doc with multi-value division, sales-only doc."""
    finance_doc = await seed_retrieval_document_with_attributes(
        document_id="doc_search_finance",
        attributes={
            "division": ["finance", "sales"],
            "region": ["apac"],
            "project": ["alpha"],
        },
        source_file_name="finance.pdf",
        section_path="contract/intro",
        content="alpha contract retrieval content finance",
    )
    sales_doc = await seed_retrieval_document_with_attributes(
        document_id="doc_search_sales",
        attributes={
            "division": ["sales"],
            "region": ["apac"],
            "project": ["beta"],
        },
        source_file_name="sales.pdf",
        section_path="contract/intro",
        content="alpha contract retrieval content sales",
    )
    return {"finance": finance_doc["document_id"], "sales": sales_doc["document_id"]}


def _search_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "query": "alpha",
        "filters": [{"key": "division", "values": ["sales"]}],
        "top_k": 10,
        "rerank": False,
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_search_rejects_empty_query(
    developer_api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with developer_api_client_factory() as client:
        await seed_attribute_dictionary({"division": ["finance", "sales"]})
        response = await client.post(
            "/api/v2/search",
            json=_search_payload(query="   "),
        )

    assert response.status_code == 422
    assert response.json()["error"]["message"] == "query must be non-empty"


@pytest.mark.asyncio
async def test_search_rejects_empty_filters(
    developer_api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with developer_api_client_factory() as client:
        await seed_attribute_dictionary({"division": ["finance", "sales"]})
        response = await client.post(
            "/api/v2/search",
            json=_search_payload(filters=[]),
        )

    assert response.status_code == 422
    assert response.json()["error"]["message"] == "filters must not be empty"


@pytest.mark.asyncio
async def test_search_rejects_unknown_filter_key(
    developer_api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with developer_api_client_factory() as client:
        await seed_attribute_dictionary({"division": ["finance", "sales"]})
        response = await client.post(
            "/api/v2/search",
            json=_search_payload(
                filters=[{"key": "unknown_key", "values": ["x"]}]
            ),
        )

    assert response.status_code == 422
    assert "unknown attribute key" in response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_valid_search_returns_evidence_and_citations(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        await seed_attribute_dictionary(
            {"division": ["finance", "sales"], "project": ["alpha", "beta"]}
        )
        await _seed_search_corpus()
        response = await client.post(
            "/api/v2/search",
            headers={"Cookie": f"ziru_session={admin_cookie}"},
            json=_search_payload(filters=[{"key": "project", "values": ["beta"]}]),
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["query"] == "alpha"
    assert body["evidence_text"]
    assert body["router_used"] == "small_corpus_all"
    assert len(body["results"]) == 1
    source = cast(dict[str, object], body["results"][0]["source"])
    assert source["document_id"] == "doc_search_sales"


@pytest.mark.asyncio
async def test_admin_sees_documents_across_profiles(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        await seed_attribute_dictionary(
            {"division": ["finance", "sales"], "project": ["alpha", "beta"]}
        )
        corpus = await _seed_search_corpus()
        # Admin with no profile sees both finance and sales documents.
        response = await client.post(
            "/api/v2/search",
            headers={"Cookie": f"ziru_session={admin_cookie}"},
            json=_search_payload(
                filters=[{"key": "division", "values": ["finance", "sales"]}],
                top_k=10,
            ),
        )

    assert response.status_code == 200, response.text
    body = response.json()
    returned_ids = {
        cast(dict[str, object], result["source"])["document_id"]
        for result in body["results"]
    }
    assert returned_ids == {corpus["finance"], corpus["sales"]}


@pytest.mark.asyncio
async def test_user_with_empty_profile_gets_empty_result_even_when_docs_exist(
    developer_api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with developer_api_client_factory() as client:
        await seed_attribute_dictionary({"division": ["finance", "sales"]})
        await _seed_search_corpus()
        response = await client.post(
            "/api/v2/search",
            json=_search_payload(filters=[{"key": "division", "values": ["sales"]}]),
        )

    assert response.status_code == 200
    body = response.json()
    assert body["results"] == []
    assert body["evidence_text"] == ""
    assert body["router_used"] == "empty_corpus_scoped"


@pytest.mark.asyncio
async def test_user_with_matching_profile_sees_only_matching_documents(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        _, user_key = await create_user_with_key(
            client,
            admin_cookie,
            email="finance-searcher@contract.ziru.local",
            grade="user",
            profile=[{"key": "division", "values": ["finance"]}],
        )
        await seed_attribute_dictionary(
            {"division": ["finance", "sales"], "project": ["alpha", "beta"]}
        )
        corpus = await _seed_search_corpus()
        response = await client.post(
            "/api/v2/search",
            headers=_bearer(user_key),
            json=_search_payload(filters=[{"key": "division", "values": ["sales"]}]),
        )

    assert response.status_code == 200, response.text
    body = response.json()
    returned_ids = {
        cast(dict[str, object], result["source"])["document_id"]
        for result in body["results"]
    }
    # Sales filter matches both docs, but the profile only admits finance.
    assert returned_ids == {corpus["finance"]}
