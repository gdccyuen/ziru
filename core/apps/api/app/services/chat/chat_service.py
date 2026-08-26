"""Chat thread and message turn service (P6).

Threads are strictly user-scoped (own threads only). The message turn
persists the user message, runs the frozen retrieval engine over the
profile-scoped corpus, and persists the evidence answer plus citations.
"""

from __future__ import annotations

from typing import Any

from app.api.v1.routes.retrieval import (
    RetrievalQueryRequest,
    execute_retrieval_query,
)
from app.services.attributes.attribute_service import validation_error_422
from app.services.rate_limit.data_structures import CurrentUser
from app.services.search.knowledge_search import empty_evidence_response
import asyncio
import os
from shared.services.ai.llm_overrides import get_text_client
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.exceptions.domain_exceptions import NotFoundException
from shared.models.database.chat import ChatMessage, ChatThread
from shared.models.database.user import GRADE_ADMINISTRATOR
from shared.services.profile import (
    ProfileConstraint,
    normalize_profile,
    resolve_all_active_document_ids,
    resolve_matching_document_ids,
)
from shared.utils.utc_now import utc_now_naive

DEFAULT_THREAD_TITLE = "New chat"
CHAT_TOP_K = 8
CHAT_RECALL_K = 30


def thread_payload(thread: ChatThread) -> dict[str, Any]:
    return {
        "id": thread.id,
        "title": thread.title,
        "filters": thread.filters or [],
        "created_at": thread.created_at.isoformat() if thread.created_at else None,
        "updated_at": thread.updated_at.isoformat() if thread.updated_at else None,
        "archived_at": thread.archived_at.isoformat() if thread.archived_at else None,
    }


def message_payload(message: ChatMessage) -> dict[str, Any]:
    return {
        "id": message.id,
        "thread_id": message.thread_id,
        "role": message.role,
        "content": message.content,
        "citations": message.citations or [],
        "created_at": message.created_at.isoformat() if message.created_at else None,
    }


async def _get_owned_thread(
    db: AsyncSession,
    user_id: str,
    thread_id: str,
) -> ChatThread:
    result = await db.execute(
        select(ChatThread).where(
            ChatThread.id == thread_id,
            ChatThread.user_id == user_id,
            ChatThread.archived_at.is_(None),
        )
    )
    thread = result.scalar_one_or_none()
    if thread is None:
        raise NotFoundException(resource="Chat thread", resource_id=thread_id)
    return thread


async def list_owned_threads(db: AsyncSession, user_id: str) -> list[dict[str, Any]]:
    result = await db.execute(
        select(ChatThread)
        .where(ChatThread.user_id == user_id, ChatThread.archived_at.is_(None))
        .order_by(ChatThread.updated_at.desc()),
    )
    return [thread_payload(thread) for thread in result.scalars().all()]


async def create_thread(
    db: AsyncSession,
    user_id: str,
    *,
    title: str | None,
    filters: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    cleaned_title = (title or "").strip() or DEFAULT_THREAD_TITLE
    thread = ChatThread(
        user_id=user_id,
        title=cleaned_title[:255],
        filters=filters,
    )
    db.add(thread)
    await db.commit()
    await db.refresh(thread)
    return thread_payload(thread)


async def rename_thread(
    db: AsyncSession,
    user_id: str,
    thread_id: str,
    title: str,
) -> dict[str, Any]:
    thread = await _get_owned_thread(db, user_id, thread_id)
    cleaned_title = title.strip()
    if not cleaned_title:
        raise validation_error_422("title must not be empty", "title")
    thread.title = cleaned_title[:255]
    thread.updated_at = utc_now_naive()
    await db.commit()
    await db.refresh(thread)
    return thread_payload(thread)


async def archive_thread(
    db: AsyncSession,
    user_id: str,
    thread_id: str,
) -> None:
    thread = await _get_owned_thread(db, user_id, thread_id)
    thread.archived_at = utc_now_naive()
    await db.commit()


async def list_thread_messages(
    db: AsyncSession,
    user_id: str,
    thread_id: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    thread = await _get_owned_thread(db, user_id, thread_id)
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread_id)
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc()),
    )
    messages = [message_payload(message) for message in result.scalars().all()]
    return thread_payload(thread), messages


