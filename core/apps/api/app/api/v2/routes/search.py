"""Knowledge search API v2 (P3, POST /v2/search).

Search requires a non-empty query and at least one attribute filter; the
attribute filters (and, for non-admins, the caller's profile constraints)
scope the corpus at the document level. The frozen v1 retrieval engine is
reused unchanged — only its input corpus is restricted via
exclude_document_ids.
"""

from __future__ import annotations

from typing import Any, Literal

from app.api.dependencies.current_user import with_current_user
from app.api.v1.routes.retrieval import (
    ExcludeSection,
    RetrievalQueryRequest,
    RetrievalQueryResponse,
    execute_retrieval_query,
)
from app.services.attributes.attribute_service import (
    load_attribute_dictionary,
    validation_error_422,
)
from app.services.rate_limit.data_structures import CurrentUser
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.database import get_db
from shared.models.database.user import GRADE_ADMINISTRATOR
from shared.services.profile import (
    ProfileConstraint,
    normalize_profile,
    resolve_all_active_document_ids,
    resolve_matching_document_ids,
)

router = APIRouter(tags=["Search"])


class SearchFilter(BaseModel):
    key: str
    values: list[str]


class SearchV2Request(BaseModel):
    query: str = Field(..., description="Search query; must be non-empty")
    filters: list[SearchFilter] = Field(
        ...,
        description=(
            "Attribute filters. AND across keys, OR within a key's values. "
            "Non-empty required."
        ),
    )
    top_k: int = Field(8, ge=1, description="Number of results to return")
    internal_recall_k: int | None = Field(
        30, ge=1, description="Override per-channel recall count"
    )
    rerank: bool = Field(True, description="Enable LLM reranking after RRF fusion")
    use_agentic: bool | None = Field(
        None,
        description="Set to true to enable agentic retrieval (default None/false).",
    )
    chunk_types: list[str] | None = Field(
        None,
        description="Allowed chunk types: text, image, table, page.",
    )
    exclude_document_ids: list[str] = Field(
        default_factory=list, description="Document ids to exclude"
    )
    exclude_sections: list[ExcludeSection] = Field(
        default_factory=list, description="Section paths to exclude"
    )
    channels: list[str] = Field(
        default_factory=list,
        description="Channels to run (empty=all). Options: path, content, term",
    )
    channel_weights: dict[str, float] = Field(
        default_factory=dict, description="Per-channel weight overrides"
    )
    threshold: float = Field(0.0, ge=0.0, description="Minimum RRF score threshold")
    signal_paths: list[str] = Field(
        default_factory=list, description="Path keywords for include/exclude filtering"
    )
    filter_mode: Literal["delete", "keep"] = Field(
        "delete", description="Signal path filter mode"
    )


def _empty_evidence_response(query: str) -> dict[str, Any]:
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


@router.post("", response_model=RetrievalQueryResponse, summary="Knowledge search")
async def search_knowledge(
    payload: SearchV2Request,
    current_user: CurrentUser = Depends(with_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = payload.query.strip()
    if not query:
        raise validation_error_422("query must be non-empty", "query")
    if not payload.filters:
        raise validation_error_422("filters must not be empty", "filters")

    dictionary = await load_attribute_dictionary(db)
    for item in payload.filters:
        if item.key not in dictionary:
            raise validation_error_422(
                f"unknown attribute key: {item.key}",
                "filters",
            )

    is_admin = current_user.grade == GRADE_ADMINISTRATOR
    constraints: list[ProfileConstraint] = [
        ProfileConstraint(key=item.key, values=item.values) for item in payload.filters
    ]
    if not is_admin:
        profile = normalize_profile(current_user.profile or [])
        if not profile:
            return _empty_evidence_response(query)
        constraints = list(profile) + constraints

    allowed_document_ids = await resolve_matching_document_ids(db, constraints)
    if not allowed_document_ids:
        return _empty_evidence_response(query)

    all_document_ids = await resolve_all_active_document_ids(db)
    exclude_document_ids = set(payload.exclude_document_ids)
    exclude_document_ids.update(all_document_ids - allowed_document_ids)

    retrieval_request = RetrievalQueryRequest(
        query=query,
        top_k=payload.top_k,
        exclude_document_ids=sorted(exclude_document_ids),
        exclude_sections=payload.exclude_sections,
        chunk_types=payload.chunk_types,
        signal_paths=payload.signal_paths,
        filter_mode=payload.filter_mode,
        channels=payload.channels,
        channel_weights=payload.channel_weights,
        rerank=payload.rerank,
        threshold=payload.threshold,
        internal_recall_k=payload.internal_recall_k,
        use_agentic=payload.use_agentic,
    )
    return await execute_retrieval_query(
        retrieval_request,
        current_user,
        db,
        llm_config=None,
    )


__all__ = ["router"]
