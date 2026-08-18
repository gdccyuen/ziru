"""Account model — the single identity store (overhaul, ticket 02)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from shared.core.database import Base
from shared.utils.utc_now import utc_now_naive

# Grade identifiers (ticket 02, Q3)
GRADE_ADMINISTRATOR = "administrator"
GRADE_LIBRARIAN = "librarian"
GRADE_USER = "user"
GRADES = (GRADE_ADMINISTRATOR, GRADE_LIBRARIAN, GRADE_USER)


class User(Base):
    """An account in the core identity store.

    Grades decide powers (administrator / librarian / user). A profile is a
    list of attribute constraints (e.g. [{"key": "division", "values":
    ["finance"]}]) that bounds what the account can see; an empty profile
    means the account sees NOTHING (fail-closed, Q6/Q15). Administrators
    bypass profile evaluation entirely (admin sees everything).
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    grade: Mapped[str] = mapped_column(
        String(32), nullable=False, default=GRADE_USER
    )
    profile: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(
        JSON, nullable=True
    )  # list of {"key": str, "values": [str, ...]}
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    disabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now_naive, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now_naive,
        onupdate=utc_now_naive,
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email}, grade={self.grade})>"
