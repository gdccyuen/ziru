"""Outline Quality verdict tests over the ground-truth corpus shapes (ADR-0004)."""

from __future__ import annotations

from shared.utils.outline_sanity import assess_outline


def _rows(pairs: list[tuple[int, str]]) -> list[dict[str, object]]:
    return [{"level": level, "heading": heading} for level, heading in pairs]


def test_clean_numbering_tree_is_ok() -> None:
    verdict = assess_outline(
        _rows([(1, "1. Intro"), (2, "1.1 A"), (2, "1.2 B"), (1, "2. Next")])
    )
    assert verdict.verdict == "ok"
    assert verdict.score == 1.0
    assert verdict.resolver_score == 1.0


def test_misassigned_levels_are_resolver_recoverable() -> None:
    # The G3_EN shape: chapters sit one level too deep but the numbering is clean.
    verdict = assess_outline(
        _rows([(2, "1. Intro"), (3, "1.1 A"), (3, "1.2 B"), (2, "2. Next")])
    )
    assert verdict.verdict == "resolver_recoverable"
    assert verdict.score < 0.85
    assert verdict.resolver_score == 1.0


def test_legitimate_number_gaps_do_not_flip_the_verdict() -> None:
    # OG.pdf genuinely has no chapters 4/8/12/16: gaps stay informational.
    verdict = assess_outline(
        _rows(
            [
                (2, "Chapter 1 Introduction"),
                (2, "Chapter 2 Criteria"),
                (2, "Chapter 3 Scope"),
                (2, "Chapter 5 Review"),
            ]
        )
    )
    assert verdict.missing_chapters >= 1
    assert verdict.verdict == "resolver_recoverable"


def test_threshold_is_owned_by_the_module() -> None:
    # Two of three numbered headings are correctly levelled -> score ~0.667.
    rows = _rows([(1, "1. A"), (1, "2. B"), (3, "3. C")])
    assert assess_outline(rows, 0.6).verdict == "ok"
    assert assess_outline(rows, 0.9).verdict == "resolver_recoverable"


def test_verdict_serialises_for_the_document_payload() -> None:
    payload = assess_outline(_rows([(1, "1. A"), (2, "1.1 B")])).as_dict()
    assert payload["verdict"] == "ok"
    assert set(payload) == {
        "verdict",
        "score",
        "resolver_score",
        "n_headings",
        "n_anomalies",
        "missing_chapters",
        "anomaly_samples",
        "missing_chapter_samples",
    }
