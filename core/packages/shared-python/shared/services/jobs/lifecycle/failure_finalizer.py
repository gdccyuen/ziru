from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from loguru import logger
from sqlalchemy.orm import Session

from shared.core.response import build_standard_error_response
from shared.core.state_machine.service_sync import SyncStateMachineService
from shared.services.jobs.lifecycle.post_commit_effects import PostCommitEffectPlan
from shared.services.jobs.lifecycle.webhook_outbox import SyncJobWebhookOutbox
from shared.utils.error_details import normalize_error_details


@dataclass(frozen=True)
class JobFailureFinalization:
    succeeded: bool
    post_commit_effects: PostCommitEffectPlan


class SyncJobFailureFinalizer:
    """Finalize failed Jobs inside the lifecycle transaction."""

    def __init__(
        self,
        *,
        state_machine: SyncStateMachineService | None = None,
        webhook_outbox: SyncJobWebhookOutbox | None = None,
    ) -> None:
        self._state_machine = state_machine or SyncStateMachineService()
        self._webhook_outbox = webhook_outbox or SyncJobWebhookOutbox()

    def finalize(
        self,
        db: Session,
        *,
        job_id: str,
        error_message: str,
        error_code: str,
        error_details: dict[str, Any] | None,
    ) -> JobFailureFinalization:
        transition_outcome = self._state_machine.mark_failed_outcome(
            db,
            job_id,
            error_message,
            error_code=error_code,
            error_details=error_details,
        )
        if not transition_outcome.succeeded:
            logger.error(
                f"Job {job_id} mark_failed transition failed: "
                f"reason={transition_outcome.reason}"
            )
            return JobFailureFinalization(
                succeeded=False,
                post_commit_effects=PostCommitEffectPlan.none(),
            )

        normalized_error_details = normalize_error_details(error_details)
        webhook_event = self._webhook_outbox.create_event(
            db,
            job_id=job_id,
            event_type="job.failed",
            extra_payload={
                "error": build_standard_error_response(
                    code=error_code,
                    message=error_message,
                    request_id=job_id,
                    details=normalized_error_details,
                ),
            },
        )
        return JobFailureFinalization(
            succeeded=True,
            post_commit_effects=PostCommitEffectPlan.from_failure(
                webhook_event_id=webhook_event.event_id if webhook_event else None,
            ),
        )
