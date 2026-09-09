"""Pure numbering-first outline helpers (shared by worker + API).

Single source of truth for:
- numbering-prefix extraction / depth (``num_key``, ``numeric_depth``)
- deterministic heading level assignment (``build_outline``)
- the post-parse outline-sanity score (``outline_sanity_from_rows``)

These are pure (regex + collections only) so both the worker's parser and the
API's backfill can compute an honest quality score from a document's published
section tree without an LLM / MinerU.
"""
from __future__ import annotations

import re
from typing import Any

# ── numbering-prefix extraction ──────────────────────────────────────────────

_NUMERIC_RE = re.compile(r"^(\d+(?:\.\d+)*)\.?\s*")
_CHAPTER_RE = re.compile(
    r"^(?:chapter|chap\.|第[一二三四五六七八九十百千万\d]+(?:章|节|部分|条|篇|卷))"
    r"[\s:.\-]*(?:\S*\s+)?([0-9]{1,3})\b",
    re.I,
)
_LETTER_RE = re.compile(r"^[\(\（]\s*([a-zA-Z])\s*[\)\）]")
_ROMAN_RE = re.compile(
    r"^[\(\（]\s*(iv|ix|vi|v|x{0,3}|i{1,3}|xi|xiv)\s*[\)\）]", re.I
)
# Annex / Appendix / Attachment / Schedule <label> — top-level lettered sections.
_ANNEX_RE = re.compile(r"^(annex|appendix|attachment|schedule)\s+([A-Za-z0-9]+)", re.I)

_BANNER_RE = re.compile(
    r"^(\(?(restricted|confidential|unclassified|internal|private)\)?"
    r"|table of contents|contents|copy\s*right|revision history|version"
    r"|document control|acknowledgements?|foreword|attachment)$",
    re.I,
)
_BANNER_PREFIX_RE = re.compile(
    r"^\(?(restricted|confidential|unclassified|internal|private)\s*\)?[\s:\-.]+",
    re.I,
)


def strip_md(line: str) -> str:
    """Strip leading markdown heading/bold markers and a banner prefix."""
    s = (line or "").strip()
    s = re.sub(r"^#+\s*", "", s)
    s = re.sub(r"^[*_]{2,3}\s*", "", s)
    s = _BANNER_PREFIX_RE.sub("", s)
    return s.strip()


def is_banner_heading(text: str) -> bool:
    """True when the (stripped) heading is a classification banner / TOC marker."""
    t = strip_md(text).strip(" .:")
    if not t:
        return True
    return bool(_BANNER_RE.search(t))


def num_key(text: str) -> tuple[str, str] | None:
    """Return ``(kind, key)`` for a leading numbering, else None.
    kind: 'n' numeric, 'l' letter, 'r' roman.  '5.' -> ('n','5'), '(a)' -> ('l','a').
    """
    t = strip_md(text)
    if not t:
        return None
    m = _ANNEX_RE.match(t)
    if m:
        return ("a", m.group(2).lower())
    m = _ROMAN_RE.match(t)
    if m:
        return ("r", m.group(1).lower())
    m = _LETTER_RE.match(t)
    if m:
        return ("l", m.group(1).lower())
    m = _CHAPTER_RE.match(t)
    if m:
        return ("n", m.group(1))
    m = _NUMERIC_RE.match(t)
    if m:
        return ("n", m.group(1))
    return None


def numeric_depth(key: str) -> int:
    """Number of dot-separated numeric segments ('2.1' -> 2, '5' -> 1)."""
    return len(str(key).split("."))


def _is_prefix(a: tuple[int, ...], b: tuple[int, ...]) -> bool:
    return len(a) <= len(b) and b[: len(a)] == a


def build_outline(texts: list[str]) -> list[tuple[int, Any, str]]:
    """Assign an absolute level per heading from its numbering prefix.

    Returns ``[(level, key, text)]``. Banner headings -> level -1. Non-numbered
    headings (a number dropped by MinerU) are placed at the parent level of the
    next numbered heading (best effort).
    """
    stack: list[dict[str, Any]] = []
    keys = [num_key(t) for t in texts]
    out: list[tuple[int, Any, str]] = []

    for i, txt in enumerate(texts):
        k = keys[i]
        if is_banner_heading(txt):
            out.append((-1, k, txt))
            continue
        if k is None:
            lvl: int | None = None
            for j in range(i + 1, min(i + 5, len(keys))):
                nk = keys[j]
                if nk and nk[0] == "n":
                    lvl = int(max(1, numeric_depth(nk[1]) - 1))
                    break
            if lvl is None:
                lvl = len(stack) if stack else 1
            out.append((int(lvl), k, txt))
            continue

        kind, key = k
        if kind == "a":
            # Annex/Appendix/Schedule: a top-level section (sibling of chapters).
            while stack:
                stack.pop()
            stack.append({"kind": "a", "seg": key})
        elif kind == "n":
            segs = tuple(int(s) for s in str(key).split("."))
            depth = len(segs)
            while stack and (
                len(stack[-1]["seg"]) >= depth
                or (stack[-1]["kind"] == "n" and not _is_prefix(stack[-1]["seg"], segs))
                or stack[-1]["kind"] != "n"
            ):
                stack.pop()
            stack.append({"kind": "n", "seg": segs})
        elif kind == "l":  # letter item: sibling of other letters under the numeric parent
            while stack and stack[-1]["kind"] in ("l", "r"):
                stack.pop()
            stack.append({"kind": "l", "seg": key})
        else:  # roman item: sibling of other romans; child of letter/numeric parent
            while stack and stack[-1]["kind"] == "r":
                stack.pop()
            stack.append({"kind": "r", "seg": key})
        out.append((len(stack), k, txt))
    return out


