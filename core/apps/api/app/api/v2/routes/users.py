"""Admin user management endpoints (P2, /v2/users)."""

from __future__ import annotations

from typing import Any

from app.api.dependencies.current_user import require_admin
from app.services.auth.user_admin_service import get_user_admin_service
from app.services.rate_limit.data_structures import CurrentUser
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.database import get_db

router = APIRouter(tags=["Users Admin"])
_user_admin_service = get_user_admin_service()


class SSOLinkRequest(BaseModel):
    provider: str = Field(..., min_length=1, max_length=64)
    subject: str = Field(..., min_length=1)


class CreateUserRequest(BaseModel):
    email: str | None = None
    password: str | None = None
    grade: str = "user"
    profile: list[dict[str, Any]] | None = None
    sso: SSOLinkRequest | None = None


class UpdateUserRequest(BaseModel):
    grade: str | None = None
    profile: list[dict[str, Any]] | None = None
    disabled: bool | None = None
    reset_password: bool = False


def _user_payload(user) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "grade": user.grade,
        "profile": user.profile or [],
        "must_change_password": user.must_change_password,
        "disabled": user.disabled,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.post("", summary="Create a user (admin)")
async def create_user(
    payload: CreateUserRequest,
    _admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create an account (must_change_password=True) with optional SSO link."""
    user = await _user_admin_service.create_user(
        db,
        email=payload.email,
        password=payload.password,
        grade=payload.grade,
        profile=payload.profile,
        sso_provider=payload.sso.provider if payload.sso else None,
        sso_subject=payload.sso.subject if payload.sso else None,
    )
    return _user_payload(user)


@router.get("", summary="List users (admin, paginated)")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    users, total = await _user_admin_service.list_users(
        db,
        page=page,
        page_size=page_size,
    )
    return {
        "users": [_user_payload(user) for user in users],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{user_id}", summary="Get a user (admin)")
async def get_user(
    user_id: str,
    _admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await _user_admin_service.get_user(db, user_id)
    return _user_payload(user)


@router.patch("/{user_id}", summary="Update a user (admin)")
async def update_user(
    user_id: str,
    payload: UpdateUserRequest,
    _admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user, temporary_password = await _user_admin_service.update_user(
        db,
        user_id,
        grade=payload.grade,
        profile=payload.profile,
        disabled=payload.disabled,
        reset_password=payload.reset_password,
    )
    payload_response = _user_payload(user)
    if temporary_password is not None:
        payload_response["temporary_password"] = temporary_password
    return payload_response