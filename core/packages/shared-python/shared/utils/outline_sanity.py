"""Pure numbering-first Outline Quality module (ADR-0004).

Single source of truth for:
- numbering-prefix extraction / depth (``num_key``, ``numeric_depth``)
- deterministic heading level assignment (``build_outline``)
- the Outline Verdict for a Document's published Document Sections
  (``assess_outline``)

Pure (regex + dataclasses only), so the API derives a Document's Outline Quality
on read from its published sections — no LLM, no MinerU, no stored copy.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
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


@dataclass(frozen=True)
class OutlineVerdict:
    """The assessed Outline Quality of one Document revision (ADR-0004)."""

    verdict: str  # "ok" | "resolver_recoverable" | "needs_vlm"
    score: float
    resolver_score: float
    n_headings: int
    n_anomalies: int
    missing_chapters: int
    anomaly_samples: list[dict[str, Any]]
    missing_chapter_samples: list[str]

    def as_dict(self) -> dict[str, Any]:
        return {
            "verdict": self.verdict,
            "score": self.score,
            "resolver_score": self.resolver_score,
            "n_headings": self.n_headings,
            "n_anomalies": self.n_anomalies,
            "missing_chapters": self.missing_chapters,
            "anomaly_samples": self.anomaly_samples,
            "missing_chapter_samples": self.missing_chapter_samples,
        }


def _score_rows(
    rows: list[dict[str, Any]],
) -> tuple[float, int, int, list[dict[str, Any]]]:
    """Score ordered headings against their numbering.

    Returns ``(score, n_headings, n_anomalies, anomaly_samples)`` where score is
    the fraction of numbered headings whose detected level matches the numbering
    depth.
    """
    texts = [str(r.get("heading", "")) for r in rows]
    expected = build_outline(texts)
    expected_by_idx = {i: (lvl, key) for i, (lvl, key, _t) in enumerate(expected)}

    n = 0
    ok = 0
    anomalies: list[dict[str, Any]] = []
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
    score = (ok / n) if n else 1.0
    return score, n, len(anomalies), anomalies[:10]


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


def assess_outline(
    rows: list[dict[str, Any]], threshold: float = 0.85
) -> OutlineVerdict:
    """Assess a Document's Outline Quality from its ordered Document Sections.

    ``rows`` = ordered ``[{"level": <detected>, "heading": "…"}, ...]``. Owns both
    the assessment and the verdict policy: callers render the verdict and never
    re-derive the threshold (ADR-0004). ``verdict`` is one of:

    - ``ok`` — the heading levels already match the numbering.
    - ``resolver_recoverable`` — the levels are mis-assigned but re-deriving them
      from the numbering restores a healthy hierarchy; no re-detection needed.
    - ``needs_vlm`` — even re-derived levels cannot produce a clean tree, so the
      heading set is suspect and re-detection is worth trying.

    Top-level number gaps are reported informationally and never flip the verdict
    on their own: a document may legitimately lack a numbered section (OG.pdf has
    no chapters 4/8/12/16 even though 8 and 12 are cross-referenced in prose).
    """
    score, n_headings, n_anomalies, anomaly_samples = _score_rows(rows)
    texts = [str(r.get("heading", "")) for r in rows]
    resolved = build_outline(texts)
    resolver_rows = [{"level": lvl, "heading": txt} for (lvl, _key, txt) in resolved]
    resolver_score, _n, _a, _s = _score_rows(resolver_rows)
    gaps, gap_samples = _top_level_number_gaps(resolved)

    if resolver_score < threshold:
        verdict = "needs_vlm"
    elif score >= threshold:
        verdict = "ok"
    else:
        verdict = "resolver_recoverable"

    return OutlineVerdict(
        verdict=verdict,
        score=round(score, 4),
        resolver_score=round(resolver_score, 4),
        n_headings=n_headings,
        n_anomalies=n_anomalies,
        missing_chapters=gaps,
        anomaly_samples=anomaly_samples,
        missing_chapter_samples=gap_samples,
    )
