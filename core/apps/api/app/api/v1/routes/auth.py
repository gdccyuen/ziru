"""Session auth endpoints (P2).

Registered under /auth (v1) next to the existing API-key management router.
"""

from __future__ import annotations

from typing import Any

from app.api.dependencies.session_auth import SessionAuth, require_session
from app.services.auth.login_throttle_service import LoginThrottleService
from app.services.auth.session_service import (
    clear_session_cookie,
    create_session,
    hash_token,
    revoke_session,
    revoke_user_sessions,
    set_session_cookie,
)
from app.services.auth.sso_oidc_service import get_sso_oidc_service
from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.config import settings
from shared.core.database import get_db
from shared.core.exceptions.domain_exceptions import (
    AuthException,
    NotImplementedException,
    PermissionDeniedException,
    ValidationException,
)
from shared.models.database.user import User
from shared.services.password import hash_password, verify_password
from shared.services.password_policy import DEFAULT_POLICY

router = APIRouter(tags=["Auth"])
_sso_oidc_service = get_sso_oidc_service()
_login_throttle = LoginThrottleService()


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=1)


def _user_payload(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "grade": user.grade,
        "profile": user.profile or [],
        "must_change_password": user.must_change_password,
        "disabled": user.disabled,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.post("/login", summary="Log in with email and password")
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Create a session and set the ziru_session cookie.

    Every failure (unknown email, wrong password, disabled account) returns
    the identical 401 so the endpoint does not disclose account existence.
    Failed attempts are throttled per account and per client IP; throttled
    requests return 429 with a Retry-After header.
    """
    email = payload.email.strip().lower()
    client_ip = request.client.host if request.client is not None else "unknown"
    await _login_throttle.check(email, client_ip)

    result = await db.execute(select(User).where(User.email == email).limit(1))
    user = result.scalar_one_or_none()
    if (
        user is None
        or not verify_password(payload.password, user.password_hash)
        or user.disabled
    ):
        await _login_throttle.record_failure(email, client_ip)
        raise AuthException(user_message="Invalid email or password")

    await _login_throttle.record_success(email)
    token = await create_session(db, user.id)
    set_session_cookie(response, token)
    return _user_payload(user)


@router.post("/logout", summary="Log out and revoke the current session")
async def logout(
    auth: SessionAuth = Depends(require_session),
    response: Response = Response(),
    db: AsyncSession = Depends(get_db),
):
    """Revoke the session and clear the cookie."""
    await revoke_session(db, auth.token)
    clear_session_cookie(response)
    return {"message": "Logged out"}


@router.get("/me", summary="Return the current session user")
async def me(
    auth: SessionAuth = Depends(require_session),
):
    """Return the authenticated user payload."""
    return _user_payload(auth.user)


@router.post("/change-password", summary="Change the current password")
async def change_password(
    payload: ChangePasswordRequest,
    auth: SessionAuth = Depends(require_session),
    db: AsyncSession = Depends(get_db),
):
    """Verify the old password, enforce the policy, and rotate the hash.

    All other sessions of the user are revoked; the current one survives.
    """
    if not verify_password(payload.old_password, auth.user.password_hash):
        raise AuthException(user_message="Incorrect current password")
    violations = DEFAULT_POLICY.violations(payload.new_password)
    if violations:
        raise ValidationException(
            user_message="New password does not meet the password policy",
            violations=[
                {"field": "new_password", "description": f"must contain {rule}"}
                for rule in violations
            ],
        )
    auth.user.password_hash = hash_password(payload.new_password)
    auth.user.must_change_password = False
    await revoke_user_sessions(
        db,
        auth.user.id,
        except_token_hash=hash_token(auth.token),
    )
    await db.commit()
    return {"message": "Password changed"}


@router.get("/sso/{provider}/start", summary="Start an SSO login")
async def sso_start(provider: str):
    """Redirect to the provider authorize endpoint (oidc only)."""
    if provider != "oidc" or not _sso_oidc_service.is_configured():
        raise NotImplementedException(
            user_message=f"SSO provider {provider!r} is not configured",
        )
    _, authorize_url = await _sso_oidc_service.start()
    from fastapi.responses import RedirectResponse

    return RedirectResponse(authorize_url, status_code=302)


@router.get("/sso/{provider}/callback", summary="Complete an SSO login")
async def sso_callback(
    provider: str,
    state: str = Query(...),
    code: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Exchange the code and start a session for a pre-linked identity."""
    if provider != "oidc" or not _sso_oidc_service.is_configured():
        raise NotImplementedException(
            user_message=f"SSO provider {provider!r} is not configured",
        )
    user = await _sso_oidc_service.complete(db, state=state, code=code)
    if user is None:
        raise PermissionDeniedException(
            user_message="SSO identity not linked to any account",
        )
    token = await create_session(db, user.id)
    from fastapi.responses import RedirectResponse

    redirect = RedirectResponse(settings.SSO_SUCCESS_REDIRECT, status_code=302)
    set_session_cookie(redirect, token)
    return redirect
