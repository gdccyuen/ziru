"""Contract tests: /v2/attributes dictionary API (P3)."""

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
)


def _bearer(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}"}


def _cookie_headers(cookie_value: str) -> dict[str, str]:
    return {"Cookie": f"ziru_session={cookie_value}"}


@pytest.mark.asyncio
async def test_get_attributes_for_any_authenticated_account(
    developer_api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with developer_api_client_factory() as client:
        await seed_attribute_dictionary(
            {"division": ["finance", "sales"], "region": None}
        )
        response = await client.get("/api/v2/attributes")

    assert response.status_code == 200
    entries = cast(list[dict[str, object]], response.json())
    by_key = {cast(str, entry["key"]): entry for entry in entries}
    assert by_key["division"]["allowedValues"] == ["finance", "sales"]
    assert by_key["region"]["allowedValues"] is None


@pytest.mark.asyncio
async def test_post_patch_delete_admin_only(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        _, librarian_key = await create_user_with_key(
            client,
            admin_cookie,
            email="librarian-attributes@contract.ziru.local",
            grade="librarian",
        )
        librarian_post = await client.post(
            "/api/v2/attributes",
            headers=_bearer(librarian_key),
            json={"key": "team", "allowedValues": ["a"]},
        )
        librarian_patch = await client.patch(
            "/api/v2/attributes/team",
            headers=_bearer(librarian_key),
            json={"allowedValues": ["b"]},
        )
        librarian_delete = await client.delete(
            "/api/v2/attributes/team",
            headers=_bearer(librarian_key),
        )

    assert librarian_post.status_code == 403
    assert librarian_patch.status_code == 403
    assert librarian_delete.status_code == 403


@pytest.mark.asyncio
async def test_admin_post_patch_delete_flow(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        headers = _cookie_headers(admin_cookie)

        created = await client.post(
            "/api/v2/attributes",
            headers=headers,
            json={"key": "project", "allowedValues": ["alpha", "beta"]},
        )
        assert created.status_code == 200, created.text
        assert created.json() == {
            "key": "project",
            "allowedValues": ["alpha", "beta"],
        }

        patched = await client.patch(
            "/api/v2/attributes/project",
            headers=headers,
            json={"allowedValues": ["gamma"]},
        )
        assert patched.status_code == 200
        assert patched.json()["allowedValues"] == ["gamma"]

        listed = await client.get("/api/v2/attributes", headers=headers)
        entries = cast(list[dict[str, object]], listed.json())
        assert {"key": "project", "allowedValues": ["gamma"]} in entries

        deleted = await client.delete(
            "/api/v2/attributes/project",
            headers=headers,
        )
        assert deleted.status_code == 200

        after = await client.get("/api/v2/attributes", headers=headers)
        keys = {cast(str, entry["key"]) for entry in after.json()}
        assert "project" not in keys


@pytest.mark.asyncio
async def test_duplicate_attribute_key_conflicts(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        headers = _cookie_headers(admin_cookie)
        first = await client.post(
            "/api/v2/attributes",
            headers=headers,
            json={"key": "duplicate_key"},
        )
        second = await client.post(
            "/api/v2/attributes",
            headers=headers,
            json={"key": "duplicate_key"},
        )

    assert first.status_code == 200
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "ALREADY_EXISTS"


@pytest.mark.asyncio
async def test_builtin_key_rejected(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        response = await client.post(
            "/api/v2/attributes",
            headers=_cookie_headers(admin_cookie),
            json={"key": "createBy"},
        )

    assert response.status_code == 422
    assert "reserved" in response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_patch_delete_unknown_key_404(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await bootstrap_admin(client)
        headers = _cookie_headers(admin_cookie)
        patched = await client.patch(
            "/api/v2/attributes/no_such_key",
            headers=headers,
            json={"allowedValues": ["x"]},
        )
        deleted = await client.delete(
            "/api/v2/attributes/no_such_key",
            headers=headers,
        )

    assert patched.status_code == 404
    assert deleted.status_code == 404
