"""
Frozen dataclasses for the rate limiting domain.

These are immutable value objects shared across the rate limiting package.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class CurrentUser:
    """Identifies the current authenticated user."""

    user_id: str


@dataclass(frozen=True)
class RouteAdmissionContext:
    """HTTP route facts needed by the Job Admission workflow."""

    method: str
    path: str
    limit_identifier: str


@dataclass(frozen=True)
class SystemLimitRule:
    """
    A system-level rate-limit rule that matches HTTP method + path pattern.

    Rules are sorted by priority ascending; first match wins.
    """

    method: str
    api_pattern: str
    priority: int
    limit: int
    period: str = "minute"
