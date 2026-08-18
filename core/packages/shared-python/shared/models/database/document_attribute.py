"""Document attribute rows — multi-value KV attributes (Q2, Q14)."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from shared.core.database import Base
from shared.utils.utc_now import utc_now_naive


class DocumentAttribute(Base):
    """One attribute value on one document.

    Multi-value: a document carries one row per value per key
    (`division=finance` AND `division=sales`). Access control reads these
    rows through the profile matcher (fail-closed all-match).
    Built-in attributes are stored the same way but are created by the
    system (`createBy`, `createTime`) and never editable (Q16/Q17).
    """

    __tablename__ = "document_attributes"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    document_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("documents.document_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attr_key: Mapped[str] = mapped_column(String(128), nullable=False)
    attr_value: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now_naive, nullable=False
    )

    __table_args__ = (Index("idx_document_attributes_key", "attr_key"),)
