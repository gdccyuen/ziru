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
