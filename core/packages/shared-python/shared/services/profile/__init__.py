"""Profile-based access control for knowledge objects (tickets 01/02).

A profile is a list of key → allowed-values constraints. Fail-closed
matching (Q6/Q15): a non-admin sees a document only when EVERY constraint
in the profile is satisfied by the document's attributes. An empty profile
matches nothing — "no constraints" must never mean "everything" (Q26).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Mapping, Sequence, Tuple

# System-managed attributes (Q16/Q17): auto-set, immutable, never in the
# admin dictionary.
BUILTIN_ATTRIBUTE_KEYS = ("createBy", "createTime")


@dataclass(frozen=True)
class ProfileConstraint:
    """One attribute constraint: document must carry one of `values` for `key`."""

    key: str
    values: Sequence[str]


Profile = Sequence[ProfileConstraint]


def normalize_profile(raw: Sequence[Mapping[str, Any]]) -> List[ProfileConstraint]:
    """Parse wire-format profile rows into ProfileConstraint objects.

    Raises ValueError on malformed entries (missing key / empty values) so
    account management can fail closed at write time.
    """
    parsed: List[ProfileConstraint] = []
    for item in raw:
        key = item.get("key")
        values = item.get("values")
        if not key or not isinstance(key, str):
            raise ValueError("profile constraint missing 'key'")
        if not isinstance(values, (list, tuple)) or len(values) == 0:
            raise ValueError(f"profile constraint '{key}' must have non-empty 'values'")
        parsed.append(
            ProfileConstraint(key=key, values=[str(v) for v in values])
        )
    return parsed


def attributes_to_multimap(rows: Iterable[Tuple[str, str]]) -> Dict[str, List[str]]:
    """Group (key, value) rows into {key: [value, ...]} (multi-value, Q14)."""
    multimap: Dict[str, List[str]] = {}
    for key, value in rows:
        multimap.setdefault(key, []).append(value)
    return multimap


def constraint_matches(
    constraint: ProfileConstraint, attributes: Mapping[str, Sequence[str]]
) -> bool:
    """True when the document carries at least one allowed value for the key."""
    values = attributes.get(constraint.key)
    if not values:
        return False  # fail-closed: missing attribute is not visible
    allowed = set(constraint.values)
    return any(value in allowed for value in values)


def profile_matches(
    profile: Profile, attributes: Mapping[str, Sequence[str]]
) -> bool:
    """Fail-closed visibility check.

    Empty profile → False (an account with no profile sees no documents).
    Otherwise every constraint must match.
    """
    if not profile:
        return False
    return all(constraint_matches(c, attributes) for c in profile)


def constraints_from_mapping(
    mapping: Mapping[str, Sequence[str]],
) -> List[ProfileConstraint]:
    """Convert a {key: [value, ...]} mapping into profile constraints.

    Used to bridge request filter payloads ({key, values}) and repeated
    query-parameter filters into the shared SQL scope builder.
    """
    constraints: List[ProfileConstraint] = []
    for key, values in mapping.items():
        constraints.append(ProfileConstraint(key=str(key), values=list(values)))
    return constraints


def build_profile_scope_clause(
    constraints: Sequence[ProfileConstraint],
    *,
    document_id_column,
    attribute_table,
):
    """Build a SQLAlchemy boolean expression restricting a documents query.

    One EXISTS subquery per constraint (AND across keys); each subquery
    matches a document that carries at least one allowed value for the key
    (OR within a key's values; multi-value rows). Empty constraints produce
    None (no restriction).
    """
    from sqlalchemy import and_, exists, select

    if not constraints:
        return None
    clauses = []
    for constraint in constraints:
        subquery = (
            select(1)
            .where(attribute_table.document_id == document_id_column)
            .where(attribute_table.attr_key == constraint.key)
            .where(attribute_table.attr_value.in_(list(constraint.values)))
        )
        clauses.append(exists(subquery))
    return and_(*clauses)


async def resolve_matching_document_ids(
    db,
    constraints: Sequence[ProfileConstraint],
    *,
    document_table=None,
    attribute_table=None,
) -> set[str]:
    """Return active document ids satisfying ALL constraints (fail-closed).

    Empty constraints → empty set (never "everything"); the caller decides
    what an unrestricted scope means (administrator bypass).
    """
    from shared.models.database.document import Document
    from shared.models.database.document_attribute import DocumentAttribute

    document_table = document_table or Document
    attribute_table = attribute_table or DocumentAttribute
    if not constraints:
        return set()
    from sqlalchemy import select

    statement = select(document_table.document_id).where(
        document_table.status != "archived"
    )
    scope_clause = build_profile_scope_clause(
        constraints,
        document_id_column=document_table.document_id,
        attribute_table=attribute_table,
    )
    if scope_clause is not None:
        statement = statement.where(scope_clause)
    result = await db.execute(statement)
    return set(result.scalars().all())


async def resolve_profile_visible_document_ids(
    db,
    profile: Profile,
    *,
    document_table=None,
    attribute_table=None,
) -> set[str]:
    """Resolve the fail-closed profile-visible active document id set.

    Empty profile → empty set (Q26: no constraints must never mean
    everything). Administrator bypass is the caller's concern.
    """
    return await resolve_matching_document_ids(
        db,
        profile,
        document_table=document_table,
        attribute_table=attribute_table,
    )


async def resolve_all_active_document_ids(
    db,
    *,
    document_table=None,
) -> set[str]:
    """Return every non-archived document id (used to compute excludes)."""
    from shared.models.database.document import Document
    from sqlalchemy import select

    document_table = document_table or Document
    result = await db.execute(
        select(document_table.document_id).where(document_table.status != "archived")
    )
    return set(result.scalars().all())
