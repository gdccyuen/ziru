"""Attribute dictionary + document attribute validation (P3, tickets 04-07)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.exceptions.domain_exceptions import (
    ConflictException,
    NotFoundException,
    ValidationException,
)
from shared.models.database.attribute_dictionary import AttributeDictionaryEntry
from shared.models.database.document_attribute import DocumentAttribute
from shared.services.profile import BUILTIN_ATTRIBUTE_KEYS


def validation_error_422(user_message: str, field: str) -> ValidationException:
    """Build a ValidationException that responds with HTTP 422.

    The application-wide pydantic handler maps validation failures to 400,
    but the P3 surface contract explicitly requires 422 for request-shape
    violations (empty query, empty filters, unknown/reserved keys).
    """
    exc = ValidationException(
        user_message=user_message,
        violations=[{"field": field, "description": user_message}],
    )
    exc.http_status_code = 422
    return exc


async def load_attribute_dictionary(
    db: AsyncSession,
) -> dict[str, list[str] | None]:
    """Load every dictionary entry as {key: allowed_values | None}."""
    result = await db.execute(select(AttributeDictionaryEntry))
    return {
        row.key: list(row.allowed_values) if row.allowed_values else None
        for row in result.scalars().all()
    }


async def load_attribute_usage_counts(db: AsyncSession) -> dict[str, int]:
    """Return {attribute_key: number of distinct documents using it}."""
    result = await db.execute(
        select(
            DocumentAttribute.attr_key,
            func.count(func.distinct(DocumentAttribute.document_id)),
        ).group_by(DocumentAttribute.attr_key)
    )
    return {key: int(count) for key, count in result.all()}


async def count_attribute_usage(db: AsyncSession, *, key: str) -> int:
    """Count distinct documents currently using an attribute key."""
    result = await db.execute(
        select(func.count(func.distinct(DocumentAttribute.document_id))).where(
            DocumentAttribute.attr_key == key
        )
    )
    return int(result.scalar_one())


def validate_attributes(
    attributes: dict[str, list[str]],
    *,
    dictionary: dict[str, list[str] | None],
    allow_unknown: bool = False,
) -> dict[str, list[str]]:
    """Validate a full-replace attribute map and return a cleaned copy.

    Rules (Q16/Q17): built-in keys are reserved; values must be non-empty;
    keys must exist in the dictionary unless the caller is an administrator
    doing a PATCH (admin may use arbitrary dictionary values); when the
    dictionary defines allowed values every value must be allowed.
    """
    if not isinstance(attributes, dict):
        raise validation_error_422(
            "attributes must be an object of key to value arrays",
            "attributes",
        )
    cleaned: dict[str, list[str]] = {}
    for key, raw_values in attributes.items():
        if not isinstance(key, str) or not key.strip():
            raise validation_error_422(
                "attribute keys must be non-empty strings",
                "attributes",
            )
        if key in BUILTIN_ATTRIBUTE_KEYS:
            raise validation_error_422(
                f"reserved attribute key: {key}",
                f"attributes.{key}",
            )
        if not isinstance(raw_values, list) or not raw_values:
            raise validation_error_422(
                f"attribute '{key}' must have a non-empty list of values",
                f"attributes.{key}",
            )
        values = [str(v) for v in raw_values if v is not None and str(v) != ""]
        if not values:
            raise validation_error_422(
                f"attribute '{key}' must have a non-empty list of values",
                f"attributes.{key}",
            )
        if key not in dictionary:
            if not allow_unknown:
                raise validation_error_422(
                    f"unknown attribute key: {key}",
                    f"attributes.{key}",
                )
        else:
            allowed = dictionary[key]
            if allowed is not None:
                allowed_set = set(allowed)
                invalid = [v for v in values if v not in allowed_set]
                if invalid:
                    raise validation_error_422(
                        f"attribute '{key}' has invalid value(s): "
                        f"{', '.join(sorted(set(invalid)))}",
                        f"attributes.{key}",
                    )
        # Deduplicate while preserving first-seen order.
        seen: set[str] = set()
        deduped: list[str] = []
        for value in values:
            if value not in seen:
                seen.add(value)
                deduped.append(value)
        cleaned[key] = deduped
    return cleaned


def parse_attribute_values(raw: Any) -> list[str] | None:
    """Normalize optional allowedValues input (empty list -> None)."""
    if raw is None:
        return None
    if not isinstance(raw, list):
        raise validation_error_422(
            "allowedValues must be a list of strings",
            "allowedValues",
        )
    values = [str(v) for v in raw if v is not None and str(v) != ""]
    return list(dict.fromkeys(values)) if values else None


async def require_dictionary_entry(
    db: AsyncSession,
    *,
    key: str,
) -> AttributeDictionaryEntry:
    """Return the dictionary entry or raise 404."""
    row = await db.get(AttributeDictionaryEntry, key)
    if row is None:
        raise NotFoundException(
            resource="Attribute key",
            resource_id=key,
            internal_message=f"Attribute key not found in dictionary: {key}",
        )
    return row


async def insert_dictionary_entry(
    db: AsyncSession,
    *,
    key: str,
    allowed_values: list[str] | None,
) -> AttributeDictionaryEntry:
    """Insert a dictionary entry, raising 409 on duplicate keys."""
    existing = await db.get(AttributeDictionaryEntry, key)
    if existing is not None:
        raise ConflictException(
            user_message=f"Attribute key already exists: {key}",
            reason="ALREADY_EXISTS",
            resource="Attribute key",
            resource_id=key,
            internal_message=f"Duplicate attribute dictionary key: {key}",
        )
    row = AttributeDictionaryEntry(key=key, allowed_values=allowed_values)
    db.add(row)
    await db.flush()
    return row