"""Admin user management service (P2, Q24/Q26)."""

from __future__ import annotations

import secrets
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.exceptions.domain_exceptions import (
    ConflictException,
    NotFoundException,
    ValidationException,
)
from shared.models.database.external_identity_link import ExternalIdentityLink
from shared.models.database.user import GRADES, User
from shared.services.password import hash_password
from shared.services.profile import normalize_profile

from app.services.auth.session_service import revoke_user_sessions


def _normalize_profile_or_raise(profile: list[dict[str, Any]]) -> list[dict[str, Any]]:
    try:
        constraints = normalize_profile(profile)
    except ValueError as exc:
        raise ValidationException(
            user_message="Invalid profile",
            violations=[{"field": "profile", "description": str(exc)}],
        )
    return [{"key": c.key, "values": list(c.values)} for c in constraints]


def _validation_422(user_message: str, field: str) -> ValidationException:
    exc = ValidationException(
        user_message=user_message,
        violations=[{"field": field, "description": user_message}],
    )
    exc.http_status_code = 422
    return exc


def _validate_grade_or_raise(grade: str) -> None:
    if grade not in GRADES:
        raise ValidationException(
            user_message="Invalid grade",
            violations=[
                {"field": "grade", "description": f"grade must be one of {GRADES}"}
            ],
        )


class UserAdminService:
    """Create/list/read/update users; disable instead of delete (Q24)."""

    async def create_user(
        self,
        db: AsyncSession,
        *,
        email: str,
        password: str,
        grade: str,
        profile: list[dict[str, Any]] | None = None,
        sso_provider: str | None = None,
        sso_subject: str | None = None,
    ) -> User:
        normalized_email = email.strip().lower() if email else None
        sso_provided = bool(sso_provider and sso_subject)
        if not normalized_email and not sso_provided:
            raise _validation_422(
                "email is required unless SSO provider and subject are provided",
                "email",
            )
        if normalized_email and not password:
            raise _validation_422("password is required for email accounts", "password")
        if not normalized_email:
            # SSO-only accounts may omit email; derive a deterministic
            # placeholder so the unique email column stays populated.
            normalized_email = f"sso-{sso_provider}-{sso_subject}@ziru.local"
        _validate_grade_or_raise(grade)

        existing = await db.scalar(
            select(User).where(User.email == normalized_email).limit(1)
        )
        if existing is not None:
            raise ConflictException(
                user_message="A user with this email already exists",
                reason="ALREADY_EXISTS",
                resource="User",
                resource_id=str(existing.id),
            )

        normalized_profile = None
        if profile is not None:
            normalized_profile = _normalize_profile_or_raise(profile)

        user = User(
            email=normalized_email,
            password_hash=hash_password(password) if password else hash_password(secrets.token_urlsafe(32)),
            grade=grade,
            profile=normalized_profile,
            must_change_password=bool(password),
        )
        db.add(user)
        await db.flush()

        if sso_provider and sso_subject:
            existing_link = await db.scalar(
                select(ExternalIdentityLink)
                .where(
                    ExternalIdentityLink.provider == sso_provider,
                    ExternalIdentityLink.provider_subject == sso_subject,
                )
                .limit(1),
            )
            if existing_link is not None:
                raise ConflictException(
                    user_message="This SSO identity is already linked to an account",
                    reason="ALREADY_EXISTS",
                    resource="ExternalIdentityLink",
                )
            db.add(
                ExternalIdentityLink(
                    user_id=user.id,
                    provider=sso_provider,
                    provider_subject=sso_subject,
                )
            )

        await db.commit()
        await db.refresh(user)
        return user

    async def list_users(
        self,
        db: AsyncSession,
        *,
        page: int,
        page_size: int,
    ) -> tuple[list[User], int]:
        total = await db.scalar(select(func.count()).select_from(User))
        result = await db.execute(
            select(User)
            .order_by(User.created_at.desc(), User.email.asc())
            .offset((page - 1) * page_size)
            .limit(page_size),
        )
        return list(result.scalars().all()), int(total or 0)

    async def get_user(self, db: AsyncSession, user_id: str) -> User:
        user = await db.get(User, user_id)
        if user is None:
            raise NotFoundException(resource="User", resource_id=user_id)
        return user

    async def update_user(
        self,
        db: AsyncSession,
        user_id: str,
        *,
        grade: str | None = None,
        profile: list[dict[str, Any]] | None = None,
        disabled: bool | None = None,
        reset_password: bool = False,
    ) -> tuple[User, str | None]:
        """Apply admin updates; returns (user, temporary_password | None)."""
        user = await self.get_user(db, user_id)
        if grade is not None:
            _validate_grade_or_raise(grade)
            user.grade = grade
        if profile is not None:
            user.profile = _normalize_profile_or_raise(profile)
        if disabled is not None:
            user.disabled = disabled
            if disabled:
                await revoke_user_sessions(db, user_id)
        temporary_password = None
        if reset_password:
            temporary_password = secrets.token_urlsafe(12)
            user.password_hash = hash_password(temporary_password)
            user.must_change_password = True
        await db.commit()
        await db.refresh(user)
        return user, temporary_password


_user_admin_service = UserAdminService()


def get_user_admin_service() -> UserAdminService:
    """Return the process-wide user admin service."""
    return _user_admin_service