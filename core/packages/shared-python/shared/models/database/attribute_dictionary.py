"""Attribute dictionary model — admin-managed keys (ticket 01, Q13)."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from shared.core.database import Base
from shared.utils.utc_now import utc_now_naive


class AttributeDictionaryEntry(Base):
    """One admin-defined attribute key with optional allowed values.

    Uploaders pick from this dictionary; profiles are built from the same
    keys (Q13). Built-in keys (`createBy`, `createTime`) are system
    attributes and never appear here (Q16/Q17).
    """

    __tablename__ = "attribute_dictionary"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    allowed_values: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now_naive, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now_naive,
        onupdate=utc_now_naive,
        nullable=False,
    )
