"""Contract tests: /v2/chat threads + messages (P6)."""

from __future__ import annotations

import importlib
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from typing import cast
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient
from pytest import MonkeyPatch

from tests.support.v2_knowledge import (
    bootstrap_admin,
    create_user,
    create_user_with_key,
    seed_attribute_dictionary,
    seed_retrieval_document_with_attributes,
    USER_PASSWORD,
)


def _cookie_headers(cookie_value: str) -> dict[str, str]:
    return {"Cookie": f"ziru_session={cookie_value}"}


def _bearer(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}"}


async def _seed_chat_corpus() -> dict[str, str]:
    """Two documents: finance/project-alpha and sales/project-beta."""
    finance = await seed_retrieval_document_with_attributes(
        document_id="doc_chat_finance",
        attributes={
            "division": ["finance"],
            "project": ["alpha"],
        },
        source_file_name="finance.pdf",
        section_path="contract/intro",
        content="alpha contract retrieval content finance",
    )
    sales = await seed_retrieval_document_with_attributes(
        document_id="doc_chat_sales",
        attributes={
            "division": ["sales"],
            "project": ["beta"],
        },
        source_file_name="sales.pdf",
        section_path="contract/intro",
        content="alpha contract retrieval content sales",
    )
    return {"finance": finance["document_id"], "sales": sales["document_id"]}


