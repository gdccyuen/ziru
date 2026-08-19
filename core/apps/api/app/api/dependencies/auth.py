"""FastAPI authentication dependency adapters."""

from app.services.auth.current_user_authentication_service import (
    get_current_user_authentication_service,
)
from app.services.auth.dashboard_jwt_authentication_service import (
    FULL_ACCESS_PERMISSION,
    READ_ONLY_PERMISSION,
)
from app.services.auth.session_service import (
    SESSION_COOKIE_NAME,
    resolve_session,
)
from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.database import get_db
from shared.core.exceptions.domain_exceptions import (
    AuthException,
    PermissionDeniedException,
)


async def get_current_user_id(
    request: Request,
    authorization: str | None = Header(
        default=None,
        description="Bearer <token> OR internal signature auth",
    ),
    db: AsyncSession = Depends(get_db),
) -> str:
    """Authenticate the caller and return the current user ID.

    Authorization headers (API key / dashboard JWT) take precedence; a
    ``ziru_session`` cookie is accepted as a fallback so browser sessions
    can use the same endpoints (P2/Q27).
    """
    if authorization:
        identity = await get_current_user_authentication_service().authenticate_authorization_header_with_identity(
            db,
            authorization,
        )
        request.state.user_id = identity.user_id
        request.state.permission = identity.permission
        request.state.auth_source = identity.source
        return identity.user_id

    session_token = request.cookies.get(SESSION_COOKIE_NAME)
    if session_token:
        session_user = await resolve_session(db, session_token)
        if session_user is not None:
            request.state.user_id = session_user.id
            request.state.permission = FULL_ACCESS_PERMISSION
            request.state.auth_source = "session"
            return session_user.id

    raise AuthException(
        user_message="Authentication required. Provide Authorization header.",
    )


async def require_write_permission(
    request: Request,
    _user_id: str = Depends(get_current_user_id),
) -> None:
    """Reject write operations for read-only Dashboard tokens."""
    permission = getattr(request.state, "permission", FULL_ACCESS_PERMISSION)
    if permission != READ_ONLY_PERMISSION:
        return

    raise PermissionDeniedException(
        user_message="This token is read only.",
        required_permission=FULL_ACCESS_PERMISSION,
    )
