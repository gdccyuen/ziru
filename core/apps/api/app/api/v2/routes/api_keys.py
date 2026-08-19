"""API key endpoints (P5, /v2/api-keys).

Admin callers can create, list, and revoke any key. Non-admin callers can
list only their own keys (read-only); create/revoke remain admin-only.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.api.dependencies.current_user import require_admin, with_current_user
from app.services.auth.api_key_management_service import APIKeyManagementService
from app.services.rate_limit.data_structures import CurrentUser
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.database import get_db
from shared.core.exceptions.domain_exceptions import (
    NotFoundException,
    ValidationException,
)
from shared.models.database.user import GRADE_ADMINISTRATOR, User

router = APIRouter(tags=["API Keys Admin"])

_service = APIKeyManagementService()

_EXPIRES_AT_FORMATS = (
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%d/%m/%Y, %H:%M",
    "%d/%m/%Y %H:%M",
    "%d/%m/%Y",
    "%d-%m-%Y %H:%M",
    "%d-%m-%Y",
)


def parse_expires_at(value: Any) -> datetime | None:
    """Accept ISO 8601 or the console's local DD/MM/YYYY[,] HH:MM format.

    Returns a naive UTC datetime (matching the APIKey column). A malformed
    value raises a clear 422 instead of a generic 500/400.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return _naive_utc(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        return _naive_utc(datetime.fromisoformat(text.replace("Z", "+00:00")))
    except ValueError:
        pass
    for fmt in _EXPIRES_AT_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    raise validation_error_422(
        "expires_at must be ISO 8601 (e.g. 2026-08-22T22:38:00) or "
        "DD/MM/YYYY HH:MM (e.g. 22/8/2026, 22:38)",
    )


def validation_error_422(user_message: str) -> ValidationException:
    exc = ValidationException(
        user_message=user_message,
        violations=[{"field": "expires_at", "description": user_message}],
    )
    exc.http_status_code = 422
    return exc


def _naive_utc(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


class AdminCreateAPIKeyRequest(BaseModel):
    """Create an API key on behalf of a user."""

    user_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=255)
    expires_at: datetime | None = None

    @field_validator("expires_at", mode="before")
    @classmethod
    def _parse_expires_at(cls, value: Any) -> datetime | None:
        return parse_expires_at(value)


@router.post("", summary="Create an API key for a user (admin only)")
async def create_api_key_for_user(
    payload: AdminCreateAPIKeyRequest,
    _admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Mint a new key owned by the given user; the raw key is returned once."""
    user = await db.get(User, payload.user_id)
    if user is None:
        raise NotFoundException(resource="User", resource_id=payload.user_id)
    raw_api_key = await _service.create_api_key(
        session=db,
        user_id=payload.user_id,
        name=payload.name,
        expires_at=payload.expires_at,
    )
    return {
        "api_key": raw_api_key,
        "name": payload.name,
        "user_id": payload.user_id,
        "expires_at": payload.expires_at,
    }


@router.get("", summary="List API keys (admin: all; others: own keys only)")
async def list_api_keys(
    current_user: CurrentUser = Depends(with_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if current_user.grade == GRADE_ADMINISTRATOR:
        keys = await _service.list_all_api_keys(db)
    else:
        keys = await _service.list_user_api_keys(db, user_id=current_user.user_id)
    return {"api_keys": keys, "total": len(keys)}


@router.delete("/{api_key_id}", summary="Revoke any API key (admin only)")
async def revoke_api_key(
    api_key_id: str,
    _admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    await _service.revoke_api_key_any(db, api_key_id=api_key_id)
    return {"message": "API key revoked"}


__all__ = ["router"]
