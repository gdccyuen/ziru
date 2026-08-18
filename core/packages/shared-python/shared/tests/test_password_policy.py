"""Unit tests for the configurable password policy (Q23)."""

from shared.services.password_policy import (
    DEFAULT_BOOTSTRAP_PASSWORD,
    DEFAULT_POLICY,
    PasswordPolicy,
)


def test_default_policy_accepts_complex_password():
    assert DEFAULT_POLICY.is_valid("Str0ng!Passw0rd")


def test_default_policy_rejects_short_password():
    assert not DEFAULT_POLICY.is_valid("Ab1!")


def test_default_policy_requires_upper_lower_digit():
    assert not DEFAULT_POLICY.is_valid("abcdefgh")  # no upper, no digit
    assert not DEFAULT_POLICY.is_valid("ABCDEFGH")  # no lower, no digit
    assert not DEFAULT_POLICY.is_valid("Abcdefgh")  # no digit
    assert DEFAULT_POLICY.is_valid("Abcdefg1")


def test_default_policy_rejects_bootstrap_password():
    violations = DEFAULT_POLICY.violations(DEFAULT_BOOTSTRAP_PASSWORD)
    assert any("disallowed" in v for v in violations)
    assert not DEFAULT_POLICY.is_valid(DEFAULT_BOOTSTRAP_PASSWORD)


def test_policy_can_require_symbol():
    strict = PasswordPolicy(require_symbol=True, disallowed_values=())
    assert strict.is_valid("Abcdefg1!")
    assert not strict.is_valid("Abcdefg1")


def test_policy_can_relax_requirements():
    relaxed = PasswordPolicy(
        require_uppercase=False,
        require_lowercase=False,
        require_digit=False,
        disallowed_values=(),
    )
    assert relaxed.is_valid("anythinggoes")


def test_violations_are_human_readable():
    v = PasswordPolicy(min_length=12, disallowed_values=()).violations("Ab1")
    assert any("12 characters" in msg for msg in v)
