"""Engine-facing numbering-first heading hierarchy + outline sanity helpers.

The pure numbering/outline logic lives in ``shared.utils.outline_sanity`` so the
API can reuse it for the parse-quality backfill. This module adds the pandas-
aware adapters used by the parser:

- ``resolve_heading_levels(df)`` — override the ``level`` column so numbered
  headings get a level derived from their numbering prefix, while banner /
  classification headings are demoted to body text.
- ``outline_sanity(df)`` — ``(score, result)`` for the detected heading levels.
"""
from __future__ import annotations

from typing import Any

from shared.utils.outline_sanity import (
    build_outline,
    detection_quality_from_rows,
    is_banner_heading,
    num_key,
    numeric_depth,
    outline_sanity_from_rows,
)

__all__ = [
    "build_outline",
    "detection_quality_from_rows",
    "is_banner_heading",
    "num_key",
    "numeric_depth",
    "outline_sanity",
    "outline_sanity_from_rows",
    "resolve_heading_levels",
]


def _rows_of(df: Any) -> list[dict[str, Any]]:
    """Normalise a DataFrame or list-of-dicts into ordered ``{level, heading}`` dicts."""
    if hasattr(df, "to_dict"):
        out = []
        for _, row in df.iterrows():
            out.append(
                {
                    "level": row.get("level"),
                    "heading": str(row.get("heading", "")),
                }
            )
        return out
    return [{"level": r.get("level"), "heading": str(r.get("heading", ""))} for r in df]


def resolve_heading_levels(df: Any) -> Any:
    """Override ``level`` for numbered/letter/banner headings in place and return df.

    Only rows that are heading candidates (level > 0), or that carry a numbering
    / banner marker, are re-derived. Plain body rows are left at -1.
    """
    rows = _rows_of(df)
    texts = [r["heading"] for r in rows]
    keys = [num_key(t) for t in texts]
    resolved = build_outline(texts)  # [(level, key, text)]

    level_by_index: dict[int, int] = {}
    for idx, (lvl, key, txt) in enumerate(resolved):
        incoming = rows[idx]["level"]
        was_candidate = isinstance(incoming, int) and incoming > 0
        # Only re-derive rows that were already heading candidates, or that carry
        # a numbering/annex/banner marker. Do NOT promote plain body paragraphs
        # (build_outline assigns them a look-ahead level that must be ignored).
        if was_candidate or is_banner_heading(txt) or keys[idx] is not None:
            level_by_index[idx] = lvl
    for idx in level_by_index:
        rows[idx]["level"] = level_by_index[idx]

    if hasattr(df, "loc"):
        for idx in level_by_index:
            df.at[df.index[idx], "level"] = level_by_index[idx]
        return df
    return rows


def outline_sanity(df: Any) -> tuple[float, dict[str, Any]]:
    """Score the detected hierarchy against the numbering. Returns (score, result)."""
    return outline_sanity_from_rows(_rows_of(df))
