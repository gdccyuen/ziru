"""Contract tests: client tampering cannot influence identity/grade/profile (P2).

Proves the account-security claim: identity, grade, and profile are always
resolved server-side from the database after credential authentication
(API-key hash lookup or session-token lookup). Request fields, headers, and
cookies cannot forge privileges, alter the resolved account facts, or bypass
the disabled/password-change gates.
"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from secrets import token_urlsafe
from typing import Any, cast

import pytest
from httpx import AsyncClient

ADMIN_EMAIL = "admin@ziru.local"
DEFAULT_ADMIN_PASSWORD = "P@ss202607"
ADMIN_NEW_PASSWORD = "AdminPass2026!"
USER_PASSWORD = "UserPass2026!"
USER_NEW_PASSWORD = "RotatedPass2026!"
FINANCE_PROFILE = [{"key": "division", "values": ["finance"]}]


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


async def _bootstrap_admin(client: AsyncClient) -> tuple[str, str]:
    """Rotate the bootstrap admin password; return (admin_cookie, admin_id)."""
    login = await _login(client, ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD)
    assert login.status_code == 200, login.text
    admin_id = cast(str, login.json()["id"])
    admin_cookie = _cookie(client)
    change = await client.post(
        "/api/v1/auth/change-password",
        headers=_auth_headers(admin_cookie),
        json={
            "old_password": DEFAULT_ADMIN_PASSWORD,
            "new_password": ADMIN_NEW_PASSWORD,
        },
    )
    assert change.status_code == 200, change.text
    return admin_cookie, admin_id


async def _create_user(
    client: AsyncClient,
    admin_cookie: str,
    *,
    email: str,
    grade: str = "user",
    profile: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "email": email,
        "password": USER_PASSWORD,
        "grade": grade,
    }
    if profile is not None:
        payload["profile"] = profile
    response = await client.post(
        "/api/v2/users",
        headers=_auth_headers(admin_cookie),
        json=payload,
    )
    assert response.status_code == 200, response.text
    return cast(dict[str, Any], response.json())


async def _prepare_user_with_key(
    client: AsyncClient,
    admin_cookie: str,
    *,
    email: str,
    grade: str = "user",
    profile: list[dict[str, Any]] | None = None,
) -> tuple[dict[str, Any], str, str]:
    """Create a user, rotate their password, mint an API key.

    Returns (user_payload, user_session_cookie, raw_api_key).
    """
    user = await _create_user(
        client,
        admin_cookie,
        email=email,
        grade=grade,
        profile=profile,
    )
    login = await _login(client, email, USER_PASSWORD)
    assert login.status_code == 200, login.text
    cookie = _cookie(client)
    change = await client.post(
        "/api/v1/auth/change-password",
        headers=_auth_headers(cookie),
        json={
            "old_password": USER_PASSWORD,
            "new_password": USER_NEW_PASSWORD,
        },
    )
    assert change.status_code == 200, change.text
    key_response = await client.post(
        "/api/v1/auth/create",
        headers=_auth_headers(cookie),
        json={"name": f"{email}-tamper-key"},
    )
    assert key_response.status_code == 200, key_response.text
    raw_key = cast(str, key_response.json()["api_key"])
    return user, cookie, raw_key


def _error_shape(payload: dict[str, Any]) -> dict[str, Any]:
    """Error-body shape modulo per-request request_id."""
    error = cast(dict[str, Any], payload["error"])
    return {
        "success": payload.get("success"),
        "top_keys": sorted(payload.keys()),
        "error_keys": sorted(error.keys()),
        "code": error.get("code"),
        "message": error.get("message"),
        "details": error.get("details"),
    }


@pytest.mark.asyncio
async def test_forged_privilege_headers_and_body_do_not_escalate_user_key(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie, admin_id = await _bootstrap_admin(client)
        _, _, raw_key = await _prepare_user_with_key(
            client,
            admin_cookie,
            email="plain-user@contract.ziru.local",
            grade="user",
        )
        forged_email = "forged-admin@contract.ziru.local"
        response = await client.post(
            "/api/v2/users",
            headers={
                "Authorization": f"Bearer {raw_key}",
                "X-User-Grade": "administrator",
                "X-User-Id": admin_id,
            },
            json={
                "email": forged_email,
                "password": "ForgedPass2026!",
                "grade": "administrator",
                "profile": [],
            },
        )
        forged_get = await client.get(
            "/api/v2/users",
            headers={
                "Authorization": f"Bearer {raw_key}",
                "X-User-Grade": "administrator",
                "X-User-Id": admin_id,
            },
        )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PERMISSION_DENIED"
    assert forged_get.status_code == 403
    assert forged_get.json()["error"]["code"] == "PERMISSION_DENIED"


@pytest.mark.asyncio
async def test_login_ignores_forged_body_fields(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie, admin_id = await _bootstrap_admin(client)
        user = await _create_user(
            client,
            admin_cookie,
            email="forged-body@contract.ziru.local",
            grade="user",
            profile=FINANCE_PROFILE,
        )
        login = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "forged-body@contract.ziru.local",
                "password": USER_PASSWORD,
                "grade": "administrator",
                "profile": [],
                "id": admin_id,
            },
        )

    assert login.status_code == 200
    payload = cast(dict[str, Any], login.json())
    assert payload["id"] == user["id"]
    assert payload["grade"] == "user"
    assert payload["profile"] == FINANCE_PROFILE


@pytest.mark.asyncio
async def test_tampered_session_cookie_is_rejected(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        login = await _login(client, ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD)
        assert login.status_code == 200
        cookie = _cookie(client)
        assert (
            await client.get(
                "/api/v1/auth/me",
                headers=_auth_headers(cookie),
            )
        ).status_code == 200
        altered = await client.get(
            "/api/v1/auth/me",
            headers=_auth_headers(cookie + "x"),
        )
        random = await client.get(
            "/api/v1/auth/me",
            headers=_auth_headers(token_urlsafe(32)),
        )

    assert altered.status_code == 401
    assert random.status_code == 401
    assert altered.json()["error"]["code"] == "UNAUTHENTICATED"
    assert random.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_forged_bearer_api_key_is_rejected(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        response = await client.get(
            "/api/v1/jobs",
            headers={"Authorization": f"Bearer sk_{token_urlsafe(32)}"},
        )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_disabled_user_rejected_immediately_for_session_and_key(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie, _ = await _bootstrap_admin(client)
        user, cookie, raw_key = await _prepare_user_with_key(
            client,
            admin_cookie,
            email="disable-immediately@contract.ziru.local",
        )
        assert (
            await client.get(
                "/api/v1/jobs",
                headers=_auth_headers(cookie),
            )
        ).status_code == 200
        assert (
            await client.get(
                "/api/v1/jobs",
                headers={"Authorization": f"Bearer {raw_key}"},
            )
        ).status_code == 200

        disable = await client.patch(
            f"/api/v2/users/{user['id']}",
            headers=_auth_headers(admin_cookie),
            json={"disabled": True},
        )
        assert disable.status_code == 200
        session_after = await client.get(
            "/api/v1/jobs",
            headers=_auth_headers(cookie),
        )
        key_after = await client.get(
            "/api/v1/jobs",
            headers={"Authorization": f"Bearer {raw_key}"},
        )

    assert session_after.status_code == 401
    assert key_after.status_code == 401


@pytest.mark.asyncio
async def test_librarian_cannot_escalate_via_forged_grade(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie, _ = await _bootstrap_admin(client)
        librarian, _, raw_key = await _prepare_user_with_key(
            client,
            admin_cookie,
            email="librarian-ladder@contract.ziru.local",
            grade="librarian",
        )
        forged = {
            "Authorization": f"Bearer {raw_key}",
            "X-User-Grade": "administrator",
        }
        create = await client.post(
            "/api/v2/users",
            headers=forged,
            json={
                "email": "ladder-forged@contract.ziru.local",
                "password": "LadderPass2026!",
                "grade": "administrator",
            },
        )
        patch = await client.patch(
            f"/api/v2/users/{librarian['id']}",
            headers=forged,
            json={"grade": "administrator"},
        )
        detail = await client.get(
            f"/api/v2/users/{librarian['id']}",
            headers=_auth_headers(admin_cookie),
        )

    assert create.status_code == 403
    assert patch.status_code == 403
    assert detail.status_code == 200
    assert detail.json()["grade"] == "librarian"


@pytest.mark.asyncio
async def test_profile_always_resolved_from_db_not_request(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie, _ = await _bootstrap_admin(client)
        _, cookie, raw_key = await _prepare_user_with_key(
            client,
            admin_cookie,
            email="profile-db@contract.ziru.local",
            grade="user",
            profile=FINANCE_PROFILE,
        )
        forged_profile = '[{"key": "division", "values": ["hr"]}]'
        me = await client.get(
            "/api/v1/auth/me",
            headers={
                **_auth_headers(cookie),
                "X-User-Profile": forged_profile,
            },
            params={"profile": forged_profile},
        )
        key_request = await client.get(
            "/api/v1/jobs",
            headers={
                "Authorization": f"Bearer {raw_key}",
                "X-User-Profile": forged_profile,
            },
            params={"profile": forged_profile},
        )

    assert me.status_code == 200
    assert me.json()["profile"] == FINANCE_PROFILE
    assert key_request.status_code == 200


@pytest.mark.asyncio
async def test_login_does_not_enumerate_users(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        admin_cookie, _ = await _bootstrap_admin(client)
        await _create_user(
            client,
            admin_cookie,
            email="known-enum@contract.ziru.local",
        )
        unknown = await _login(
            client,
            "does-not-exist@contract.ziru.local",
            "WrongPass2026!",
        )
        wrong_password = await _login(
            client,
            "known-enum@contract.ziru.local",
            "WrongPass2026!",
        )

    assert unknown.status_code == 401
    assert wrong_password.status_code == 401
    assert _error_shape(unknown.json()) == _error_shape(wrong_password.json())


@pytest.mark.asyncio
async def test_session_cookie_httponly_samesite_lax(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        response = await _login(client, ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD)

    assert response.status_code == 200
    set_cookie = response.headers["set-cookie"].lower()
    assert "ziru_session=" in set_cookie
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie
    # Contract environment leaves SESSION_COOKIE_SECURE at its default (false).
    assert "secure" not in set_cookie


@pytest.mark.asyncio
async def test_session_cookie_secure_flag_when_enabled(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with api_client_factory() as client:
        import shared.core.config as config_module

        monkeypatch.setattr(config_module.settings, "SESSION_COOKIE_SECURE", True)
        response = await _login(client, ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD)

    assert response.status_code == 200
    assert "secure" in response.headers["set-cookie"].lower()


@pytest.mark.asyncio
async def test_bootstrap_default_password_window(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        login = await _login(client, ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD)
        assert login.status_code == 200
        assert login.json()["must_change_password"] is True
        cookie = _cookie(client)

        gated = await client.get(
            "/api/v2/users",
            headers=_auth_headers(cookie),
        )
        assert gated.status_code == 403
        assert gated.json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"

        changed = await client.post(
            "/api/v1/auth/change-password",
            headers=_auth_headers(cookie),
            json={
                "old_password": DEFAULT_ADMIN_PASSWORD,
                "new_password": ADMIN_NEW_PASSWORD,
            },
        )
        assert changed.status_code == 200

        allowed = await client.get(
            "/api/v2/users",
            headers=_auth_headers(cookie),
        )
        assert allowed.status_code == 200
        assert allowed.json()["total"] >= 1
