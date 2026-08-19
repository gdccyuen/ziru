"""Session-cookie authentication dependencies (P2/Q27)."""

from __future__ import annotations

from dataclasses import dataclass

from app.services.auth.session_service import (
    SESSION_COOKIE_NAME,
    resolve_session,
)
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.database import get_db
from shared.core.exceptions.domain_exceptions import (
    AuthException,
    PasswordChangeRequiredException,
)
from shared.models.database.user import User

# Endpoints that must stay reachable while must_change_password is True.
PASSWORD_CHANGE_EXEMPT_PATHS = frozenset(
    {
        "/v1/auth/change-password",
        "/v1/auth/logout",
        "/v1/auth/me",
    }
)


@dataclass(frozen=True)
class SessionAuth:
    """An authenticated browser session: the user row plus the raw token."""

    user: User
    token: str


async def get_session_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> SessionAuth:
    """Authenticate a request via the ziru_session cookie only."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise AuthException(user_message="Authentication required")
    user = await resolve_session(db, token)
    if user is None:
        raise AuthException(user_message="Authentication required")
    return SessionAuth(user=user, token=token)


async def require_session(
    request: Request,
    auth: SessionAuth = Depends(get_session_user),
) -> SessionAuth:
    """Require a session and enforce the password-change gate.

    Rejects with 403 PASSWORD_CHANGE_REQUIRED on every endpoint except
    change-password / logout / me while the account must change its password.
    """
    route = request.scope.get("route")
    route_path = getattr(route, "path", None)
    if isinstance(route_path, str):
        exempt = route_path in PASSWORD_CHANGE_EXEMPT_PATHS
    else:
        exempt = request.url.path in PASSWORD_CHANGE_EXEMPT_PATHS
    if auth.user.must_change_password and not exempt:
        raise PasswordChangeRequiredException()
    return auth
