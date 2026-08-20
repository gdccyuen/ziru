"""Knowledge search API v2 (P3, POST /v2/search).

Search requires a non-empty query and at least one attribute filter; the
attribute filters (and, for non-admins, the caller's profile constraints)
scope the corpus at the document level. The frozen v1 retrieval engine is
reused unchanged — only its input corpus is restricted via
exclude_document_ids.
"""

from __future__ import annotations

from typing import Literal

from app.api.dependencies.current_user import with_current_user
from app.api.v1.routes.retrieval import (
    ExcludeSection,
    RetrievalQueryResponse,
)
from app.services.rate_limit.data_structures import CurrentUser
from app.services.search.knowledge_search import run_profile_scoped_search
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.database import get_db

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


@router.post("", response_model=RetrievalQueryResponse, summary="Knowledge search")
async def search_knowledge(
    payload: SearchV2Request,
    current_user: CurrentUser = Depends(with_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Knowledge search: profile ∩ filters, fail-closed (P3)."""
    return await run_profile_scoped_search(
        db,
        current_user,
        query=payload.query,
        filters=[item.model_dump() for item in payload.filters],
        top_k=payload.top_k,
        internal_recall_k=payload.internal_recall_k,
        rerank=payload.rerank,
        use_agentic=payload.use_agentic,
        chunk_types=payload.chunk_types,
        exclude_document_ids=payload.exclude_document_ids,
        exclude_sections=payload.exclude_sections,
        channels=payload.channels,
        channel_weights=payload.channel_weights,
        threshold=payload.threshold,
        signal_paths=payload.signal_paths,
        filter_mode=payload.filter_mode,
    )


__all__ = ["router"]
