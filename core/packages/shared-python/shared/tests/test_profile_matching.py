"""Unit tests for profile-based access control (fail-closed)."""

import pytest

from shared.services.profile import (
    BUILTIN_ATTRIBUTE_KEYS,
    attributes_to_multimap,
    constraint_matches,
    normalize_profile,
    profile_matches,
)


def _attrs(**kwargs):
    return {k: list(v) for k, v in kwargs.items()}


def test_empty_profile_matches_nothing():
    assert profile_matches([], {"division": ["finance"]}) is False


def test_matching_single_constraint():
    profile = normalize_profile([{"key": "division", "values": ["finance"]}])
    assert profile_matches(profile, _attrs(division=["finance"])) is True


def test_missing_attribute_is_invisible():
    profile = normalize_profile([{"key": "division", "values": ["finance"]}])
    assert profile_matches(profile, _attrs(region=["apac"])) is False


def test_multi_value_document_matches_any():
    profile = normalize_profile([{"key": "division", "values": ["finance"]}])
    assert profile_matches(profile, _attrs(division=["sales", "finance"])) is True


def test_profile_allows_several_values_for_key():
    profile = normalize_profile([{"key": "division", "values": ["finance", "sales"]}])
    assert profile_matches(profile, _attrs(division=["sales"])) is True


def test_every_constraint_must_match():
    profile = normalize_profile(
        [
            {"key": "division", "values": ["finance"]},
            {"key": "region", "values": ["apac"]},
        ]
    )
    attrs = _attrs(division=["finance"], region=["emea"])
    assert profile_matches(profile, attrs) is False
    attrs["region"] = ["apac"]
    assert profile_matches(profile, attrs) is True


def test_normalize_rejects_missing_key():
    with pytest.raises(ValueError):
        normalize_profile([{"values": ["finance"]}])


def test_normalize_rejects_empty_values():
    with pytest.raises(ValueError):
        normalize_profile([{"key": "division", "values": []}])


def test_attributes_to_multimap_groups_values():
    rows = [("division", "finance"), ("division", "sales"), ("region", "apac")]
    mm = attributes_to_multimap(rows)
    assert mm == {"division": ["finance", "sales"], "region": ["apac"]}


def test_constraint_matches_multimap():
    c = normalize_profile([{"key": "division", "values": ["finance"]}])[0]
    assert constraint_matches(c, {"division": ["sales", "finance"]}) is True
    assert constraint_matches(c, {"division": ["sales"]}) is False
    assert constraint_matches(c, {}) is False


def test_builtin_keys_are_not_dictionary_managed():
    assert BUILTIN_ATTRIBUTE_KEYS == ("createBy", "createTime")
