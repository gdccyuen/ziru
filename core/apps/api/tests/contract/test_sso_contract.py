"""Contract tests for the SSO OIDC flow (P2, ticket 03)."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from typing import Any, cast
from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient
from pytest import MonkeyPatch

from tests.support.oidc_idp import FakeOIDCServer, serve_fake_oidc_idp

ADMIN_EMAIL = "admin@ziru.local"
DEFAULT_ADMIN_PASSWORD = "P@ss202607"


def _cookie(client: AsyncClient) -> str:
    value = client.cookies.get("ziru_session")
    assert value is not None
    return cast(str, value)


def _auth_headers(cookie_value: str) -> dict[str, str]:
    return {"Cookie": f"ziru_session={cookie_value}"}


def _configure_oidc(monkeypatch: MonkeyPatch, idp: FakeOIDCServer) -> None:
    from shared.core.config import settings

    monkeypatch.setattr(settings, "SSO_OIDC_ISSUER", idp.endpoint)
    monkeypatch.setattr(settings, "SSO_OIDC_CLIENT_ID", "contract-oidc-client")
    monkeypatch.setattr(settings, "SSO_OIDC_CLIENT_SECRET", "contract-oidc-secret")


def _state_from_start_response(response) -> str:
    location = cast(str, response.headers["location"])
    query = parse_qs(urlparse(location).query)
    state_values = query.get("state", [])
    assert state_values, f"no state in {location}"
    return state_values[0]


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


@pytest.mark.asyncio
async def test_start_redirects_to_the_oidc_authorize_endpoint(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
    monkeypatch: MonkeyPatch,
) -> None:
    with serve_fake_oidc_idp() as idp:
        async with api_client_factory() as client:
            _configure_oidc(monkeypatch, idp)
            response = await client.get("/api/v1/auth/sso/oidc/start")

    assert response.status_code == 302
    location = cast(str, response.headers["location"])
    assert location.startswith(f"{idp.endpoint}/authorize")
    query = parse_qs(urlparse(location).query)
    assert query["client_id"] == ["contract-oidc-client"]
    assert query["response_type"] == ["code"]
    assert query["state"], "expected a CSRF state parameter"


@pytest.mark.asyncio
async def test_unknown_or_unconfigured_provider_is_501(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        unknown = await client.get("/api/v1/auth/sso/saml/start")
        unconfigured = await client.get("/api/v1/auth/sso/oidc/start")

    assert unknown.status_code == 501
    assert unconfigured.status_code == 501
    assert unknown.json()["error"]["code"] == "NOT_IMPLEMENTED"
    assert unconfigured.json()["error"]["code"] == "NOT_IMPLEMENTED"


@pytest.mark.asyncio
async def test_unlinked_subject_is_rejected_with_403(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
    monkeypatch: MonkeyPatch,
) -> None:
    with serve_fake_oidc_idp(subject="nobody@idp") as idp:
        async with api_client_factory() as client:
            _configure_oidc(monkeypatch, idp)
            start = await client.get("/api/v1/auth/sso/oidc/start")
            state = _state_from_start_response(start)
            callback = await client.get(
                "/api/v1/auth/sso/oidc/callback",
                params={"state": state, "code": "fake-auth-code"},
            )

    assert callback.status_code == 403
    error = cast(dict[str, object], callback.json()["error"])
    assert error["message"] == "SSO identity not linked to any account"


@pytest.mark.asyncio
async def test_prelinked_subject_creates_a_session(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
    monkeypatch: MonkeyPatch,
) -> None:
    with serve_fake_oidc_idp(subject="prelinked-subject") as idp:
        async with api_client_factory() as client:
            _configure_oidc(monkeypatch, idp)
            admin_cookie = await _bootstrap_admin(client)
            created = await client.post(
                "/api/v2/users",
                headers=_auth_headers(admin_cookie),
                json={
                    "email": "oidc-user@contract.ziru.local",
                    "password": "UserPass2026!",
                    "grade": "user",
                    "sso": {"provider": "oidc", "subject": "prelinked-subject"},
                },
            )
            assert created.status_code == 200

            start = await client.get("/api/v1/auth/sso/oidc/start")
            assert start.status_code == 302
            state = _state_from_start_response(start)
            callback = await client.get(
                "/api/v1/auth/sso/oidc/callback",
                params={"state": state, "code": "fake-auth-code"},
            )
            assert callback.status_code == 302
            assert callback.headers["location"] == "http://localhost:3000"
            assert "ziru_session" in callback.headers["set-cookie"]

            session_cookie = callback.headers["set-cookie"].split(";")[0].split("=", 1)[1]
            me = await client.get(
                "/api/v1/auth/me",
                headers=_auth_headers(session_cookie),
            )
            assert me.status_code == 200
            assert me.json()["email"] == "oidc-user@contract.ziru.local"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "override",
    [
        {"iss": "https://evil.example"},
        {"aud": "some-other-client"},
    ],
    ids=["wrong-issuer", "wrong-audience"],
)
async def test_invalid_issuer_or_audience_is_rejected(
    override: dict[str, Any],
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
    monkeypatch: MonkeyPatch,
) -> None:
    with serve_fake_oidc_idp(
        subject="strict-subject",
        token_claims_overrides=override,
    ) as idp:
        async with api_client_factory() as client:
            _configure_oidc(monkeypatch, idp)
            start = await client.get("/api/v1/auth/sso/oidc/start")
            state = _state_from_start_response(start)
            callback = await client.get(
                "/api/v1/auth/sso/oidc/callback",
                params={"state": state, "code": "fake-auth-code"},
            )

    assert callback.status_code == 401
    assert callback.json()["error"]["code"] == "UNAUTHENTICATED"
