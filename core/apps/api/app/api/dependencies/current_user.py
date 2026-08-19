"""FastAPI current-user dependency adapters."""

from dataclasses import replace
from typing import AsyncGenerator

from app.api.dependencies.auth import get_current_user_id
from app.api.dependencies.route_admission import get_route_admission_context
from app.api.dependencies.session_auth import PASSWORD_CHANGE_EXEMPT_PATHS
from app.services.rate_limit.data_structures import (
    CurrentUser,
    RouteAdmissionContext,
)
from app.services.rate_limit.job_admission_service import JobAdmissionService
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.database import get_db
from shared.core.exceptions.domain_exceptions import (
    AuthException,
    PasswordChangeRequiredException,
    PermissionDeniedException,
)
from shared.models.database.user import (
    GRADE_ADMINISTRATOR,
    GRADE_LIBRARIAN,
    User,
)

_job_admission_service = JobAdmissionService()


def _is_password_change_exempt(request: Request) -> bool:
    route = request.scope.get("route")
    route_path = getattr(route, "path", None)
    if isinstance(route_path, str):
        return route_path in PASSWORD_CHANGE_EXEMPT_PATHS
    return request.url.path in PASSWORD_CHANGE_EXEMPT_PATHS


async def with_current_user(
    request: Request,
    route_context: RouteAdmissionContext = Depends(get_route_admission_context),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> AsyncGenerator[CurrentUser, None]:
    """Resolve the current user with live account facts (P2/Q10).

    Loads the User row on every request: missing or disabled accounts are
    rejected and the live grade/profile are attached to CurrentUser. Session-
    cookie authentication additionally enforces the password-change gate
    (must_change_password) except on the exempt auth endpoints.
    """
    current_user = await _job_admission_service.resolve_current_user(
        route_context=route_context,
        user_id=user_id,
        db=db,
    )
    user = await db.get(User, current_user.user_id)
    if user is None or user.disabled:
        raise AuthException(user_message="Invalid authentication credentials")

    auth_source = getattr(request.state, "auth_source", None)
    if (
        auth_source == "session"
        and user.must_change_password
        and not _is_password_change_exempt(request)
    ):
        raise PasswordChangeRequiredException()

    yield replace(current_user, grade=user.grade, profile=user.profile)


async def require_admin(
    current_user: CurrentUser = Depends(with_current_user),
) -> CurrentUser:
    """Reject callers whose live grade is not administrator."""
    if current_user.grade != GRADE_ADMINISTRATOR:
        raise PermissionDeniedException(
            user_message="Administrator access required",
            required_permission=GRADE_ADMINISTRATOR,
        )
    return current_user


async def require_librarian_or_admin(
    current_user: CurrentUser = Depends(with_current_user),
) -> CurrentUser:
    """Reject callers whose live grade is not librarian or administrator."""
    if current_user.grade not in (GRADE_LIBRARIAN, GRADE_ADMINISTRATOR):
        raise PermissionDeniedException(
            user_message="Librarian or administrator access required",
            required_permission=GRADE_LIBRARIAN,
        )
    return current_user
