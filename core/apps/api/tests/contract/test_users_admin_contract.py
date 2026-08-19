"""Contract tests for the admin users endpoints (P2, /v2/users)."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from typing import cast

import pytest
from httpx import AsyncClient

from tests.support.contract_database import ContractDatabase

ADMIN_EMAIL = "admin@ziru.local"
DEFAULT_ADMIN_PASSWORD = "P@ss202607"
ADMIN_NEW_PASSWORD = "AdminPass2026!"


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
    password: str = "UserPass2026!",
    grade: str = "user",
    profile: list[dict[str, object]] | None = None,
    sso: dict[str, str] | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "email": email,
        "password": password,
        "grade": grade,
    }
    if profile is not None:
        payload["profile"] = profile
    if sso is not None:
        payload["sso"] = sso
    response = await client.post(
        "/api/v2/users",
        headers=_auth_headers(admin_cookie),
        json=payload,
    )
    return cast(dict[str, object], response.json())


@pytest.mark.asyncio
async def test_non_admin_caller_is_forbidden_from_users_admin(
    developer_api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with developer_api_client_factory() as client:
        response = await client.get("/api/v2/users")

    assert response.status_code == 403
    error = cast(dict[str, object], response.json()["error"])
    assert error["code"] == "PERMISSION_DENIED"
    assert error["message"] == "Administrator access required"


@pytest.mark.asyncio
async def test_admin_creates_librarian_and_user_with_profiles(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await _bootstrap_admin(client)
        librarian = await _create_user(
            client,
            admin_cookie,
            email="librarian@contract.ziru.local",
            grade="librarian",
            profile=[{"key": "division", "values": ["finance"]}],
        )
        assert librarian["grade"] == "librarian"
        assert librarian["profile"] == [
            {"key": "division", "values": ["finance"]}
        ]
        assert librarian["must_change_password"] is True

        regular = await _create_user(
            client,
            admin_cookie,
            email="regular@contract.ziru.local",
            grade="user",
            profile=[{"key": "division", "values": ["hr"]}],
        )
        assert regular["grade"] == "user"
        assert regular["profile"] == [{"key": "division", "values": ["hr"]}]

        listed = await client.get(
            "/api/v2/users",
            headers=_auth_headers(admin_cookie),
        )
        assert listed.status_code == 200
        listed_json = cast(dict[str, object], listed.json())
        users = cast(list[dict[str, object]], listed_json["users"])
        emails = {cast(str, user["email"]) for user in users}
        assert "librarian@contract.ziru.local" in emails
        assert "regular@contract.ziru.local" in emails
        assert listed_json["total"] >= 2

        librarian_id = cast(str, librarian["id"])
        detail = await client.get(
            f"/api/v2/users/{librarian_id}",
            headers=_auth_headers(admin_cookie),
        )
        assert detail.status_code == 200
        assert detail.json()["email"] == "librarian@contract.ziru.local"


@pytest.mark.asyncio
async def test_profile_validation_rejects_empty_values(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await _bootstrap_admin(client)
        response = await client.post(
            "/api/v2/users",
            headers=_auth_headers(admin_cookie),
            json={
                "email": "empty-profile@contract.ziru.local",
                "password": "UserPass2026!",
                "grade": "user",
                "profile": [{"key": "division", "values": []}],
            },
        )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_ARGUMENT"


@pytest.mark.asyncio
async def test_duplicate_email_conflicts(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await _bootstrap_admin(client)
        first = await _create_user(client, admin_cookie, email="dup@contract.ziru.local")
        assert first["email"] == "dup@contract.ziru.local"
        duplicate = await client.post(
            "/api/v2/users",
            headers=_auth_headers(admin_cookie),
            json={
                "email": "DUP@contract.ziru.local",
                "password": "UserPass2026!",
                "grade": "user",
            },
        )

    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "ALREADY_EXISTS"


@pytest.mark.asyncio
async def test_disable_user_revokes_session_and_rejects_api_key(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await _bootstrap_admin(client)
        created = await _create_user(
            client,
            admin_cookie,
            email="disable-me@contract.ziru.local",
        )
        user_id = cast(str, created["id"])

        user_login = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "disable-me@contract.ziru.local",
                "password": "UserPass2026!",
            },
        )
        assert user_login.status_code == 200
        user_cookie = _cookie(client)
        await client.post(
            "/api/v1/auth/change-password",
            headers=_auth_headers(user_cookie),
            json={
                "old_password": "UserPass2026!",
                "new_password": "DisableUserPass2026!",
            },
        )
        key_creation = await client.post(
            "/api/v1/auth/create",
            headers=_auth_headers(user_cookie),
            json={"name": "disable-me-key"},
        )
        assert key_creation.status_code == 200
        raw_api_key = cast(str, key_creation.json()["api_key"])

        assert (
            await client.get(
                "/api/v1/jobs",
                headers=_auth_headers(user_cookie),
            )
        ).status_code == 200
        assert (
            await client.get(
                "/api/v1/jobs",
                headers={"Authorization": f"Bearer {raw_api_key}"},
            )
        ).status_code == 200

        disable = await client.patch(
            f"/api/v2/users/{user_id}",
            headers=_auth_headers(admin_cookie),
            json={"disabled": True},
        )
        assert disable.status_code == 200
        assert disable.json()["disabled"] is True

        session_after = await client.get(
            "/api/v1/jobs",
            headers=_auth_headers(user_cookie),
        )
        key_after = await client.get(
            "/api/v1/jobs",
            headers={"Authorization": f"Bearer {raw_api_key}"},
        )

    assert session_after.status_code == 401
    assert key_after.status_code == 401


@pytest.mark.asyncio
async def test_reset_password_returns_temporary_password_once(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await _bootstrap_admin(client)
        created = await _create_user(
            client,
            admin_cookie,
            email="reset-me@contract.ziru.local",
        )
        user_id = cast(str, created["id"])

        reset = await client.patch(
            f"/api/v2/users/{user_id}",
            headers=_auth_headers(admin_cookie),
            json={"reset_password": True},
        )
        assert reset.status_code == 200
        reset_json = cast(dict[str, object], reset.json())
        temporary_password = cast(str, reset_json.get("temporary_password"))
        assert temporary_password
        assert reset_json["must_change_password"] is True

        detail = await client.get(
            f"/api/v2/users/{user_id}",
            headers=_auth_headers(admin_cookie),
        )
        assert detail.status_code == 200
        assert detail.json()["must_change_password"] is True
        assert "temporary_password" not in detail.json()

        login = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "reset-me@contract.ziru.local",
                "password": temporary_password,
            },
        )
        assert login.status_code == 200
        assert login.json()["must_change_password"] is True


@pytest.mark.asyncio
async def test_sso_prelink_creates_external_identity_link(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await _bootstrap_admin(client)
        created = await _create_user(
            client,
            admin_cookie,
            email="sso-linked@contract.ziru.local",
            sso={"provider": "oidc", "subject": "sub-oidc-1"},
        )
        assert created["id"]
        link = await ContractDatabase.fetch_one(
            """
            SELECT user_id, provider, provider_subject
            FROM external_identity_links
            WHERE provider = :provider AND provider_subject = :subject
            """,
            {"provider": "oidc", "subject": "sub-oidc-1"},
        )

    assert link is not None
    assert link["user_id"] == created["id"]
    assert link["provider"] == "oidc"
    assert link["provider_subject"] == "sub-oidc-1"


@pytest.mark.asyncio
async def test_duplicate_provider_subject_conflicts(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie = await _bootstrap_admin(client)
        first = await _create_user(
            client,
            admin_cookie,
            email="sso-first@contract.ziru.local",
            sso={"provider": "oidc", "subject": "dup-subject"},
        )
        assert first["id"]
        duplicate = await client.post(
            "/api/v2/users",
            headers=_auth_headers(admin_cookie),
            json={
                "email": "sso-second@contract.ziru.local",
                "password": "UserPass2026!",
                "grade": "user",
                "sso": {"provider": "oidc", "subject": "dup-subject"},
            },
        )

    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "ALREADY_EXISTS"
