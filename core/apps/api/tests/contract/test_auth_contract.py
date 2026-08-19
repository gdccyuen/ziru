"""Contract tests for the session auth endpoints (P2)."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from typing import cast

import pytest
from httpx import AsyncClient

from shared.services.password import hash_password
from shared.utils.api_keys import generate_api_key, hash_api_key
from shared.utils.utc_now import utc_now_naive
from tests.support.contract_database import ContractDatabase

ADMIN_EMAIL = "admin@ziru.local"
DEFAULT_ADMIN_PASSWORD = "P@ss202607"


def _cookie(client: AsyncClient) -> str:
    value = client.cookies.get("ziru_session")
    assert value is not None, "expected a ziru_session cookie in the jar"
    return cast(str, value)


def _auth_headers(cookie_value: str) -> dict[str, str]:
    return {"Cookie": f"ziru_session={cookie_value}"}


async def _login(client: AsyncClient, email: str, password: str):
    return await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )


@pytest.mark.asyncio
async def test_bootstrap_admin_exists_after_startup_and_can_login(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        response = await _login(client, ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD)

    assert response.status_code == 200
    assert "ziru_session" in response.headers["set-cookie"]
    payload = cast(dict[str, object], response.json())
    assert payload["email"] == ADMIN_EMAIL
    assert payload["grade"] == "administrator"
    assert payload["must_change_password"] is True
    assert payload["disabled"] is False
    assert payload["id"]


@pytest.mark.asyncio
async def test_login_with_wrong_password_is_401(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        response = await _login(client, ADMIN_EMAIL, "wrong-password")

    assert response.status_code == 401
    error = cast(dict[str, object], response.json()["error"])
    assert error["code"] == "UNAUTHENTICATED"
    assert error["message"] == "Invalid email or password"


@pytest.mark.asyncio
async def test_disabled_user_login_is_403(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    email = "disabled-login@contract.ziru.local"
    password = "DisabledPass2026!"
    async with api_client_factory() as client:
        await ContractDatabase.execute(
            """
            INSERT INTO users (
                id, email, password_hash, grade, profile,
                must_change_password, disabled, created_at, updated_at
            ) VALUES (
                :id, :email, :password_hash, :grade, NULL,
                :must_change_password, :disabled, :created_at, :updated_at
            )
            """,
            {
                "id": "disabled-login-user",
                "email": email,
                "password_hash": hash_password(password),
                "grade": "user",
                "must_change_password": False,
                "disabled": True,
                "created_at": utc_now_naive(),
                "updated_at": utc_now_naive(),
            },
        )
        response = await _login(client, email, password)

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PERMISSION_DENIED"


@pytest.mark.asyncio
async def test_forced_password_change_flow(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        # Admin: change the bootstrap password first so it can create users.
        admin_login = await _login(client, ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD)
        assert admin_login.status_code == 200
        admin_cookie = _cookie(client)
        change_admin = await client.post(
            "/api/v1/auth/change-password",
            headers=_auth_headers(admin_cookie),
            json={
                "old_password": DEFAULT_ADMIN_PASSWORD,
                "new_password": "AdminPass2026!",
            },
        )
        assert change_admin.status_code == 200

        create_response = await client.post(
            "/api/v2/users",
            headers=_auth_headers(admin_cookie),
            json={
                "email": "fresh-user@contract.ziru.local",
                "password": "UserPass2026!",
                "grade": "user",
                "profile": [{"key": "division", "values": ["finance"]}],
            },
        )
        assert create_response.status_code == 200
        user_id = cast(str, create_response.json()["id"])

        # Seed an API key for the fresh user: API-key auth must NOT be gated.
        raw_api_key = generate_api_key()
        await ContractDatabase.execute(
            """
            INSERT INTO api_keys (
                id, user_id, key_hash, key_mask, name, is_active, created_at
            ) VALUES (
                :id, :user_id, :key_hash, :key_mask, :name, :is_active, :created_at
            )
            """,
            {
                "id": "key_fresh_user",
                "user_id": user_id,
                "key_hash": hash_api_key(raw_api_key),
                "key_mask": f"{raw_api_key[:8]}...",
                "name": "fresh-user-key",
                "is_active": True,
                "created_at": utc_now_naive(),
            },
        )

        # Fresh user login -> forced change required.
        user_login = await _login(client, "fresh-user@contract.ziru.local", "UserPass2026!")
        assert user_login.status_code == 200
        user_cookie = _cookie(client)
        me_response = await client.get(
            "/api/v1/auth/me",
            headers=_auth_headers(user_cookie),
        )
        assert me_response.status_code == 200
        assert me_response.json()["must_change_password"] is True

        # An unrelated session endpoint is gated.
        gated_response = await client.get(
            "/api/v1/jobs",
            headers=_auth_headers(user_cookie),
        )
        assert gated_response.status_code == 403
        assert gated_response.json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"

        # API-key auth is NOT gated by must_change_password.
        key_response = await client.get(
            "/api/v1/jobs",
            headers={"Authorization": f"Bearer {raw_api_key}"},
        )
        assert key_response.status_code == 200

        # Change password clears the flag.
        change_response = await client.post(
            "/api/v1/auth/change-password",
            headers=_auth_headers(user_cookie),
            json={
                "old_password": "UserPass2026!",
                "new_password": "FreshUserPass2026!",
            },
        )
        assert change_response.status_code == 200
        me_after = await client.get(
            "/api/v1/auth/me",
            headers=_auth_headers(user_cookie),
        )
        assert me_after.status_code == 200
        assert me_after.json()["must_change_password"] is False
        unblocked = await client.get(
            "/api/v1/jobs",
            headers=_auth_headers(user_cookie),
        )
        assert unblocked.status_code == 200


@pytest.mark.asyncio
async def test_logout_revokes_the_session(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        login = await _login(client, ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD)
        assert login.status_code == 200
        cookie = _cookie(client)
        me_before = await client.get(
            "/api/v1/auth/me",
            headers=_auth_headers(cookie),
        )
        assert me_before.status_code == 200

        logout = await client.post(
            "/api/v1/auth/logout",
            headers=_auth_headers(cookie),
        )
        assert logout.status_code == 200
        assert logout.json() == {"message": "Logged out"}

        me_after = await client.get(
            "/api/v1/auth/me",
            headers=_auth_headers(cookie),
        )
        assert me_after.status_code == 401
