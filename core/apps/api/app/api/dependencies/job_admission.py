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

_job_admission_service = JobAdmissionService()


async def require_billing_limits(
    current_user: CurrentUser = Depends(with_current_user),
) -> AsyncGenerator[CurrentUser, None]:
    await _job_admission_service.enforce_billing_limits(current_user=current_user)
    yield current_user


async def require_route_system_limit(
    route_context: RouteAdmissionContext = Depends(get_route_admission_context),
) -> None:
    await _job_admission_service.enforce_route_system_limit(
        route_context=route_context,
    )