def outline_sanity_from_rows(rows: list[dict[str, Any]]) -> tuple[float, dict[str, Any]]:
    """Score an ordered heading list against its numbering.

    ``rows`` = ordered ``[{"level": <detected>, "heading": "…"}, ...]``.
    Returns ``(score, result)`` where score is the fraction of numbered headings
    whose detected level matches the numbering depth, and result carries counts /
    samples / a parse_hint.
    """
    texts = [str(r.get("heading", "")) for r in rows]
    expected = build_outline(texts)
    expected_by_idx = {i: (lvl, key) for i, (lvl, key, _t) in enumerate(expected)}

    n = 0
    ok = 0
    anomalies: list[dict[str, Any]] = []
    banner_count = 0
    for i, row in enumerate(rows):
        got = row.get("level")
        exp, key = expected_by_idx.get(i, (-1, None))
        if key is not None:
            n += 1
            if isinstance(got, int) and got == exp:
                ok += 1
            else:
                anomalies.append(
                    {
                        "idx": i,
                        "heading": str(row.get("heading", ""))[:60],
                        "got": got,
                        "expected": exp,
                    }
                )
        elif exp == -1 and is_banner_heading(str(row.get("heading", ""))):
            banner_count += 1

    score = (ok / n) if n else 1.0
    result: dict[str, Any] = {
        "score": round(score, 4),
        "n_headings": n,
        "n_anomalies": len(anomalies),
        "n_banners": banner_count,
        "anomaly_samples": anomalies[:10],
        "parse_hint": "low_quality" if score < 0.85 else "ok",
    }
    return score, result


def _top_level_number_gaps(
    resolved: list[tuple[int, Any, str]],
) -> tuple[int, list[str]]:
    """Count missing values in an otherwise-consecutive run of top-level numbers.

    Looks only at single-segment numeric headings that ``build_outline`` placed at
    absolute level 1 (e.g. ``1``, ``2``, ``3`` … chapter/section numbers). A gap
    (e.g. ``1,2,4``) is a cheap, deterministic hint that a whole heading may have
    been dropped by the extractor and thus needs re-detection. Values with letter
    / roman / annex numbering are ignored and duplicates are collapsed.
    """
    nums: list[int] = []
    for lvl, key, _txt in resolved:
        if lvl == 1 and key and key[0] == "n":
            s = str(key[1])
            if s.isdigit():
                nums.append(int(s))
    if len(nums) < 3:
        return 0, []
    nums = sorted(set(nums))
    missing: list[int] = []
    for a, b in zip(nums, nums[1:]):
        if b - a > 1:
            missing.extend(range(a + 1, b))
    return len(missing), [str(m) for m in missing][:10]


def detection_quality_from_rows(
    rows: list[dict[str, Any]], threshold: float = 0.85
) -> dict[str, Any]:
    """Detection-quality / "does this actually need VLM" hint from an ordered list.

    ``rows`` = ordered ``[{"level": <detected>, "heading": "…"}, ...]``. On top of
    the plain outline-sanity score this reports whether the numbering-first
    resolver alone can recover a healthy tree, and whether a top-level heading
    number looks missing. ``detection`` is one of:

    - ``ok`` — raw score already at/above threshold; no action.
    - ``resolver_recoverable`` — raw score is low, but re-deriving levels from the
      numbering pulls it back to threshold. The problem was level assignment only,
      so there is no need to re-run MinerU/VLM (a resolver re-pass suffices).
    - ``needs_vlm`` — even re-derived levels cannot produce a clean tree and/or a
      top-level chapter number appears missing, i.e. the heading *set* is suspect
      and re-detection (VLM) is worth trying.

    The result is a heuristic hint, not a verdict: it measures the *numbered*
    heading sequence, so a body paragraph that only *looks* like a lettered item
    (e.g. ``(c) the materials must be reproduced…``) is not flagged — that needs
    semantic judgment and stays on the manual gate.
    """
    score, result = outline_sanity_from_rows(rows)
    texts = [str(r.get("heading", "")) for r in rows]
    resolved = build_outline(texts)
    resolver_rows = [{"level": lvl, "heading": txt} for (lvl, _key, txt) in resolved]
    resolver_score, _res = outline_sanity_from_rows(resolver_rows)
    gaps, gap_samples = _top_level_number_gaps(resolved)

    # A top-level number gap is *often* legitimate (e.g. a document simply has no
    # such section) — OG.pdf genuinely has no chapters 4/8/12/16 even though 8
    # and 12 are cross-referenced in prose. So gaps are reported as information
    # and never flip the verdict on their own. ``needs_vlm`` fires only when even
    # the numbering-first resolver cannot produce a clean tree (the heading *set*
    # itself is unusable).
    needs_vlm = resolver_score < threshold

    if needs_vlm:
        detection = "needs_vlm"
    elif score >= threshold:
        detection = "ok"
    else:
        detection = "resolver_recoverable"

    result.update(
        {
            "score": score,
            "resolver_score": round(resolver_score, 4),
            "recoverable": detection in ("ok", "resolver_recoverable"),
            "detection": detection,
            "needs_vlm": detection == "needs_vlm",
            "missing_chapters": gaps,
            "missing_chapter_samples": gap_samples,
        }
    )
    return result
