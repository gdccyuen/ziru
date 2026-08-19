"""Contract tests: live grade/profile resolution at auth time (P2/Q10)."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from typing import cast

import pytest
from httpx import AsyncClient
from starlette.requests import Request

ADMIN_EMAIL = "admin@ziru.local"
DEFAULT_ADMIN_PASSWORD = "P@ss202607"


def _cookie(client: AsyncClient) -> str:
    value = client.cookies.get("ziru_session")
    assert value is not None
    return cast(str, value)


def _auth_headers(cookie_value: str) -> dict[str, str]:
    return {"Cookie": f"ziru_session={cookie_value}"}


async def _bootstrap_admin(client: AsyncClient) -> str:
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
            "new_password": "AdminPass2026!",
        },
    )
    assert change.status_code == 200
    return admin_cookie


async def _resolve_via_api_key(raw_api_key: str):
    """Run the real auth chain: api key -> identity -> live CurrentUser.

    Imports are deferred so they bind to the contract-environment modules
    (the test module is collected before the app is loaded).
    """
    from app.api.dependencies.current_user import with_current_user
    from app.services.auth.current_user_authentication_service import (
        get_current_user_authentication_service,
    )
    from app.services.rate_limit.data_structures import RouteAdmissionContext
    from shared.core.database import get_db_context

    async with get_db_context() as db:
        identity = await get_current_user_authentication_service().authenticate_authorization_header_with_identity(
            db,
            f"Bearer {raw_api_key}",
        )
        scope: dict[str, object] = {
            "type": "http",
            "method": "GET",
            "path": "/v1/jobs",
            "headers": [],
            "query_string": b"",
            "scheme": "http",
            "server": ("test", 80),
            "client": ("test", 1),
            "state": {"auth_source": identity.source},
        }
        request = Request(scope)  # pyright: ignore[reportArgumentType]
        route_context = RouteAdmissionContext(
            method="GET",
            path="/v1/jobs",
            limit_identifier="GET:/v1/jobs",
        )
        generator = with_current_user(
            request=request,
            route_context=route_context,
            user_id=identity.user_id,
            db=db,
        )
        current_user = await generator.__anext__()
        await generator.aclose()
        return current_user


@pytest.mark.asyncio
async def test_api_key_auth_resolves_live_grade_and_profile(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    from shared.core.exceptions.domain_exceptions import AuthException

    async with api_client_factory() as client:
        admin_cookie = await _bootstrap_admin(client)
        created = await client.post(
            "/api/v2/users",
            headers=_auth_headers(admin_cookie),
            json={
                "email": "live-profile@contract.ziru.local",
                "password": "UserPass2026!",
                "grade": "user",
                "profile": [{"key": "division", "values": ["finance"]}],
            },
        )
        assert created.status_code == 200
        user_id = cast(str, created.json()["id"])

        await client.post(
            "/api/v1/auth/login",
            json={
                "email": "live-profile@contract.ziru.local",
                "password": "UserPass2026!",
            },
        )
        user_cookie = _cookie(client)
        await client.post(
            "/api/v1/auth/change-password",
            headers=_auth_headers(user_cookie),
            json={
                "old_password": "UserPass2026!",
                "new_password": "LiveProfilePass2026!",
            },
        )
        key_response = await client.post(
            "/api/v1/auth/create",
            headers=_auth_headers(user_cookie),
            json={"name": "live-profile-key"},
        )
        assert key_response.status_code == 200
        raw_api_key = cast(str, key_response.json()["api_key"])

        current_user = await _resolve_via_api_key(raw_api_key)
        assert current_user.user_id == user_id
        assert current_user.grade == "user"
        assert current_user.profile == [
            {"key": "division", "values": ["finance"]}
        ]

        # Admin updates the profile; the next auth resolution sees the new value.
        update = await client.patch(
            f"/api/v2/users/{user_id}",
            headers=_auth_headers(admin_cookie),
            json={"profile": [{"key": "division", "values": ["engineering"]}]},
        )
        assert update.status_code == 200
        refreshed = await _resolve_via_api_key(raw_api_key)
        assert refreshed.profile == [
            {"key": "division", "values": ["engineering"]}
        ]

        # Disabling the user makes the same key resolve to nothing.
        disable = await client.patch(
            f"/api/v2/users/{user_id}",
            headers=_auth_headers(admin_cookie),
            json={"disabled": True},
        )
        assert disable.status_code == 200
        with pytest.raises(AuthException):
            await _resolve_via_api_key(raw_api_key)
