"""Core session service (P2, Q27).

The browser holds an HttpOnly cookie with the raw session token; the
``sessions`` table stores only sha256(token) so a DB leak never exposes
live session credentials.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.config import settings
from shared.models.database.session import Session
from shared.models.database.user import User
from shared.utils.utc_now import utc_now_naive

SESSION_COOKIE_NAME = "ziru_session"


def hash_token(token: str) -> str:
    """Return the sha256 digest stored for a raw session token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _session_ttl() -> timedelta:
    return timedelta(days=settings.SESSION_TTL_DAYS)


async def create_session(db: AsyncSession, user_id: str) -> str:
    """Create a session row and return the raw token (shown once)."""
    token = secrets.token_urlsafe(32)
    db.add(
        Session(
            id=str(uuid4()),
            user_id=user_id,
            token_hash=hash_token(token),
            expires_at=utc_now_naive() + _session_ttl(),
        )
    )
    await db.commit()
    return token


async def resolve_session(db: AsyncSession, token: str) -> User | None:
    """Resolve a raw session token to its (non-disabled) user, or None."""
    if not token:
        return None
    now = utc_now_naive()
    result = await db.execute(
        select(User)
        .join(Session, Session.user_id == User.id)
        .where(
            Session.token_hash == hash_token(token),
            Session.revoked_at.is_(None),
            or_(Session.expires_at.is_(None), Session.expires_at > now),
        )
        .limit(1)
    )
    user = result.scalar_one_or_none()
    if user is None or user.disabled:
        return None
    return user


async def revoke_session(db: AsyncSession, token: str) -> None:
    """Revoke one session (logout)."""
    await db.execute(
        update(Session)
        .where(Session.token_hash == hash_token(token), Session.revoked_at.is_(None))
        .values(revoked_at=utc_now_naive()),
    )
    await db.commit()


async def revoke_user_sessions(
    db: AsyncSession,
    user_id: str,
    *,
    except_token_hash: str | None = None,
) -> None:
    """Revoke every session of a user (optionally keeping the current one)."""
    query = update(Session).where(
        Session.user_id == user_id,
        Session.revoked_at.is_(None),
    )
    if except_token_hash is not None:
        query = query.where(Session.token_hash != except_token_hash)
    await db.execute(query.values(revoked_at=utc_now_naive()))
    await db.commit()


def set_session_cookie(response, token: str) -> None:
    """Set the ziru_session cookie on an HTTP response."""
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.SESSION_TTL_DAYS * 86400,
        httponly=True,
        samesite="lax",
        secure=settings.SESSION_COOKIE_SECURE,
        path="/",
    )


def clear_session_cookie(response) -> None:
    """Clear the ziru_session cookie on an HTTP response."""
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
