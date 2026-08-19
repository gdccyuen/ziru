"""Shared helpers for the P3 knowledge API contract tests."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from typing import cast
from uuid import uuid4

from httpx import AsyncClient

from tests.support.contract_database import ContractDatabase
from shared.models.database.user import GRADE_ADMINISTRATOR, GRADE_LIBRARIAN, GRADE_USER

ADMIN_EMAIL = "admin@ziru.local"
DEFAULT_ADMIN_PASSWORD = "P@ss202607"
ADMIN_NEW_PASSWORD = "AdminPass2026!"
USER_PASSWORD = "UserPass2026!"
USER_NEW_PASSWORD = "UserPass2026!x"


def _cookie(client: AsyncClient) -> str:
    value = client.cookies.get("ziru_session")
    assert value is not None
    return cast(str, value)


def _auth_headers(cookie_value: str) -> dict[str, str]:
    return {"Cookie": f"ziru_session={cookie_value}"}


async def bootstrap_admin(client: AsyncClient) -> str:
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


async def create_user(
    client: AsyncClient,
    admin_cookie: str,
    *,
    email: str,
    grade: str = GRADE_USER,
    profile: list[dict[str, object]] | None = None,
) -> str:
    payload: dict[str, object] = {
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
    return cast(str, response.json()["id"])


async def issue_api_key(
    client: AsyncClient,
    *,
    email: str,
    password: str = USER_PASSWORD,
    new_password: str = USER_NEW_PASSWORD,
) -> str:
    """Log in as the user, rotate the password, and mint an API key."""
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200, login.text
    user_cookie = _cookie(client)
    change = await client.post(
        "/api/v1/auth/change-password",
        headers=_auth_headers(user_cookie),
        json={"old_password": password, "new_password": new_password},
    )
    assert change.status_code == 200, change.text
    key_response = await client.post(
        "/api/v1/auth/create",
        headers=_auth_headers(user_cookie),
        json={"name": f"v2-knowledge-{email}"},
    )
    assert key_response.status_code == 200, key_response.text
    return cast(str, key_response.json()["api_key"])


async def create_user_with_key(
    client: AsyncClient,
    admin_cookie: str,
    *,
    email: str,
    grade: str = GRADE_USER,
    profile: list[dict[str, object]] | None = None,
) -> tuple[str, str]:
    user_id = await create_user(
        client,
        admin_cookie,
        email=email,
        grade=grade,
        profile=profile,
    )
    api_key = await issue_api_key(client, email=email)
    return user_id, api_key


async def ensure_user_exists(user_id: str) -> None:
    """Insert a placeholder user row when needed (jobs.user_id FK)."""
    row = await ContractDatabase.fetch_one(
        "SELECT id FROM users WHERE id = :user_id",
        {"user_id": user_id},
    )
    if row is None:
        await ContractDatabase.insert_user(user_id=user_id)


async def seed_attribute_dictionary(
    entries: dict[str, list[str] | None],
) -> None:
    for key, allowed_values in entries.items():
        await ContractDatabase.insert_attribute_dictionary(
            key=key,
            allowed_values=allowed_values,
        )


async def seed_document_with_attributes(
    *,
    document_id: str,
    attributes: dict[str, list[str]],
    namespace: str = "contract-v2",
    user_id: str = "local-dev-user",
    status: str = "active",
    source_file_name: str | None = None,
) -> None:
    await ensure_user_exists(user_id)
    await ContractDatabase.insert_document(
        document_id=document_id,
        user_id=user_id,
        namespace=namespace,
        status=status,
        source_file_name=source_file_name or f"{document_id}.pdf",
    )
    for key, values in attributes.items():
        for value in values:
            await ContractDatabase.insert_document_attribute(
                document_id=document_id,
                attr_key=key,
                attr_value=value,
            )


async def seed_retrieval_document_with_attributes(
    *,
    document_id: str,
    attributes: dict[str, list[str]],
    namespace: str = "contract-v2-search",
    user_id: str = "local-dev-user",
    source_file_name: str,
    section_path: str,
    content: str,
    chunk_type: str = "text",
) -> dict[str, str]:
    job_id = f"job_{uuid4().hex[:12]}"
    job_result_id = str(uuid4())
    section_id = f"sec_{uuid4().hex[:12]}"
    chunk_id = f"chunk_{uuid4().hex[:12]}"

    await ensure_user_exists(user_id)
    await ContractDatabase.insert_job(
        job_id=job_id,
        user_id=user_id,
        status="done",
        source_type="file",
        job_metadata={
            "document_id": document_id,
            "namespace": namespace,
            "source_type": "file",
        },
    )
    await ContractDatabase.insert_document(
        document_id=document_id,
        user_id=user_id,
        namespace=namespace,
        source_file_name=source_file_name,
    )
    await ContractDatabase.insert_job_result(
        job_result_id=job_result_id,
        job_id=job_id,
        document_id=document_id,
        delivery_mode="inline",
    )
    await ContractDatabase.execute(
        """
        UPDATE documents
        SET current_job_result_id = :job_result_id
        WHERE document_id = :document_id
        """,
        {
            "job_result_id": job_result_id,
            "document_id": document_id,
        },
    )
    await ContractDatabase.insert_document_section(
        section_id=section_id,
        user_id=user_id,
        namespace=namespace,
        document_id=document_id,
        job_result_id=job_result_id,
        section_path=section_path,
        section_title=section_path.split("/")[-1],
    )
    await ContractDatabase.insert_document_chunk(
        chunk_id=chunk_id,
        user_id=user_id,
        namespace=namespace,
        document_id=document_id,
        job_result_id=job_result_id,
        section_id=section_id,
        chunk_type=chunk_type,
        content=content,
        section_path=section_path,
    )
    for key, values in attributes.items():
        for value in values:
            await ContractDatabase.insert_document_attribute(
                document_id=document_id,
                attr_key=key,
                attr_value=value,
            )
    return {
        "document_id": document_id,
        "job_id": job_id,
        "job_result_id": job_result_id,
        "section_id": section_id,
        "chunk_id": chunk_id,
        "section_path": section_path,
    }
