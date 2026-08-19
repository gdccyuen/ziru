"""Bootstrap administrator creation (P2, Q3).

Runs in the API lifespan after migrations and before serving: when the
``users`` table is empty the process creates a single administrator
account with a configurable password. Idempotent by construction.
"""

from __future__ import annotations

from loguru import logger
from sqlalchemy import func, select

from shared.core.config import settings
from shared.core.database import get_db_context
from shared.models.database.user import GRADE_ADMINISTRATOR, User
from shared.services.password import hash_password
from shared.services.password_policy import DEFAULT_BOOTSTRAP_PASSWORD


async def ensure_bootstrap_admin() -> None:
    """Create the bootstrap administrator when the users table is empty."""
    email = settings.ADMIN_BOOTSTRAP_EMAIL.strip().lower()
    password = settings.ADMIN_BOOTSTRAP_PASSWORD
    if not email or not password:
        raise RuntimeError(
            "ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD must both be set"
        )

    async with get_db_context() as session:
        user_count = await session.scalar(select(func.count()).select_from(User))
        if user_count:
            return

        session.add(
            User(
                email=email,
                password_hash=hash_password(password),
                grade=GRADE_ADMINISTRATOR,
                must_change_password=True,
            )
        )
        await session.flush()

    if password == DEFAULT_BOOTSTRAP_PASSWORD:
        logger.warning(
            "BOOTSTRAP ADMIN created with the DEFAULT password - change it immediately via POST /api/v1/auth/change-password (email={})",
            email,
        )
    else:
        logger.info("Bootstrap administrator created (email={})", email)
