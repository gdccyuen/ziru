"""Contract tests for the API-key endpoints (P5, /v2/api-keys).

Admin callers: create, list (all), revoke. Non-admin callers: list only
their own keys (read-only); create/revoke stay admin-only. The create
endpoint accepts ISO 8601 and the console's DD/MM/YYYY[,] HH:MM format.
"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from typing import cast

import pytest
from httpx import AsyncClient

from tests.support.v2_knowledge import (
    ADMIN_EMAIL,
    ADMIN_NEW_PASSWORD,
    DEFAULT_ADMIN_PASSWORD,
    USER_PASSWORD,
    bootstrap_admin,
    create_user,
)

USER_NEW_PASSWORD = "OwnKeysPass2026!"


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


async def _user_session_cookie(client: AsyncClient, email: str) -> str:
    """Log in as a freshly created user and rotate the password; return cookie."""
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": USER_PASSWORD},
    )
    assert login.status_code == 200, login.text
    user_cookie = _cookie(client)
    change = await client.post(
        "/api/v1/auth/change-password",
        headers=_auth_headers(user_cookie),
        json={"old_password": USER_PASSWORD, "new_password": USER_NEW_PASSWORD},
    )
    assert change.status_code == 200, change.text
    return user_cookie


@pytest.mark.asyncio
async def test_non_admin_lists_own_keys_only_and_cannot_create_or_revoke(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await _bootstrap_admin(client)
        user_id = await create_user(
            client,
            admin_cookie,
            email="own-keys@contract.ziru.local",
            grade="user",
        )
        user_cookie = await _user_session_cookie(
            client,
            email="own-keys@contract.ziru.local",
        )

        # Admin mints a key owned by the user.
        created = await client.post(
            "/api/v2/api-keys",
            headers=_auth_headers(admin_cookie),
            json={"user_id": user_id, "name": "own-key"},
        )
        assert created.status_code == 200, created.text

        # The user sees ONLY their own key (previously this was a 403).
        own = await client.get(
            "/api/v2/api-keys",
            headers=_auth_headers(user_cookie),
        )
        assert own.status_code == 200, own.text
        keys = cast(list[dict[str, object]], own.json()["api_keys"])
        assert [key["name"] for key in keys] == ["own-key"]
        assert keys[0]["user_id"] == user_id
        assert own.json()["total"] == 1

        # Create and revoke stay admin-only.
        forbidden_create = await client.post(
            "/api/v2/api-keys",
            headers=_auth_headers(user_cookie),
            json={"user_id": user_id, "name": "nope"},
        )
        forbidden_delete = await client.delete(
            f"/api/v2/api-keys/{keys[0]['id']}",
            headers=_auth_headers(user_cookie),
        )
        assert forbidden_create.status_code == 403
        assert forbidden_delete.status_code == 403

        # Admin still sees every key.
        admin_list = await client.get(
            "/api/v2/api-keys",
            headers=_auth_headers(admin_cookie),
        )
        assert admin_list.status_code == 200
        admin_keys = cast(list[dict[str, object]], admin_list.json()["api_keys"])
        assert any(key["name"] == "own-key" for key in admin_keys)


@pytest.mark.asyncio
async def test_admin_creates_lists_and_revokes_any_api_key(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await _bootstrap_admin(client)
        user_id = await create_user(
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
async def test_admin_create_accepts_iso_and_console_local_expiry_formats(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await _bootstrap_admin(client)
        user_id = await create_user(
            client,
            admin_cookie,
            email="expiry-formats@contract.ziru.local",
        )
        headers = _auth_headers(admin_cookie)

        iso = await client.post(
            "/api/v2/api-keys",
            headers=headers,
            json={
                "user_id": user_id,
                "name": "iso-key",
                "expires_at": "2026-08-22T22:38:00",
            },
        )
        assert iso.status_code == 200, iso.text
        assert iso.json()["expires_at"] == "2026-08-22T22:38:00"

        console_format = await client.post(
            "/api/v2/api-keys",
            headers=headers,
            json={
                "user_id": user_id,
                "name": "console-key",
                "expires_at": "22/8/2026, 22:38",
            },
        )
        assert console_format.status_code == 200, console_format.text
        assert console_format.json()["expires_at"] == "2026-08-22T22:38:00"


@pytest.mark.asyncio
async def test_admin_create_invalid_expiry_returns_clear_422(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await _bootstrap_admin(client)
        user_id = await create_user(
            client,
            admin_cookie,
            email="expiry-invalid@contract.ziru.local",
        )
        response = await client.post(
            "/api/v2/api-keys",
            headers=_auth_headers(admin_cookie),
            json={
                "user_id": user_id,
                "name": "bad-date-key",
                "expires_at": "not-a-date",
            },
        )

    assert response.status_code == 422
    error = cast(dict[str, object], response.json()["error"])
    assert "expires_at" in cast(str, error["message"])


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
