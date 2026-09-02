"""Chat thread and message models (P6).

Threads are per-user (user_id FK); messages belong to exactly one thread.
Citations are persisted as JSON so chat history can re-render source links
without re-running retrieval.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from shared.core.database import Base
from shared.utils.utc_now import utc_now_naive


class ChatThread(Base):
    """A per-user chat thread.

    `filters` stores the attribute filter bag the thread was created with
    (list of {"key": str, "values": [str, ...]}). It is the chat retrieval
    scope: message turns search profile and filters, fail-closed.
    """

    __tablename__ = "chat_threads"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(
        String(255), nullable=False, default="New chat"
    )
    filters: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(
        JSON, nullable=True
    )
    retrieval_params: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now_naive, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now_naive,
        onupdate=utc_now_naive,
        nullable=False,
    )
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class ChatMessage(Base):
    """One persisted message in a chat thread."""

    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    thread_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("chat_threads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    citations: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(
        JSON, nullable=True
    )
    trace: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now_naive, nullable=False
    )
