"""Unit tests for query-side spelling normalization."""

from shared.services.retrieval.query_normalization import normalize_query


def test_wifi_variant_rewrites_to_wi_fi() -> None:
    normalized, rewrites = normalize_query("tell me how to do with wifi")
    assert "wi-fi" in normalized
    assert rewrites == {"wifi": "wi-fi"}


def test_hyphenated_query_is_unchanged() -> None:
    normalized, rewrites = normalize_query("Wi-Fi security policy")
    assert "wi-fi" in normalized.lower()
    assert rewrites == {}


def test_plain_query_untouched() -> None:
    normalized, rewrites = normalize_query("quarterly report review")
    assert normalized == "quarterly report review"
    assert rewrites == {}


def test_word_boundary_respected() -> None:
    normalized, rewrites = normalize_query("mywifi is fast")
    assert "mywifi" in normalized
    assert rewrites == {}


def test_wifi6_variant() -> None:
    normalized, _ = normalize_query("wifi6 access points")
    assert "wi-fi 6" in normalized