async def _create_thread(
    client: AsyncClient,
    cookie: str,
    *,
    title: str = "My thread",
    filters: list[dict[str, object]] | None = None,
    retrieval_params: dict[str, object] | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {"title": title}
    if filters is not None:
        payload["filters"] = filters
    if retrieval_params is not None:
        payload["retrieval_params"] = retrieval_params
    response = await client.post(
        "/api/v2/chat/threads",
        headers=_cookie_headers(cookie),
        json=payload,
    )
    assert response.status_code == 200, response.text
    return cast(dict[str, object], response.json())


@pytest.mark.asyncio
async def test_chat_thread_crud_and_archive(
    api_client_factory: Callable[[], AbstractAsyncContextManager[AsyncClient]],
) -> None:
    async with api_client_factory() as client:
        cookie = await bootstrap_admin(client)
        headers = _cookie_headers(cookie)
        await seed_attribute_dictionary(
            {"division": ["finance", "sales"]}
        )

        created = await _create_thread(
            client,
            cookie,
            title="First thread",
            filters=[{"key": "division", "values": ["finance"]}],
        )
        thread_id = cast(str, created["id"])
        assert created["title"] == "First thread"
        assert created["filters"] == [
            {"key": "division", "values": ["finance"]},
        ]

        listed = await client.get("/api/v2/chat/threads", headers=headers)
        assert listed.status_code == 200
        assert len(listed.json()["threads"]) == 1

        renamed = await client.patch(
            f"/api/v2/chat/threads/{thread_id}",
            headers=headers,
            json={"title": "Renamed thread"},
        )
        assert renamed.status_code == 200
        assert renamed.json()["title"] == "Renamed thread"

        empty = await client.get(
            f"/api/v2/chat/threads/{thread_id}/messages",
            headers=headers,
        )
        assert empty.status_code == 200
        assert empty.json()["thread"]["id"] == thread_id
        assert empty.json()["messages"] == []

        archived = await client.delete(
            f"/api/v2/chat/threads/{thread_id}",
            headers=headers,
        )
        assert archived.status_code == 200

        after_archive = await client.get(
            "/api/v2/chat/threads", headers=headers
        )
        assert after_archive.json()["threads"] == []

        gone = await client.get(
            f"/api/v2/chat/threads/{thread_id}/messages",
            headers=headers,
        )
        assert gone.status_code == 404


@pytest.mark.asyncio
async def test_chat_message_turn_persists_evidence_and_citations(
    api_client_factory: Callable[[], AbstractAsyncContextManager[AsyncClient]],
) -> None:
    async with api_client_factory() as client:
        cookie = await bootstrap_admin(client)
        headers = _cookie_headers(cookie)
        await seed_attribute_dictionary(
            {"division": ["finance", "sales"], "project": ["alpha", "beta"]}
        )
        corpus = await _seed_chat_corpus()

        thread = await _create_thread(
            client,
            cookie,
            filters=[{"key": "project", "values": ["beta"]}],
        )
        thread_id = cast(str, thread["id"])

        turn = await client.post(
            f"/api/v2/chat/threads/{thread_id}/messages",
            headers=headers,
            json={"content": "alpha"},
        )
        assert turn.status_code == 200, turn.text
        body = turn.json()
        user_message = body["user_message"]
        assistant_message = body["assistant_message"]
        assert user_message["role"] == "user"
        assert user_message["content"] == "alpha"
        assert assistant_message["role"] == "assistant"
        assert assistant_message["content"]
        assert len(assistant_message["citations"]) >= 1
        source = cast(
            dict[str, object],
            assistant_message["citations"][0]["source"],
        )
        assert source["document_id"] == corpus["sales"]

        history = await client.get(
            f"/api/v2/chat/threads/{thread_id}/messages",
            headers=headers,
        )
        assert history.status_code == 200
        messages = history.json()["messages"]
        assert [message["role"] for message in messages] == [
            "user",
            "assistant",
        ]
        assert messages[0]["id"] == user_message["id"]
        assert messages[1]["id"] == assistant_message["id"]
        assert messages[1]["citations"] == assistant_message["citations"]


@pytest.mark.asyncio
async def test_chat_empty_profile_fails_closed(
    developer_api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with developer_api_client_factory() as client:
        await seed_attribute_dictionary(
            {"division": ["finance", "sales"]}
        )
        await _seed_chat_corpus()
        created = await client.post(
            "/api/v2/chat/threads",
            json={"title": "Empty profile thread"},
        )
        assert created.status_code == 200, created.text
        thread_id = cast(str, created.json()["id"])

        turn = await client.post(
            f"/api/v2/chat/threads/{thread_id}/messages",
            json={"content": "alpha"},
        )
        assert turn.status_code == 200, turn.text
        assistant = turn.json()["assistant_message"]
        assert "No matching knowledge" in assistant["content"]
        assert assistant["citations"] == []


@pytest.mark.asyncio
async def test_chat_cross_user_isolation(
    api_client_factory: Callable[[], AbstractAsyncContextManager[AsyncClient]],
) -> None:
    async with api_client_factory() as client:
        cookie = await bootstrap_admin(client)
        await seed_attribute_dictionary(
            {"division": ["finance", "sales"]}
        )
        thread = await _create_thread(
            client,
            cookie,
            filters=[{"key": "division", "values": ["finance"]}],
        )
        thread_id = cast(str, thread["id"])

        _, user_key = await create_user_with_key(
            client,
            cookie,
            email="other-chatter@contract.ziru.local",
            grade="user",
            profile=[{"key": "division", "values": ["finance"]}],
        )
        other_headers = _bearer(user_key)

        reads = await client.get(
            f"/api/v2/chat/threads/{thread_id}/messages",
            headers=other_headers,
        )
        renames = await client.patch(
            f"/api/v2/chat/threads/{thread_id}",
            headers=other_headers,
            json={"title": "hijack"},
        )
        deletes = await client.delete(
            f"/api/v2/chat/threads/{thread_id}",
            headers=other_headers,
        )
        posts = await client.post(
            f"/api/v2/chat/threads/{thread_id}/messages",
            headers=other_headers,
            json={"content": "alpha"},
        )

        assert reads.status_code == 404
        assert renames.status_code == 404
        assert deletes.status_code == 404
        assert posts.status_code == 404


@pytest.mark.asyncio
async def test_chat_forced_password_change_gate(
    api_client_factory: Callable[[], AbstractAsyncContextManager[AsyncClient]],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        await create_user(
            client,
            admin_cookie,
            email="must-change@contract.ziru.local",
            grade="user",
        )
        login = await client.post(
            "/api/v1/auth/login",
            json={"email": "must-change@contract.ziru.local", "password": USER_PASSWORD},
        )
        assert login.status_code == 200
        user_cookie = cast(str, login.cookies.get("ziru_session"))

        response = await client.post(
            "/api/v2/chat/threads",
            headers=_cookie_headers(user_cookie),
            json={"title": "blocked"},
        )

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"


@pytest.mark.asyncio
async def test_chat_thread_retrieval_params_persist_and_update(
    api_client_factory: Callable[[], AbstractAsyncContextManager[AsyncClient]],
) -> None:
    async with api_client_factory() as client:
        cookie = await bootstrap_admin(client)
        headers = _cookie_headers(cookie)

        created = await _create_thread(
            client,
            cookie,
            title="Tuned thread",
            retrieval_params={
                "rerank": True,
                "top_k": 12,
                "internal_recall_k": 55,
                "use_agentic": True,
            },
        )
        thread_id = cast(str, created["id"])
        assert created["retrieval_params"] == {
            "rerank": True,
            "top_k": 12,
            "internal_recall_k": 55,
            "use_agentic": True,
        }

        listed = await client.get("/api/v2/chat/threads", headers=headers)
        assert listed.status_code == 200
        assert listed.json()["threads"][0]["retrieval_params"] == {
            "rerank": True,
            "top_k": 12,
            "internal_recall_k": 55,
            "use_agentic": True,
        }

        updated = await client.patch(
            f"/api/v2/chat/threads/{thread_id}",
            headers=headers,
            json={
                "title": "Retuned thread",
                "retrieval_params": {
                    "rerank": False,
                    "top_k": 20,
                    "internal_recall_k": 90,
                    "use_agentic": False,
                },
            },
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["title"] == "Retuned thread"
        assert updated.json()["retrieval_params"] == {
            "rerank": False,
            "top_k": 20,
            "internal_recall_k": 90,
            "use_agentic": False,
        }


@pytest.mark.asyncio
async def test_chat_message_turn_applies_thread_retrieval_params(
    api_client_factory: Callable[[], AbstractAsyncContextManager[AsyncClient]],
    monkeypatch: MonkeyPatch,
) -> None:
    async with api_client_factory() as client:
        cookie = await bootstrap_admin(client)
        headers = _cookie_headers(cookie)

        chat_service = importlib.import_module("app.services.chat.chat_service")
        retrieval_calls: list[object] = []

        async def fake_retrieval(payload: object, *args: object, **kwargs: object):
            retrieval_calls.append(payload)
            return {"evidence_text": "", "results": []}

        async def fake_corpus_ids(*args: object, **kwargs: object):
            return {"doc_chat_trace"}

        monkeypatch.setattr(chat_service, "execute_retrieval_query", fake_retrieval)
        monkeypatch.setattr(chat_service, "resolve_chat_corpus_ids", fake_corpus_ids)

        thread = await _create_thread(
            client,
            cookie,
            retrieval_params={
                "rerank": True,
                "top_k": 17,
                "internal_recall_k": 66,
                "use_agentic": True,
            },
        )
        thread_id = cast(str, thread["id"])

        turn = await client.post(
            f"/api/v2/chat/threads/{thread_id}/messages",
            headers=headers,
            json={"content": "alpha"},
        )

        assert turn.status_code == 200, turn.text
        assert len(retrieval_calls) == 1
        request = cast(object, retrieval_calls[0])
        assert getattr(request, "top_k") == 17
        assert getattr(request, "internal_recall_k") == 66
        assert getattr(request, "rerank") is True
        assert getattr(request, "use_agentic") is True


@pytest.mark.asyncio
async def test_chat_thread_retrieval_param_range_validation(
    api_client_factory: Callable[[], AbstractAsyncContextManager[AsyncClient]],
) -> None:
    async with api_client_factory() as client:
        cookie = await bootstrap_admin(client)
        headers = _cookie_headers(cookie)

        for invalid_params in (
            {"top_k": 0},
            {"top_k": 51},
            {"internal_recall_k": 0},
            {"internal_recall_k": 201},
        ):
            response = await client.post(
                "/api/v2/chat/threads",
                headers=headers,
                json={"title": "invalid", "retrieval_params": invalid_params},
            )
            assert response.status_code == 422, response.text

        response = await client.patch(
            "/api/v2/chat/threads/does-not-matter",
            headers=headers,
            json={"retrieval_params": {"top_k": 51}},
        )
        assert response.status_code == 422, response.text
