"""Argon2id password hashing (P2, Q23).

Stored format: "argon2id$" + <argon2 PHC string>. Argon2id parameters
are tuned for interactive login: time_cost=2, memory_cost=19456 KiB,
parallelism=1 (or argon2-cffi defaults).
"""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_STORED_PREFIX = "argon2id$"

_password_hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)


def hash_password(password: str) -> str:
    """Hash a password with Argon2id and return the stored representation."""
    return _STORED_PREFIX + _password_hasher.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    """Verify a password against a stored hash; never raises on bad input."""
    if not isinstance(encoded, str) or not encoded.startswith(_STORED_PREFIX):
        return False
    phc_string = encoded[len(_STORED_PREFIX):]
    try:
        return _password_hasher.verify(phc_string, password)
    except (VerifyMismatchError, InvalidHashError, VerificationError):
        return False
