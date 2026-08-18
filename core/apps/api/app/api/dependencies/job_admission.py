"""FastAPI adapters for the Job Admission workflow."""

from typing import AsyncGenerator

from app.api.dependencies.current_user import with_current_user
from app.api.dependencies.route_admission import get_route_admission_context
from app.services.rate_limit.data_structures import (
    CurrentUser,
    RouteAdmissionContext,
)
from app.services.rate_limit.job_admission_service import JobAdmissionService
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.database import get_db

_job_admission_service = JobAdmissionService()


async def require_job_capacity(
    current_user: CurrentUser = Depends(with_current_user),
    db: AsyncSession = Depends(get_db),
) -> AsyncGenerator[CurrentUser, None]:
    await _job_admission_service.enforce_job_capacity(
        db=db,
        current_user=current_user,
    )
    yield current_user


async def require_route_system_limit(
    route_context: RouteAdmissionContext = Depends(get_route_admission_context),
) -> None:
    await _job_admission_service.enforce_route_system_limit(
        route_context=route_context,
    )
