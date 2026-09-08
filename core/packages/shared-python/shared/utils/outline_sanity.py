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
        if kind == "n":
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
