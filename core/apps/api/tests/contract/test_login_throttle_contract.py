"""Contract tests for login brute-force throttling (P2 security hardening)."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from typing import Any, cast

import pytest
from httpx import AsyncClient, Response

from shared.services.password import hash_password
from shared.utils.utc_now import utc_now_naive
from tests.support.contract_database import ContractDatabase

WRONG_PASSWORD = "WrongPass2026!"
USER_PASSWORD = "UserPass2026!"


async def _login(client: AsyncClient, email: str, password: str) -> Response:
    return await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )


async def _create_user(
    email: str,
    *,
    disabled: bool = False,
    password: str = USER_PASSWORD,
) -> None:
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
            "id": f"login-throttle-{email}",
            "email": email,
            "password_hash": hash_password(password),
            "grade": "user",
            "must_change_password": False,
            "disabled": disabled,
            "created_at": utc_now_naive(),
            "updated_at": utc_now_naive(),
        },
    )


def _login_error_shape(response: Response) -> dict[str, Any]:
    """Error-body shape modulo the per-request request_id."""
    payload = cast(dict[str, object], response.json())
    error = cast(dict[str, object], payload["error"])
    return {
        "success": payload.get("success"),
        "top_keys": sorted(payload.keys()),
        "error_keys": sorted(error.keys()),
        "code": error.get("code"),
        "message": error.get("message"),
        "details": error.get("details"),
    }


def _assert_throttled(response: Response, *, expected_limit: int) -> dict[str, object]:
    assert response.status_code == 429
    assert "set-cookie" not in response.headers

    payload = cast(dict[str, object], response.json())
    error = cast(dict[str, object], payload["error"])
    details = cast(dict[str, object], error["details"])
    retry_after = cast(int, details["retry_after"])

    assert payload["success"] is False
    assert error["code"] == "RESOURCE_EXHAUSTED"
    assert error["message"] == (
        f"Rate limit exceeded. Please retry after {retry_after} seconds."
    )
    assert details["reason"] == "RATE_LIMIT_EXCEEDED"
    assert details["limit"] == expected_limit
    assert details["period"] == "login"
    assert retry_after >= 1
    assert response.headers["retry-after"] == str(retry_after)
    assert response.headers["x-ratelimit-limit"] == str(expected_limit)
    assert response.headers["x-ratelimit-period"] == "login"
    return details


@pytest.mark.asyncio
async def test_disabled_wrong_password_and_unknown_email_share_identical_401(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    email = "uniform-login@contract.ziru.local"
    async with api_client_factory() as client:
        await _create_user(email, disabled=True)
        unknown = await _login(
            client,
            "does-not-exist-uniform@contract.ziru.local",
            WRONG_PASSWORD,
        )
        wrong_password = await _login(client, email, WRONG_PASSWORD)
        disabled = await _login(client, email, USER_PASSWORD)

    assert unknown.status_code == 401
    assert wrong_password.status_code == 401
    assert disabled.status_code == 401
    assert _login_error_shape(unknown) == _login_error_shape(wrong_password)
    assert _login_error_shape(wrong_password) == _login_error_shape(disabled)
    assert "set-cookie" not in disabled.headers


@pytest.mark.asyncio
async def test_account_throttled_after_five_failures_even_with_correct_password(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    email = "account-throttle@contract.ziru.local"
    async with api_client_factory() as client:
        await _create_user(email)
        for _ in range(5):
            response = await _login(client, email, WRONG_PASSWORD)
            assert response.status_code == 401
        throttled = await _login(client, email, USER_PASSWORD)

    _assert_throttled(throttled, expected_limit=5)


@pytest.mark.asyncio
async def test_successful_login_resets_the_per_account_counter(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    email = "reset-throttle@contract.ziru.local"
    async with api_client_factory() as client:
        await _create_user(email)
        for _ in range(4):
            assert (await _login(client, email, WRONG_PASSWORD)).status_code == 401

        assert (await _login(client, email, USER_PASSWORD)).status_code == 200

        # If the successful login had not reset the counter, the four failures
        # below would leave the account throttled (8 >= 5).
        for _ in range(4):
            assert (await _login(client, email, WRONG_PASSWORD)).status_code == 401
        after_reset = await _login(client, email, USER_PASSWORD)

    assert after_reset.status_code == 200


@pytest.mark.asyncio
async def test_per_ip_throttled_after_twenty_failures(
    api_client_factory: Callable[
        [], AbstractAsyncContextManager[AsyncClient]
    ],
) -> None:
    async with api_client_factory() as client:
        for i in range(20):
            response = await _login(
                client,
                f"ip-failure-{i}@contract.ziru.local",
                WRONG_PASSWORD,
            )
            assert response.status_code == 401
        throttled = await _login(
            client,
            "ip-failure-20@contract.ziru.local",
            WRONG_PASSWORD,
        )

    _assert_throttled(throttled, expected_limit=20)
