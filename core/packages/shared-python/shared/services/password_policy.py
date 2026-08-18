"""Configurable password policy (Q23).

The policy is a small declarative module so deployments can enforce richer
rules (length, case, digits, symbols, disallowed values) without code
changes. The default policy matches the bootstrap flow: at least 8
characters, upper+lower+digit, and not equal to the default admin password.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

# The bootstrap default admin password (Q3); policies should forbid it.
DEFAULT_BOOTSTRAP_PASSWORD = "P@ss202607"


@dataclass(frozen=True)
class PasswordPolicy:
    """Rule set for password validation."""

    min_length: int = 8
    require_uppercase: bool = True
    require_lowercase: bool = True
    require_digit: bool = True
    require_symbol: bool = False
    disallowed_values: Sequence[str] = field(default_factory=tuple)

    def violations(self, password: str) -> list[str]:
        """Return human-readable rule violations (empty list = valid)."""
        problems: list[str] = []
        if len(password) < self.min_length:
            problems.append(f"at least {self.min_length} characters")
        if self.require_uppercase and not any(ch.isupper() for ch in password):
            problems.append("an uppercase letter")
        if self.require_lowercase and not any(ch.islower() for ch in password):
            problems.append("a lowercase letter")
        if self.require_digit and not any(ch.isdigit() for ch in password):
            problems.append("a digit")
        if self.require_symbol and not any(not ch.isalnum() for ch in password):
            problems.append("a symbol")
        if any(password == banned for banned in self.disallowed_values):
            problems.append("a different password (must not match a disallowed value)")
        return problems

    def is_valid(self, password: str) -> bool:
        return not self.violations(password)


DEFAULT_POLICY = PasswordPolicy(
    disallowed_values=(DEFAULT_BOOTSTRAP_PASSWORD,)
)
