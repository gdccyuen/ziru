"""Admin API key endpoints (P5, /v2/api-keys)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.api.dependencies.current_user import require_admin
from app.services.auth.api_key_management_service import APIKeyManagementService
from app.services.rate_limit.data_structures import CurrentUser
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.database import get_db
from shared.core.exceptions.domain_exceptions import NotFoundException
from shared.models.database.user import User

router = APIRouter(tags=["API Keys Admin"])

_service = APIKeyManagementService()


class AdminCreateAPIKeyRequest(BaseModel):
    """Create an API key on behalf of a user."""

    user_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=255)
    expires_at: datetime | None = None


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


@router.get("", summary="List all API keys with owner emails (admin only)")
async def list_all_api_keys(
    _admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    keys = await _service.list_all_api_keys(db)
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
