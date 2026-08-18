"""Admin utility: create a standalone API user and generate an API key.

Overhaul bootstrap helper (P1). The old billing/tier credits bootstrap was
removed with the billing domain. A password is still required by the account
model; a random one is generated (and discarded) when none is provided, so
the account is usable via its API key only.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import secrets
import sys
from typing import TypedDict
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.core.database import engine, get_db_context
from shared.models.database.api_key import APIKey
from shared.models.database.user import GRADE_USER, User
from shared.utils.api_keys import generate_api_key, hash_api_key, mask_api_key

_DEFAULT_API_KEY_NAME: str = "standalone-api-key"


class InitializedStandaloneUser(TypedDict):
    user_id: str
    email: str
    api_key_name: str
    api_key: str


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Create or fetch an API-only standalone user and generate an API key."
        ),
    )
    parser.add_argument("--email", required=True, help="User email address.")
    parser.add_argument(
        "--user-id",
        default="",
        help="Optional user ID for deterministic local or test bootstrap.",
    )
    parser.add_argument(
        "--key-name",
        default=_DEFAULT_API_KEY_NAME,
        help="Display name prefix for the generated API key.",
    )
    parser.add_argument(
        "--password",
        default="",
        help="Optional initial password. Defaults to a random (discarded) value.",
    )
    return parser


async def _find_or_create_user(
    session: AsyncSession,
    *,
    email: str,
    requested_user_id: str,
    password: str,
) -> User:
    normalized_email = email.strip().lower()
    if not normalized_email:
        raise ValueError("email must not be empty")

    result = await session.execute(
        select(User).where(User.email == normalized_email).limit(1)
    )
    user = result.scalar_one_or_none()
    if user is not None:
        return user

    if requested_user_id.strip():
        existing_user = await session.get(User, requested_user_id.strip())
        if existing_user is not None:
            raise ValueError(
                "requested user_id already exists for a different email: "
                f"user_id={requested_user_id}"
            )

    # The account model requires a password hash. A random value keeps the
    # account API-key-usable; password login only works after a real password
    # is set (P2 account API).
    password_value = password or secrets.token_urlsafe(24)

    import hashlib

    # Placeholder hash until the P2 account API lands (then Argon2).
    placeholder_hash = hashlib.sha256(password_value.encode()).hexdigest()
    user = User(
        id=requested_user_id.strip() or f"user_{uuid4().hex[:24]}",
        email=normalized_email,
        password_hash=placeholder_hash,
        grade=GRADE_USER,
        must_change_password=False,
    )
    session.add(user)
    await session.flush()
    return user


async def _resolve_key_name(
    session: AsyncSession,
    *,
    user_id: str,
    requested_name: str,
) -> str:
    key_name = requested_name.strip() or _DEFAULT_API_KEY_NAME
    existing_names = set(
        (
            await session.execute(
                select(APIKey.name).where(APIKey.user_id == user_id)
            )
        )
        .scalars()
        .all()
    )
    if key_name not in existing_names:
        return key_name

    suffix = 2
    while f"{key_name}-{suffix}" in existing_names:
        suffix += 1
    return f"{key_name}-{suffix}"


async def _create_api_key(
    session: AsyncSession,
    *,
    user_id: str,
    key_name: str,
) -> str:
    api_key = generate_api_key()
    session.add(
        APIKey(
            user_id=user_id,
            key_hash=hash_api_key(api_key),
            key_mask=mask_api_key(api_key),
            name=key_name,
        )
    )
    return api_key


async def initialize_standalone_user(
    *,
    email: str,
    user_id: str = "",
    key_name: str = _DEFAULT_API_KEY_NAME,
    password: str = "",
) -> InitializedStandaloneUser:
    async with get_db_context() as session:
        user = await _find_or_create_user(
            session,
            email=email,
            requested_user_id=user_id,
            password=password,
        )
        key_name = await _resolve_key_name(
            session,
            user_id=user.id,
            requested_name=key_name,
        )
        api_key = await _create_api_key(
            session,
            user_id=user.id,
            key_name=key_name,
        )
        await session.commit()

    return {
        "user_id": str(user.id),
        "email": str(user.email),
        "api_key_name": key_name,
        "api_key": api_key,
    }


async def _run(args: argparse.Namespace) -> int:
    initialized_user = await initialize_standalone_user(
        email=str(args.email),
        user_id=str(args.user_id),
        key_name=str(args.key_name),
        password=str(args.password),
    )

    print(f"user_id={initialized_user['user_id']}")
    print(f"email={initialized_user['email']}")
    print(f"api_key_name={initialized_user['api_key_name']}")
    print(f"api_key={initialized_user['api_key']}")
    return 0


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()
    return asyncio.run(_run(args))


if __name__ == "__main__":
    raise SystemExit(main())