async def resolve_chat_corpus_ids(
    db: AsyncSession,
    current_user: CurrentUser,
    filters: list[dict[str, Any]] | None,
) -> set[str] | None:
    """Resolve the visible document id set for a chat turn.

    Admins with no filter bag see the whole corpus; non-admins are bound by
    profile and filters (fail-closed). None means nothing is visible.
    """
    from app.services.attributes.attribute_service import load_attribute_dictionary

    dictionary = await load_attribute_dictionary(db)
    cleaned: list[dict[str, Any]] = []
    for item in filters or []:
        key = str(item.get("key") or "")
        values = [str(value) for value in (item.get("values") or [])]
        if key not in dictionary:
            raise validation_error_422(f"unknown attribute key: {key}", "filters")
        if not values:
            raise validation_error_422(
                f"attribute filter {key!r} needs at least one value",
                "filters",
            )
        cleaned.append({"key": key, "values": values})

    is_admin = current_user.grade == GRADE_ADMINISTRATOR
    if is_admin and not cleaned:
        return await resolve_all_active_document_ids(db)

    constraints: list[ProfileConstraint] = [
        ProfileConstraint(key=item["key"], values=item["values"])
        for item in cleaned
    ]
    if not is_admin:
        profile = normalize_profile(current_user.profile or [])
        if not profile:
            return None
        constraints = list(profile) + constraints
    return await resolve_matching_document_ids(db, constraints)


def _chat_answer_synthesis_enabled() -> bool:
    return os.environ.get("CHAT_ANSWER_SYNTHESIS", "").strip().lower() in ("1", "true", "yes")

def _synthesis_prompt(question, results):
    blocks = []
    for i, res in enumerate(results[:5], start=1):
        src = res.get("source") or {}
        path = str(src.get("section_path") or src.get("source_file_name") or "unknown")
        content = str(res.get("content") or res.get("evidence_text") or "")[:1500]
        blocks.append(f"[{i}] Section: {path}\n    {content}")
    return ("Answer the user question using ONLY the evidence blocks below. "
            "If the evidence is insufficient, say so explicitly. "
            "Write a concise, well-organized answer (short paragraphs or bullets). "
            "Reference sections by their paths in parentheses. Do not invent facts.\n\n"
            "Question: " + question + "\n\nEVIDENCE:\n" + "\n".join(blocks))

def _synthesize_answer_sync(question, results):
    client, model = get_text_client()
    if client is None:
        return ""
    messages = [
        {"role": "system", "content": "You are Ziru chat assistant. Ground every claim in the provided evidence."},
        {"role": "user", "content": _synthesis_prompt(question, results)},
    ]
    raw, _ = client.chat_completion_with_usage(messages=messages, model=model, temperature=0.0, max_tokens=8192, usage_task="chat.answer_synthesis")
    return (raw or "").strip()


async def run_message_turn(
    db: AsyncSession,
    current_user: CurrentUser,
    thread_id: str,
    *,
    content: str,
    filters: list[dict[str, Any]] | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    thread = await _get_owned_thread(db, current_user.user_id, thread_id)
    text = (content or "").strip()
    if not text:
        raise validation_error_422("content must not be empty", "content")
    if filters is not None:
        thread.filters = filters

    user_message = ChatMessage(
        thread_id=thread.id,
        role="user",
        content=text,
    )
    db.add(user_message)
    await db.flush()

    allowed_ids = await resolve_chat_corpus_ids(
        db,
        current_user,
        thread.filters,
    )
    if allowed_ids is None or not allowed_ids:
        evidence = empty_evidence_response(text)
    else:
        all_ids = await resolve_all_active_document_ids(db)
        excludes = all_ids - allowed_ids
        retrieval_request = RetrievalQueryRequest(
            query=text,
            top_k=CHAT_TOP_K,
            exclude_document_ids=sorted(excludes),
            rerank=False,
            internal_recall_k=CHAT_RECALL_K,
        )
        evidence = await execute_retrieval_query(
            retrieval_request,
            current_user,
            db,
            llm_config=None,
        )

    answer_content = (evidence.get("evidence_text") or "").strip()
    citations = evidence.get("results") or []
    if _chat_answer_synthesis_enabled() and citations:
        try:
            synthesized = await asyncio.to_thread(_synthesize_answer_sync, text, citations)
            if synthesized:
                answer_content = synthesized
        except Exception:
            pass
    if not answer_content:
        if citations:
            answer_content = (
                "I found matching knowledge. See the citations below for the "
                "supporting passages."
            )
        else:
            answer_content = (
                "No matching knowledge was found in your visible corpus."
            )

    assistant_message = ChatMessage(
        thread_id=thread.id,
        role="assistant",
        content=answer_content,
        citations=citations,
    )
    db.add(assistant_message)
    if thread.title == DEFAULT_THREAD_TITLE:
        thread.title = text[:60]
    thread.updated_at = utc_now_naive()
    await db.commit()
    await db.refresh(user_message)
    await db.refresh(assistant_message)
    return message_payload(user_message), message_payload(assistant_message)


__all__ = [
    "archive_thread",
    "create_thread",
    "list_owned_threads",
    "list_thread_messages",
    "message_payload",
    "rename_thread",
    "run_message_turn",
    "thread_payload",
]
