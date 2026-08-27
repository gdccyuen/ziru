"""Chat API v2 routes (P6).

Per-user threads with create/rename/archive, message history, and a
message turn that runs the frozen retrieval engine profile-scoped.
"""

from __future__ import annotations

from typing import Any

from app.api.dependencies.current_user import with_current_user
from app.services.attributes.attribute_service import validation_error_422
from app.services.chat.chat_service import (
    archive_thread,
    create_thread,
    list_owned_threads,
    list_thread_messages,
    run_message_turn,
    update_thread,
)
from app.services.rate_limit.data_structures import CurrentUser
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.database import get_db

router = APIRouter(tags=["Chat"])


class ChatFilter(BaseModel):
    key: str = Field(..., min_length=1, max_length=128)
    values: list[str] = Field(..., min_length=1)


class RetrievalParams(BaseModel):
    rerank: bool | None = None
    top_k: int | None = None
    internal_recall_k: int | None = None
    use_agentic: bool | None = None


class CreateThreadRequest(BaseModel):
    title: str | None = Field(None, max_length=255)
    filters: list[ChatFilter] | None = None
    retrieval_params: RetrievalParams | None = None


class UpdateThreadRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    retrieval_params: RetrievalParams | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> "UpdateThreadRequest":
        if self.title is None and self.retrieval_params is None:
            raise ValueError("provide title or retrieval_params to update")
        return self


class PostMessageRequest(BaseModel):
    content: str = Field(..., min_length=1)
    filters: list[ChatFilter] | None = None


def _filter_dicts(filters: list[ChatFilter] | None) -> list[dict[str, Any]] | None:
    if filters is None:
        return None
    return [item.model_dump() for item in filters]


def _retrieval_params_dict(
    params: RetrievalParams | None,
) -> dict[str, Any] | None:
    if params is None:
        return None
    if params.top_k is not None and not 1 <= params.top_k <= 50:
        raise validation_error_422(
            "top_k must be between 1 and 50",
            "retrieval_params.top_k",
        )
    if (
        params.internal_recall_k is not None
        and not 1 <= params.internal_recall_k <= 200
    ):
        raise validation_error_422(
            "internal_recall_k must be between 1 and 200",
            "retrieval_params.internal_recall_k",
        )
    return params.model_dump(exclude_none=True)


@router.get("/threads", summary="List my chat threads")
async def list_threads(
    current_user: CurrentUser = Depends(with_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    threads = await list_owned_threads(db, current_user.user_id)
    return {"threads": threads, "total": len(threads)}


@router.post("/threads", summary="Create a chat thread")
async def create_chat_thread(
    payload: CreateThreadRequest,
    current_user: CurrentUser = Depends(with_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return await create_thread(
        db,
        current_user.user_id,
        title=payload.title,
        filters=_filter_dicts(payload.filters),
        retrieval_params=_retrieval_params_dict(payload.retrieval_params),
    )


@router.patch("/threads/{thread_id}", summary="Update my chat thread")
async def update_chat_thread(
    thread_id: str,
    payload: UpdateThreadRequest,
    current_user: CurrentUser = Depends(with_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return await update_thread(
        db,
        current_user.user_id,
        thread_id,
        title=payload.title,
        retrieval_params=_retrieval_params_dict(payload.retrieval_params),
    )


@router.delete("/threads/{thread_id}", summary="Archive my chat thread")
async def delete_chat_thread(
    thread_id: str,
    current_user: CurrentUser = Depends(with_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    await archive_thread(db, current_user.user_id, thread_id)
    return {"message": "Thread archived"}


@router.get("/threads/{thread_id}/messages", summary="List my thread messages")
async def get_thread_messages(
    thread_id: str,
    current_user: CurrentUser = Depends(with_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    thread, messages = await list_thread_messages(db, current_user.user_id, thread_id)
    return {"thread": thread, "messages": messages}


@router.post("/threads/{thread_id}/messages", summary="Send a message in a thread")
async def post_thread_message(
    thread_id: str,
    payload: PostMessageRequest,
    current_user: CurrentUser = Depends(with_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    user_message, assistant_message = await run_message_turn(
        db,
        current_user,
        thread_id,
        content=payload.content,
        filters=_filter_dicts(payload.filters),
    )
    return {
        "user_message": user_message,
        "assistant_message": assistant_message,
    }


__all__ = ["router"]
