"""Profile-scoped knowledge search helper (P3/P6).

Shared by POST /v2/search and the chat message turn so both surfaces
enforce exactly the same fail-closed access matrix against the frozen
retrieval engine.
"""

from __future__ import annotations

from typing import Any

from app.api.v1.routes.retrieval import (
    ExcludeSection,
    RetrievalQueryRequest,
    execute_retrieval_query,
)
from app.services.attributes.attribute_service import (
    load_attribute_dictionary,
    validation_error_422,
)
from app.services.rate_limit.data_structures import CurrentUser
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models.database.user import GRADE_ADMINISTRATOR
from shared.services.profile import (
    ProfileConstraint,
    normalize_profile,
    resolve_all_active_document_ids,
    resolve_matching_document_ids,
)


def empty_evidence_response(query: str) -> dict[str, Any]:
    """Standard empty evidence contract (no corpus is visible to the caller)."""
    return {
        "query": query,
        "router_used": "empty_corpus_scoped",
        "evidence_text": "",
        "answer_text": "",
        "referenced_chunks": [],
        "results": [],
        "stop_reason": None,
        "failure_reason": None,
        "decision_trace": None,
    }


def _as_filter_dicts(filters: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in filters:
        if isinstance(item, dict):
            out.append(dict(item))
        elif hasattr(item, "model_dump"):
            out.append(item.model_dump())
        else:
            raise TypeError(f"unsupported filter item: {type(item).__name__}")
    return out


async def run_profile_scoped_search(
    db: AsyncSession,
    current_user: CurrentUser,
    *,
    query: str,
    filters: list[Any],
    top_k: int = 8,
    internal_recall_k: int | None = 30,
    rerank: bool = True,
    use_agentic: bool | None = None,
    chunk_types: list[str] | None = None,
    exclude_document_ids: list[str] | None = None,
    exclude_sections: list[ExcludeSection] | None = None,
    channels: list[str] | None = None,
    channel_weights: dict[str, float] | None = None,
    threshold: float = 0.0,
    signal_paths: list[str] | None = None,
    filter_mode: str = "delete",
) -> dict[str, Any]:
    """Validate the filter bag and run the retrieval engine profile-scoped."""
    cleaned_query = (query or "").strip()
    if not cleaned_query:
        raise validation_error_422("query must be non-empty", "query")
    if not filters:
        raise validation_error_422("filters must not be empty", "filters")

    dictionary = await load_attribute_dictionary(db)
    filter_dicts = _as_filter_dicts(filters)
    for item in filter_dicts:
        key = str(item.get("key") or "")
        if key not in dictionary:
            raise validation_error_422(
                f"unknown attribute key: {key}",
                "filters",
            )

    is_admin = current_user.grade == GRADE_ADMINISTRATOR
    constraints: list[ProfileConstraint] = [
        ProfileConstraint(key=str(item["key"]), values=list(item["values"]))
        for item in filter_dicts
    ]
    if not is_admin:
        profile = normalize_profile(current_user.profile or [])
        if not profile:
            return empty_evidence_response(cleaned_query)
        constraints = list(profile) + constraints

    allowed_document_ids = await resolve_matching_document_ids(db, constraints)
    if not allowed_document_ids:
        return empty_evidence_response(cleaned_query)

    all_document_ids = await resolve_all_active_document_ids(db)
    excludes = set(exclude_document_ids or [])
    excludes.update(all_document_ids - allowed_document_ids)

    retrieval_request = RetrievalQueryRequest(
        query=cleaned_query,
        top_k=top_k,
        exclude_document_ids=sorted(excludes),
        exclude_sections=list(exclude_sections or []),
        chunk_types=chunk_types,
        signal_paths=list(signal_paths or []),
        filter_mode=filter_mode,
        channels=list(channels or []),
        channel_weights=dict(channel_weights or {}),
        rerank=rerank,
        threshold=threshold,
        internal_recall_k=internal_recall_k,
        use_agentic=use_agentic,
    )
    return await execute_retrieval_query(
        retrieval_request,
        current_user,
        db,
        llm_config=None,
    )


__all__ = ["empty_evidence_response", "run_profile_scoped_search"]
