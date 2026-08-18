"""External identity link model — SSO linking (ticket 03, Q26/Q28)."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from shared.core.database import Base
from shared.utils.utc_now import utc_now_naive


class ExternalIdentityLink(Base):
    """Binds an IdP identity to a local account.

    Admin pre-link only (Q28): at account creation the admin records the
    person's IdP identity (provider + subject, e.g. OIDC `sub` or AD UPN).
    SSO sign-in is rejected when no link matches — no auto-provision, no
    email matching.
    """

    __tablename__ = "external_identity_links"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    provider_subject: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now_naive, nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "provider", "provider_subject", name="uq_external_identity_provider_subject"
        ),
    )
