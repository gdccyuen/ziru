"""Contract tests for the admin API-key endpoints (P5, /v2/api-keys)."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from typing import cast

import pytest
from httpx import AsyncClient

from tests.support.v2_knowledge import ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD, ADMIN_NEW_PASSWORD

USER_PASSWORD = "UserPass2026!"


def _cookie(client: AsyncClient) -> str:
    value = client.cookies.get("ziru_session")
    assert value is not None
    return cast(str, value)


def _auth_headers(cookie_value: str) -> dict[str, str]:
    return {"Cookie": f"ziru_session={cookie_value}"}


async def _bootstrap_admin(client: AsyncClient) -> str:
    """Log in as the bootstrap admin and rotate its password; return cookie."""
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": DEFAULT_ADMIN_PASSWORD},
    )
    assert login.status_code == 200
    admin_cookie = _cookie(client)
    change = await client.post(
        "/api/v1/auth/change-password",
        headers=_auth_headers(admin_cookie),
        json={
            "old_password": DEFAULT_ADMIN_PASSWORD,
            "new_password": ADMIN_NEW_PASSWORD,
        },
    )
    assert change.status_code == 200
    return admin_cookie


async def _create_user(
    client: AsyncClient,
    admin_cookie: str,
    *,
    email: str,
    grade: str = "user",
) -> str:
    response = await client.post(
        "/api/v2/users",
        headers=_auth_headers(admin_cookie),
        json={"email": email, "password": USER_PASSWORD, "grade": grade},
    )
    assert response.status_code == 200, response.text
    return cast(str, response.json()["id"])


@pytest.mark.asyncio
async def test_non_admin_caller_is_forbidden_from_api_keys_admin(
    developer_api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with developer_api_client_factory() as client:
        response = await client.get("/api/v2/api-keys")

    assert response.status_code == 403
    error = cast(dict[str, object], response.json()["error"])
    assert error["code"] == "PERMISSION_DENIED"
    assert error["message"] == "Administrator access required"


@pytest.mark.asyncio
async def test_admin_creates_lists_and_revokes_any_api_key(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await _bootstrap_admin(client)
        user_id = await _create_user(
            client,
            admin_cookie,
            email="key-owner@contract.ziru.local",
        )

        create_response = await client.post(
            "/api/v2/api-keys",
            headers=_auth_headers(admin_cookie),
            json={"user_id": user_id, "name": "admin-minted-key"},
        )
        assert create_response.status_code == 200, create_response.text
        created = cast(dict[str, object], create_response.json())
        raw_api_key = cast(str, created["api_key"])
        assert raw_api_key.startswith("sk_")
        assert created["user_id"] == user_id

        list_response = await client.get(
            "/api/v2/api-keys",
            headers=_auth_headers(admin_cookie),
        )
        assert list_response.status_code == 200
        listed = cast(dict[str, object], list_response.json())
        api_keys = cast(list[dict[str, object]], listed["api_keys"])
        matched = next(
            key for key in api_keys if key["name"] == "admin-minted-key"
        )
        assert matched["user_id"] == user_id
        assert matched["user_email"] == "key-owner@contract.ziru.local"
        # Only the mask is visible after creation; the raw value is never replayed.
        assert matched["api_key"] != raw_api_key

        revoke_response = await client.delete(
            f"/api/v2/api-keys/{matched['id']}",
            headers=_auth_headers(admin_cookie),
        )
        assert revoke_response.status_code == 200
        assert revoke_response.json() == {"message": "API key revoked"}

        list_after = cast(dict[str, object], (
            await client.get("/api/v2/api-keys", headers=_auth_headers(admin_cookie))
        ).json())
        remaining = cast(list[dict[str, object]], list_after["api_keys"])
        assert all(key["id"] != matched["id"] for key in remaining)


@pytest.mark.asyncio
async def test_admin_create_for_missing_user_returns_not_found(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await _bootstrap_admin(client)
        response = await client.post(
            "/api/v2/api-keys",
            headers=_auth_headers(admin_cookie),
            json={"user_id": "user_missing", "name": "orphan-key"},
        )

    assert response.status_code == 404
    error = cast(dict[str, object], response.json()["error"])
    assert error["code"] == "NOT_FOUND"
