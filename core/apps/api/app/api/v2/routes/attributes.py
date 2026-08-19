"""Attribute dictionary API v2 (P3, /v2/attributes)."""

from __future__ import annotations

from typing import Any

from app.api.dependencies.current_user import require_admin, with_current_user
from app.services.attributes.attribute_service import (
    insert_dictionary_entry,
    load_attribute_dictionary,
    parse_attribute_values,
    require_dictionary_entry,
    validation_error_422,
)
from app.services.rate_limit.data_structures import CurrentUser
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.database import get_db
from shared.services.profile import BUILTIN_ATTRIBUTE_KEYS

router = APIRouter(tags=["Attributes"])


class AttributeCreateRequest(BaseModel):
    key: str = Field(..., min_length=1, max_length=128)
    allowedValues: list[str] | None = None


class AttributeUpdateRequest(BaseModel):
    allowedValues: list[str] | None = None


def _entry_payload(key: str, allowed_values: list[str] | None) -> dict[str, Any]:
    return {"key": key, "allowedValues": allowed_values}


@router.get("", summary="List the attribute dictionary")
async def list_attributes(
    current_user: CurrentUser = Depends(with_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    dictionary = await load_attribute_dictionary(db)
    return [
        _entry_payload(key, allowed_values)
        for key, allowed_values in sorted(dictionary.items())
    ]


@router.post("", summary="Create an attribute dictionary key (admin only)")
async def create_attribute(
    payload: AttributeCreateRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if payload.key in BUILTIN_ATTRIBUTE_KEYS:
        raise validation_error_422(
            f"reserved attribute key: {payload.key}",
            "key",
        )
    allowed_values = parse_attribute_values(payload.allowedValues)
    row = await insert_dictionary_entry(
        db,
        key=payload.key,
        allowed_values=allowed_values,
    )
    await db.commit()
    return _entry_payload(row.key, row.allowed_values)


@router.patch("/{key}", summary="Update attribute allowed values (admin only)")
async def update_attribute(
    key: str,
    payload: AttributeUpdateRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    row = await require_dictionary_entry(db, key=key)
    row.allowed_values = parse_attribute_values(payload.allowedValues)
    await db.commit()
    return _entry_payload(row.key, row.allowed_values)


@router.delete("/{key}", summary="Delete an attribute dictionary key (admin only)")
async def delete_attribute(
    key: str,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    row = await require_dictionary_entry(db, key=key)
    await db.delete(row)
    await db.commit()
    return {"deleted": key}


__all__ = ["router"]
